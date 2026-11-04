import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
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
if (process.env.CI) assert.ok(executablePath, 'CI requires PanResponder browser coverage')

// The story is the only place PanResponder runs in a browser, and it sat
// undraggable with its handlers on a plain `div` until #1678. Drag the
// story's own component, not a copy of it.
test('the PanResponder story drags its card and reports the gesture (#1678)', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import meta from './examples/storybook-demo/src/PanResponder.stories.tsx';
      const Story = meta.component; createRoot(document.querySelector('#root')).render(<Story/>);`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
  })
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    // No Tailwind here, so the card is given a size and room to move.
    await page.setContent(
      '<style>.relative{position:relative;height:300px}.absolute{position:absolute}</style><div id="root"></div>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const card = page.getByText('Drag me')
    await card.waitFor()
    const before = await card.boundingBox()
    await page.mouse.move(before.x + 5, before.y + 5)
    await page.mouse.down()
    for (let step = 1; step <= 10; step++)
      await page.mouse.move(before.x + 5 + step * 8, before.y + 5 + step * 3)
    const readout = (label) =>
      page.getByText(new RegExp(`^${label}: `)).evaluate((element) => element.textContent)
    assert.equal(await readout('dx'), 'dx: 80')
    assert.equal(await readout('dy'), 'dy: 30')
    assert.equal(await readout('touches'), 'touches: 1')
    await page.mouse.up()
    const after = await card.boundingBox()
    assert.deepEqual(
      { x: Math.round(after.x - before.x), y: Math.round(after.y - before.y) },
      { x: 80, y: 30 },
    )
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
