import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import Yoga from 'yoga-layout'

const require = createRequire(import.meta.url)
const { createElement, Fragment } = require('react')
const { act, create } = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const rootPath = fileURLToPath(new URL('../../../', import.meta.url))

async function nativeWindowedTable() {
  const bundle = await build({
    entryPoints: [path.join(rootPath, 'packages/patterns/src/windowed-table.native.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    conditions: ['react-native'],
    external: ['react', 'react/jsx-runtime', 'react-native'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (name) =>
      name === 'react-native'
        ? {
            View: 'View',
            Text: 'Text',
            ScrollView: 'ScrollView',
            FlatList: 'FlatList',
            Platform: { OS: 'android' },
          }
        : require(name),
    module,
    module.exports,
  )
  return module.exports.WindowedTable
}
const widths = [1, 8, 64]
const data = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }))
const columns = widths.map((width, index) => ({
  key: String(index),
  header: `Column ${index}`,
  width,
  getText: (row) => `Long value ${row.id}`,
}))

// Use the actual Native host tree with Yoga's own layout. Text metrics here
// are synthetic; this tests fixed geometry, not glyph shaping or font scaling.
function yogaTree(tree) {
  const node = Yoga.Node.create()
  const style = tree.props.style ?? {}
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.flexShrink === 'number') node.setFlexShrink(style.flexShrink)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (tree.type === 'Text')
    node.setMeasureFunc(() => ({ width: 1000, height: style.lineHeight ?? 24 }))
  else
    for (const child of tree.children ?? []) node.insertChild(yogaTree(child), node.getChildCount())
  return node
}

test('Native declared widths/heights survive oversized content and padding in real Yoga', async () => {
  const WindowedTable = await nativeWindowedTable()
  for (const rowHeight of [1, 4, 32, 64]) {
    let root, rows
    act(() => {
      root = create(
        createElement(WindowedTable, {
          data,
          columns,
          getRowKey: (row) => row.id,
          rowHeight,
          maxHeight: rowHeight * 2.5,
          accessibilityLabel: 'Geometry',
        }),
      )
    })
    const list = root.root.findByType('FlatList').props
    act(() => {
      rows = create(
        createElement(
          Fragment,
          null,
          list.ListHeaderComponent,
          list.renderItem({ item: data[0], index: 0 }),
        ),
      )
    })
    try {
      for (const tree of rows.toJSON()) {
        const node = yogaTree(tree)
        try {
          node.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR)
          assert.equal(node.getComputedHeight(), rowHeight)
          assert.deepEqual(
            widths.map((_, index) => node.getChild(index).getComputedWidth()),
            widths,
          )
          assert.deepEqual(
            widths.map((_, index) => node.getChild(index).getComputedLeft()),
            [0, 1, 9],
          )
        } finally {
          node.freeRecursive()
        }
      }
    } finally {
      act(() => {
        rows.unmount()
        root.unmount()
      })
    }
  }
})

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires WindowedTable browser geometry coverage')

test('Web preserves declared geometry, all semantic rows and scrolls in both directions', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {WindowedTable} from './packages/patterns/src/windowed-table.tsx';
        const root = createRoot(document.querySelector('#root'));
        window.mount = (rowHeight) => root.render(React.createElement(WindowedTable, {
          data: Array.from({length:100},(_,index)=>({id:String(index)})), getRowKey:row=>row.id,
          columns:[1,8,64].map((width,index)=>({key:String(index),header:'Column '+index,width,getText:row=>'Long value '+row.id})),
          rowHeight,maxHeight:rowHeight*2.5,accessibilityLabel:'Geometry'
        }));`,
      resolveDir: fileURLToPath(new URL('../../../', import.meta.url)),
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
  })
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><div id="root" style="width:20px"></div>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    for (const rowHeight of [1, 4, 32, 64]) {
      await page.evaluate((height) => window.mount(height), rowHeight)
      await page.waitForFunction(
        (height) => document.querySelector('th > div')?.getBoundingClientRect().height === height,
        rowHeight,
      )
      const actual = await page.evaluate(() => {
        const table = document.querySelector('table')
        const scroller = table.parentElement
        scroller.scrollTop = scroller.scrollLeft = 1e6
        return {
          width: table.getBoundingClientRect().width,
          viewport: scroller.getBoundingClientRect().height,
          rows: [...table.rows].map((row) => ({
            height: row.getBoundingClientRect().height,
            widths: [...row.cells].map((cell) => cell.getBoundingClientRect().width),
          })),
          scrollLeft: scroller.scrollLeft,
          scrollTop: scroller.scrollTop,
          last: table.rows[100].textContent,
        }
      })
      assert.equal(actual.width, 73)
      assert.equal(actual.viewport, rowHeight * 2.5)
      assert.equal(actual.rows.length, 101)
      for (const row of actual.rows) {
        assert.equal(row.height, rowHeight)
        assert.deepEqual(row.widths, widths)
      }
      assert.ok(actual.scrollLeft > 0 && actual.scrollTop > 0)
      assert.match(actual.last, /Long value 99/)
    }
  } finally {
    await browser.close()
  }
})
