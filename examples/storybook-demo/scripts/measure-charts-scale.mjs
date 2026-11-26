// Where the SVG charts stop being enough (RFC 015 §8): the Canvas renderer
// was deferred until a measurement said at what size one element per mark
// costs too much. This draws Bar and Line charts of growing size in real
// Chrome and reports what a user waits for: the first drawing, and the step
// from one active datum to the next, which redraws the tooltip and makes React
// reconcile every mark again.
//
//   node scripts/measure-charts-scale.mjs [--json]
//
// Not a test and not in CI: the numbers depend on the machine. The doc
// that quotes them names the machine.

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (!executablePath) throw new Error('no Chrome found; set CHROME_PATH')

const SIZES = [100, 1_000, 5_000, 20_000]
const STEPS = 30

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {BarChart, LineChart, barChartModel} from './packages/charts/src/index.tsx';
    import {ChartTable} from './packages/charts/src/chart-table.tsx';
    const h = React.createElement;
    window.drawChart = (kind, n) => {
      const data = Array.from({length: n}, (_, i) => ({
        x: 'd' + i, a: 100 + 80 * Math.sin(i / 7), b: 60 + 40 * Math.cos(i / 11),
      }));
      const series = kind === 'line'
        ? [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}]
        : [{key: 'a', label: 'A'}];
      const Chart = kind === 'line' ? LineChart : BarChart;
      const container = document.querySelector('#root');
      const start = performance.now();
      // 'table' is the accessible table alone, as the chart builds it: the
      // part of the first draw that no renderer choice changes.
      const element = kind === 'table'
        ? h(ChartTable, {model: barChartModel({data, x: {key: 'x'}, series, width: 800, height: 300}), series, accessibilityLabel: 'Scale'})
        : h(Chart, {accessibilityLabel: 'Scale', data, x: {key: 'x'}, series, width: 800, height: 300});
      flushSync(() => createRoot(container).render(element));
      return start;
    };`,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    react: path.dirname(require.resolve('react/package.json')),
    'react-dom': path.dirname(require.resolve('react-dom/package.json')),
  },
})
const script = bundle.outputFiles[0].text

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const results = []
try {
  for (const kind of ['bar', 'line', 'table']) {
    for (const n of SIZES) {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><body style="margin:0"><div id="root"></div></body>')
      await page.addScriptTag({ content: script })
      // From the render call to the frame after the drawing: the time to
      // first chart, including style, layout and paint of every element.
      const firstDraw = await page.evaluate(
        ([kind, n]) =>
          new Promise((resolve) => {
            const start = window.drawChart(kind, n)
            requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)))
          }),
        [kind, n],
      )
      const elements = await page.evaluate(() => document.querySelectorAll('svg *').length)
      const cells = await page.evaluate(() => document.querySelectorAll('th, td').length)
      // One key press, then the frame after it: what an arrow key or a
      // pointer move costs once the chart is up.
      const steps =
        kind === 'table'
          ? [0]
          : await page.evaluate(async (count) => {
              const chart = document.querySelector('[aria-roledescription="chart"]')
              chart.focus()
              const times = []
              for (let i = 0; i < count; i++) {
                const start = performance.now()
                chart.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
                )
                await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
                times.push(performance.now() - start)
              }
              return times
            }, STEPS)
      const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
      results.push({
        kind,
        n,
        elements,
        cells,
        firstDrawMs: Math.round(firstDraw),
        stepMedianMs: Math.round(median(steps) * 10) / 10,
        stepMaxMs: Math.round(Math.max(...steps) * 10) / 10,
        heapMb: Math.round(heap / 1024 / 1024),
      })
      await page.close()
    }
  }
} finally {
  await browser.close()
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ machine: `${os.cpus()[0]?.model} x${os.cpus().length}`, results }))
} else {
  console.log(`${os.cpus()[0]?.model} x${os.cpus().length}, ${executablePath}`)
  console.log('kind  n       svg elements  table cells  first draw  step median  step max  heap')
  for (const r of results) {
    console.log(
      `${r.kind.padEnd(5)} ${String(r.n).padEnd(7)} ${String(r.elements).padEnd(13)} ${String(r.cells).padEnd(12)} ` +
        `${`${r.firstDrawMs} ms`.padEnd(11)} ${`${r.stepMedianMs} ms`.padEnd(12)} ` +
        `${`${r.stepMaxMs} ms`.padEnd(9)} ${r.heapMb} MB`,
    )
  }
}
