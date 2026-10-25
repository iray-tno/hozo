import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import React, { act, createContext } from 'react'
import { create } from 'react-test-renderer'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)

test('published adapter subpaths bundle as pure data code without React or a highlighter', async () => {
  for (const entry of ['shiki', 'meta']) {
    const bundle = await build({
      stdin: {
        contents: `export * from '@hozo/typography/code/${entry}'`,
        resolveDir: path.join(root, 'packages/typography'),
      },
      bundle: true,
      write: false,
      metafile: true,
      minify: true,
      format: 'esm',
      platform: 'neutral',
    })
    const inputs = Object.keys(bundle.metafile.inputs).filter((file) => file !== '<stdin>')
    assert.ok(inputs.length > 0)
    assert.ok(
      inputs.every((file) => file.replaceAll('\\', '/').includes('packages/typography/dist/code/')),
      inputs.join('\n'),
    )
    assert.ok(!bundle.outputFiles[0].text.includes('react'))
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
if (process.env.CI) assert.ok(executablePath, 'CI requires code-block browser coverage')

test('overflow has a separate keyboard stop; wrapping, themes, raw copy and retired operations', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CodeBlock} from './packages/patterns/src/code-block.tsx';
      window.writes=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{writes.push(text); if(window.failCopy) throw Error('clipboard unavailable'); if(window.deferCopy) await new Promise(resolve=>window.finishCopy=resolve)}}});
      window.mount=(options={})=>{window.fixtureRoot??=createRoot(document.querySelector('#root')); window.fixtureRoot.render(React.createElement(CodeBlock,{title:'Changes',lines:[{tokens:'old',mark:'del'},{tokens:[{text:'new',color:{light:'#123456',dark:'#abcdef'}}],mark:'ins'},{tokens:'long '.repeat(100)}],lineNumbers:{start:10},copy:true,...options}));}; mount();`,
      resolveDir: root,
      loader: 'tsx',
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
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent(
      '<!doctype html><style>#root{width:240px}</style><div id="root"></div><button id="after">After</button>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const scroll = page.getByRole('region', { name: 'Code contents: Changes' })
    await scroll.waitFor()
    await page.waitForFunction(() => document.querySelector('[role=region]').tabIndex === 0)
    assert.equal(await scroll.locator('button').count(), 0)
    await scroll.focus()
    await scroll.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('[role=region]').scrollLeft > 0)
    await scroll.press('Tab')
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
      'Copy code',
    )
    const copy = page.getByRole('button', { name: 'Copy code' })
    const feedback = page.getByRole('status')
    await feedback.waitFor({ state: 'attached' })
    assert.equal(await feedback.textContent(), '')
    await feedback.evaluate((node) => {
      window.copyFeedbackRegion = node
    })
    await copy.click()
    await page.getByRole('status').filter({ hasText: 'Copied' }).waitFor()
    assert.deepEqual(await page.evaluate(() => writes), [`old\nnew\n${'long '.repeat(100)}`])
    assert.equal(await feedback.evaluate((node) => node === window.copyFeedbackRegion), true)
    await feedback.evaluate((node) => {
      window.firstCopyFeedback = node.firstElementChild
    })
    await copy.click()
    await page.waitForFunction(
      () =>
        window.copyFeedbackRegion.firstElementChild !== window.firstCopyFeedback &&
        window.copyFeedbackRegion.textContent === 'Copied',
    )
    assert.equal(await feedback.evaluate((node) => node === window.copyFeedbackRegion), true)
    assert.equal(await feedback.count(), 1)
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme })
      assert.equal(
        await page.locator('.hozo-code-token').evaluate((node) => getComputedStyle(node).color),
        scheme === 'light' ? 'rgb(18, 52, 86)' : 'rgb(171, 205, 239)',
      )
    }
    await page.evaluate(() => mount({ copy: false }))
    await copy.waitFor({ state: 'detached' })
    await scroll.focus()
    await scroll.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('[role=region]').scrollLeft > 0)
    await page.evaluate(() => mount({ wrap: true, copy: false }))
    await scroll.waitFor({ state: 'detached' })
    assert.equal(
      await page.locator('pre').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      true,
    )
    await page.evaluate(() => {
      mount({ lines: 'short' })
    })
    await copy.waitFor()
    await page.waitForFunction(
      () => !document.querySelector('[role=region]').hasAttribute('tabindex'),
    )
    await page.evaluate(() => {
      window.deferCopy = true
    })
    await copy.click()
    await page.waitForFunction(() => !!window.finishCopy)
    await page.evaluate(() => mount({ lines: 'replacement', copy: { text: 'override' } }))
    await page.waitForFunction(
      () => document.querySelector('code > span').lastElementChild.textContent === 'replacement',
    )
    await page.evaluate(() => {
      window.deferCopy = false
      finishCopy()
    })
    // A later successful click proves the event loop drained before inspecting retired feedback.
    await copy.click()
    await page.getByRole('status').filter({ hasText: 'Copied' }).waitFor()
    assert.deepEqual(await page.evaluate(() => writes.slice(-2)), ['short', 'override'])
    assert.equal(await page.getByRole('status').count(), 1)
    await feedback.evaluate((node) => {
      window.copyFailureRegion = node
    })
    await page.evaluate(() => {
      window.failCopy = true
    })
    await copy.click()
    await feedback.filter({ hasText: 'Could not copy code' }).waitFor()
    assert.equal(await feedback.evaluate((node) => node === window.copyFailureRegion), true)
    await page.evaluate(() => {
      delete navigator.clipboard
      fixtureRoot.unmount()
      window.fixtureRoot = null
      mount({ copy: true })
    })
    await page.waitForFunction(() => !!document.querySelector('figure'))
    assert.equal(await copy.count(), 0)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('Native lines group tokens and hide gutters; provider copy, scheme and interaction facts (mock hosts)', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const announcements = [],
    facts = [],
    writes = []
  let dark = false
  const bundle = await build({
    stdin: {
      contents: `export {CodeBlock} from './packages/patterns/src/code-block.native.tsx'; export {CodeClipboardProvider} from './packages/patterns/src/code-clipboard.tsx'`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: [
      'react',
      'react-native',
      '@hozo/engine',
      '@hozo/engine/project',
      '@hozo/engine/generated/environment',
      '@hozo/behaviors/pressable-interaction',
    ],
    plugins: [
      {
        name: 'native-code-test',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: 'messages',
            namespace: 'native-code-test',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'native-code-test' }, () => ({
            contents: `export {useHozoMessage} from ${JSON.stringify(path.join(root, 'packages/behaviors/src/i18n.ts'))}; export {useAnnounce} from 'test-announcements'`,
            resolveDir: root,
          }))
          builder.onResolve({ filter: /^test-announcements$/ }, () => ({
            path: 'test-announcements',
            external: true,
          }))
        },
      },
    ],
  })
  const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const native = {
    View: 'NativeView',
    Text: 'NativeText',
    ScrollView: 'NativeScrollView',
    Pressable: ({ children, style, ...props }) =>
      React.createElement(
        'NativePressable',
        { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    StyleSheet: { flatten },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (name) => {
      if (name === 'react-native') return native
      if (name === 'test-announcements')
        return { useAnnounce: () => (message) => announcements.push(message) }
      if (name === '@hozo/engine/generated/environment') return { useHozoDark: () => dark }
      if (name === '@hozo/engine/project')
        return {
          hozoClasses: (value, state) => {
            facts.push([value, state])
            return value === 'frame'
              ? [{ padding: 8, color: 'navy', fontSize: 18 }]
              : value === 'line'
                ? [{ padding: 2, color: 'green' }]
                : value === 'inserted'
                  ? [{ color: 'orange' }]
                  : value === 'caption'
                    ? [{ padding: 4, color: 'purple' }]
                    : []
          },
        }
      if (name === '@hozo/engine')
        return { ...require(name), HozoTextSizeContext: createContext(14) }
      return require(name)
    },
    module,
    module.exports,
  )
  const lines = [
    { tokens: [{ text: '\tx', color: { light: 'red', dark: 'blue' } }], mark: 'ins' },
    { tokens: 'old', mark: 'del' },
  ]
  const props = {
    title: 'Changes',
    lines,
    lineNumbers: true,
    copy: true,
    className: 'frame',
    lineClassName: 'line',
    insClassName: 'inserted',
    lineStyle: { color: 'purple' },
    captionClassName: 'caption',
  }
  const element = (provider) =>
    provider
      ? React.createElement(
          module.exports.CodeClipboardProvider,
          { value: provider },
          React.createElement(module.exports.CodeBlock, props),
        )
      : React.createElement(module.exports.CodeBlock, props)
  let renderer
  try {
    await act(async () => {
      renderer = create(element())
    })
    assert.equal(renderer.root.findAllByType('NativePressable').length, 0)
    const row = () =>
      renderer.root
        .findAllByType('NativeText')
        .find((node) => node.props.accessibilityLabel === 'Added:   x')
    assert.ok(row())
    assert.equal(
      flatten(row().props.style).color,
      'purple',
      'explicit line styles follow shared and mark classes on Native, as on Web',
    )
    assert.equal(flatten(row().props.style).fontSize, 18)
    assert.ok(
      facts.some(
        ([value, state]) =>
          value === 'line' &&
          state?.['data-code-mark=ins'] === true &&
          state?.['data-code-mark=del'] === false,
      ),
    )
    assert.equal(row().findAllByType('NativeText').at(-1).props.style.color, 'red')
    assert.equal(
      renderer.root
        .findAllByType('NativeView')
        .filter(
          (node) =>
            node.props.importantForAccessibility === 'no-hide-descendants' &&
            node.props.accessibilityElementsHidden,
        ).length,
      2,
    )
    assert.equal(
      renderer.root.findAllByType('NativeText').find((node) => node.children[0] === 'Changes').props
        .style[1].padding,
      4,
    )
    const provider = { writeText: async (text) => writes.push(text) }
    dark = true
    await act(async () => renderer.update(element(provider)))
    assert.equal(row().findAllByType('NativeText').at(-1).props.style.color, 'blue')
    const button = () => renderer.root.findByType('NativePressable')
    await act(async () => button().props.onFocus({}))
    assert.ok(facts.some(([, state]) => state?.focused === true))
    await act(async () => button().props.onPress())
    assert.deepEqual(writes, ['\tx\nold'])
    assert.deepEqual(announcements, ['Copied'])
  } finally {
    if (renderer) await act(async () => renderer.unmount())
  }
})
