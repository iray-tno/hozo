import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { createClassResolver } from '@hozo/engine'
import { NativeSelect } from '@hozo/form'
import { Button as ButtonFallback } from '@hozo/primitives'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import { chipAncestorFixture } from './chip-ancestor-fixture.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must run candidate cascade browser regressions')
const directory = mkdtempSync(path.join(tmpdir(), 'hozo-candidate-cascade-'))
const cache = openCandidateCache(path.join(directory, 'candidates.json'))
cache.scanFile(
  'helpers.ts',
  "export const classes = 'grid-cols-1 flex-col flex-row p-3 p-4 p-8 sm:p-4 md:p-8'",
  1,
)
const candidateCss = cache.renderCss(undefined, [
  'flex-col',
  'flex-row',
  'grid-cols-1',
  'p-3',
  'p-4',
  'p-8',
  'sm:p-4',
  'md:p-8',
])
const compiler = createCompiler()
assert.match(candidateCss, /\.grid-cols-1 \{/)
assert.match(candidateCss, /\.flex-col \{/)
let browser
let tailwindCss
before(async () => {
  tailwindCss = (
    await compile(
      '@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; --breakpoint-md: 48rem; } @tailwind utilities;',
    )
  ).build([
    'grid',
    'grid-cols-1',
    'md:grid-cols-3',
    'flex',
    'flex-col',
    'sm:flex-row',
    'p-4',
    'md:p-8',
    'p-4!',
  ])
  if (executablePath)
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
})
after(async () => {
  await browser?.close()
  // This exact mkdtemp result owns only this test's candidate snapshot.
  rmSync(directory, { recursive: true, force: true })
})

test('responsive font sizes preserve explicit leading against real Tailwind at every breakpoint', {
  skip: !executablePath,
}, async () => {
  const root = path.dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'))
  const oracle = await compile('@import "tailwindcss";', {
    base: root,
    loadStylesheet: async (id) => {
      const file = id === 'tailwindcss' ? path.join(root, 'index.css') : id
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
    },
  })
  const cases = [
    'text-lg sm:text-xl leading-relaxed',
    'leading-relaxed sm:text-xl text-lg',
    'text-lg sm:text-xl leading-6',
    'leading-6 sm:text-xl text-lg',
    'text-lg sm:text-xl leading-relaxed sm:leading-tight',
    'text-lg sm:leading-tight md:text-xl',
    'text-lg sm:text-xl',
  ]
  const css = oracle.build(cases.flatMap((classes) => classes.split(' ')))
  const page = await browser.newPage()
  try {
    for (const classes of cases) {
      const [web] = compiler.compile(
        `import {Paragraph} from '@hozo/core'; export function C() { return <Paragraph className="${classes}">One<br/>Two<br/>Three</Paragraph> }`,
      )
      assert.deepEqual(web.diagnostics, [])
      const { C } = evaluate(`export function C(){return ${web.jsx}}`)
      const html = renderToStaticMarkup(createElement(C))
      for (const width of [375, 639, 640, 767, 768, 1280]) {
        await page.setViewportSize({ width, height: 700 })
        await page.setContent(
          `<style>${css}</style><style>${web.css}</style><div id="compiled">${html}</div><div id="oracle"><p class="${classes}">One<br/>Two<br/>Three</p></div>`,
        )
        const measure = (selector) =>
          page.locator(selector).evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.fontSize, style.lineHeight, element.getBoundingClientRect().height]
          })
        const actual = await measure('#compiled > p')
        assert.deepEqual(actual, await measure('#oracle > p'), `${classes} at ${width}px`)
        if (classes === cases[0] && width === 1280)
          assert.deepEqual(actual, ['20px', '32.5px', 97.5])
      }
    }
  } finally {
    await page.close()
  }
})

function evaluate(code, globals = {}) {
  const module = { exports: {} }
  const js = transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  runInNewContext(js, { module, h: createElement, Fragment, ...globals })
  return module.exports
}

test('standalone NativeSelect SSR shares the pointer policy without hydration', {
  skip: !executablePath,
}, async () => {
  const utilities = ['cursor-default', 'cursor-auto', 'cursor-wait', 'cursor-not-allowed']
  const cssVariants = [
    ['Hozo candidates', cache.renderCss(undefined, utilities)],
    ['Tailwind', (await compile('@tailwind utilities;')).build(utilities)],
  ]
  // NativeSelect is a platform-owned picker, not a DOM primitive that may
  // be substituted. Exercise the same module-lowering boundary as bundlers;
  // an unchanged module is still rendered through its published form entry.
  const source = `import {NativeSelect} from '@hozo/form';
    export function C(props) { return <NativeSelect {...props}/> }`
  const lowered = lowerModule(source, 'Picker.tsx', 'Picker.tsx', compiler, '')
  assert.deepEqual(lowered?.diagnostics ?? [], [])
  const { C } = evaluate(lowered?.code ?? source, {
    require: (specifier) => {
      assert.equal(specifier, '@hozo/form')
      return { NativeSelect }
    },
  })
  const options = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ]
  const page = await browser.newPage()
  try {
    for (const [pipeline, Component] of [
      ['SSR', NativeSelect],
      ['compiler', C],
    ]) {
      for (const [cssName, css] of cssVariants) {
        for (const [className, expected] of [
          [undefined, 'pointer'],
          ['cursor-default', 'default'],
          ['cursor-auto', 'auto'],
          ['cursor-wait', 'wait'],
          ['cursor-not-allowed', 'not-allowed'],
        ]) {
          const label = `${pipeline}/${cssName}/${className ?? 'default'}`
          const render = (disabled) =>
            renderToStaticMarkup(
              createElement(Component, {
                options,
                id: 'language',
                accessibilityLabel: 'Language',
                defaultValue: 'en',
                className,
                disabled,
              }),
            )
          await page.setContent(`<style>${css}</style>${render(false)}`)
          const select = page.locator('#language')
          const cursor = () => select.evaluate((e) => getComputedStyle(e).cursor)
          assert.equal(await cursor(), expected, label)
          assert.equal(await select.getAttribute('data-hozo-pressable'), '', label)
          // The consumer uses a DOM listener, not a React root or hydration.
          await select.evaluate((e) =>
            e.addEventListener('change', () => {
              document.body.dataset.language = e.value
            }),
          )
          await select.selectOption('ja')
          assert.equal(await page.locator('body').getAttribute('data-language'), 'ja', label)
          // Native DOM disabled and disabled fieldset inheritance must work
          // even when React never updates data-hozo-disabled.
          await select.evaluate((e) => {
            e.disabled = true
          })
          assert.equal(await cursor(), className ? expected : 'default', `${label}/DOM disabled`)
          await select.evaluate((e) => {
            e.disabled = false
          })
          assert.equal(await cursor(), expected, `${label}/re-enabled`)
          await page.setContent(
            `<style>${css}</style><fieldset disabled>${render(false)}</fieldset>`,
          )
          assert.equal(await cursor(), className ? expected : 'default', `${label}/fieldset`)
          await page.setContent(`<style>${css}</style>${render(true)}`)
          assert.equal(await select.getAttribute('data-hozo-disabled'), '', label)
          assert.equal(await cursor(), className ? expected : 'default', `${label}/SSR disabled`)
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('disabled navigation keeps compiled, fallback and spread hosts out of Tab order and activation', {
  skip: !executablePath,
}, async () => {
  const fixtures = []
  for (const name of ['Button', 'Link', 'Pressable']) {
    for (const mode of ['compiled', 'fallback', 'spread']) {
      const id = `${name}-${mode}`
      const attrs = 'href="#docs" disabled={blocked} onPress={onPress} nativeID={id}'
      const element =
        mode === 'spread'
          ? `<${name} {...{href: '#docs', disabled: blocked, onPress}} nativeID={id}>Docs</${name}>`
          : `<${name} ${attrs}>Docs</${name}>`
      const jsx =
        mode === 'fallback'
          ? element
          : compiler.compile(
              `import {${name}} from '@hozo/core'; function C({blocked, onPress, id}) {return ${element}}`,
            )[0].jsx
      fixtures.push({ id, jsx })
    }
  }
  // Measured/responder-capable Pressable keeps its richer host. It must
  // delegate the same anchor contract rather than become a disabled div.
  fixtures.push({
    id: 'Pressable-measured',
    jsx: compiler.compile(
      `import {Pressable} from '@hozo/core'; function C({blocked, onPress, id}) {return <Pressable href="#docs" onLayout={()=>{}} disabled={blocked} onPress={onPress} nativeID={id}>Docs</Pressable>}`,
    )[0].jsx,
  })
  const definitions = fixtures
    .map(({ jsx }, index) => `function C${index}({blocked, onPress, id}) {return ${jsx}}`)
    .join('\n')
  const bundle = await build({
    stdin: {
      contents: `
      import React, {useEffect, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Button, Link, Pressable} from '@hozo/primitives';
      ${definitions}
      window.activations = [];
      const cases = [${fixtures.map(({ id }, index) => `{id:${JSON.stringify(id)}, C:C${index}}`).join(',')}];
      function App() {
        const [blocked, setBlocked] = useState(true);
        window.setBlocked = setBlocked;
        useEffect(() => {document.body.dataset.blocked = String(blocked)}, [blocked]);
        return <><button id="before">Before</button>{cases.map(({id,C}) =>
          <C key={id} id={id} blocked={blocked} onPress={event=>{window.activations.push(id);event.preventDefault()}}/>
        )}<button id="after">After</button></>
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `,
      loader: 'tsx',
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.body.dataset.blocked === 'true')
    const assertDisabled = async () => {
      for (const { id } of fixtures) {
        const host = page.locator(`#${id}`)
        assert.equal(await host.evaluate((e) => e.tagName), 'A', id)
        assert.equal(await host.getAttribute('disabled'), null, id)
        assert.equal(await host.getAttribute('aria-disabled'), 'true', id)
        assert.equal(await host.getAttribute('data-hozo-disabled'), '', id)
        assert.equal(await host.getAttribute('tabindex'), '-1', id)
        await host.evaluate((e) => e.click())
        const cancelled = await host.evaluate(
          (e) =>
            !e.dispatchEvent(
              new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }),
            ),
        )
        assert.equal(cancelled, true, `${id}: auxiliary activation must be prevented`)
        await host.focus()
        await page.keyboard.press('Enter')
      }
      assert.deepEqual(await page.evaluate(() => window.activations), [])
      await page.locator('#before').focus()
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
      await page.keyboard.press('Shift+Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'before')
    }
    await assertDisabled()
    await page.evaluate(() => window.setBlocked(false))
    await page.waitForFunction(() => document.body.dataset.blocked === 'false')
    await page.locator('#before').focus()
    for (const { id } of fixtures) {
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), id)
      assert.equal(await page.locator(`#${id}`).getAttribute('data-hozo-disabled'), null)
      await page.keyboard.press('Enter')
    }
    assert.deepEqual(
      await page.evaluate(() => window.activations),
      fixtures.map(({ id }) => id),
    )
    await page.evaluate(() => {
      window.activations = []
      window.setBlocked(true)
    })
    await page.waitForFunction(() => document.body.dataset.blocked === 'true')
    await assertDisabled()
  } finally {
    await page.close()
  }
})

test('Button host IDs and metadata work with DOM listeners without React hydration', {
  skip: !executablePath,
}, async () => {
  const [web] = compiler.compile(
    `import {Button} from '@hozo/core'; export function C(){return <Button nativeID="winget-copy" data-copy-label="コピー" data-copied-label="完了">Copy</Button>}`,
  )
  const { C } = evaluate(`export function C(){return ${web.jsx}}`)
  const markup = [
    renderToStaticMarkup(createElement(C)),
    renderToStaticMarkup(
      createElement(
        ButtonFallback,
        {
          nativeID: 'winget-copy',
          'data-copy-label': 'コピー',
          'data-copied-label': '完了',
        },
        'Copy',
      ),
    ),
  ]
  const page = await browser.newPage()
  try {
    for (const html of markup) {
      await page.setContent(html)
      await page.evaluate(() => {
        const button = document.getElementById('winget-copy')
        if (!(button instanceof HTMLButtonElement)) throw new Error('ID must name the real button')
        if (button.type !== 'button') throw new Error('safe non-submitting default changed')
        button.addEventListener('click', () => {
          button.textContent = button.dataset.copiedLabel
        })
      })
      await page.locator('#winget-copy').click()
      assert.equal(await page.locator('#winget-copy').textContent(), '完了')
      assert.equal(await page.locator('#winget-copy').getAttribute('data-copy-label'), 'コピー')
      await page.evaluate(() => {
        document.getElementById('winget-copy').disabled = true
        document.getElementById('winget-copy').textContent = 'disabled'
        document.getElementById('winget-copy').click()
      })
      assert.equal(await page.locator('#winget-copy').textContent(), 'disabled')
    }
  } finally {
    await page.close()
  }
})

test('the real Web Chip keeps ancestor hover/active on its row but child focus on its buttons', {
  skip: !executablePath,
}, async () => {
  const { html, css } = await chipAncestorFixture()
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${css}</style><div id="fixture">${html}</div>`)
    const row = page.locator('#fixture > span')
    const buttons = row.locator('button')
    assert.equal(await buttons.count(), 2)
    const look = () =>
      row.evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        opacity: getComputedStyle(node).opacity,
        focused: node.matches(':focus'),
        focusVisible: node.matches(':focus-visible'),
      }))
    await buttons.nth(0).hover()
    assert.equal((await look()).background, 'rgb(18, 52, 86)')
    await buttons.nth(1).hover()
    assert.equal((await look()).background, 'rgb(18, 52, 86)')
    await buttons.nth(1).focus()
    assert.equal((await look()).focused, false)
    assert.equal((await look()).focusVisible, false)
    assert.equal((await look()).opacity, '1')
    assert.equal(
      await buttons.nth(1).evaluate((node) => getComputedStyle(node).outlineWidth),
      '2px',
    )
    await page.mouse.down()
    assert.equal((await look()).opacity, '0.5')
    await page.mouse.up()
    assert.equal((await look()).opacity, '1')
    const box = await row.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + 2, box.y + 2)
    assert.equal((await look()).background, 'rgb(18, 52, 86)', 'row padding is also hovered')
    await page.mouse.move(500, 500)
    assert.equal((await look()).background, 'rgba(0, 0, 0, 0)')
  } finally {
    await page.close()
  }
})

test('the previous unlayered candidate sheet reproduces the reported raw-markup failure', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    await page.setContent(`<style>${candidateCss}</style>`)
    // Ask Chrome for the actual generated fallback rules, then remove only
    // their new layer wrapper. This is the old candidate cascade, not a
    // hand-written stand-in that might omit the interfering utility.
    const legacy = await page.evaluate(() => {
      const layer = [...document.styleSheets[0].cssRules].find(
        (rule) => rule.name === 'utilities.hozo-candidates',
      )
      return [...layer.cssRules].map((rule) => rule.cssText).join('\n')
    })
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${tailwindCss}</style><style>${legacy}</style><div id="grid" class="grid grid-cols-1 md:grid-cols-3"></div><div id="flex" class="flex flex-col sm:flex-row"></div>`,
    )
    assert.deepEqual(
      await page.evaluate(() => ({
        columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ')
          .length,
        direction: getComputedStyle(document.getElementById('flex')).flexDirection,
      })),
      { columns: 1, direction: 'column' },
    )
  } finally {
    await page.close()
  }
})

for (const order of ['candidate-first', 'tailwind-first']) {
  test(`raw Tailwind variants keep their cascade with ${order}`, {
    skip: !executablePath,
  }, async () => {
    assert.doesNotMatch(candidateCss, /\.md\\:grid-cols-3/)
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    try {
      const sheets =
        order === 'candidate-first' ? [candidateCss, tailwindCss] : [tailwindCss, candidateCss]
      await page.setContent(`<style>html { font-size: 16px }</style>${sheets.map((css) => `<style>${css}</style>`).join('')}
        <div id="grid" class="grid grid-cols-1 md:grid-cols-3"></div>
        <div id="flex" class="flex flex-col sm:flex-row"></div>
        <div id="padding" class="p-4 md:p-8"></div><div id="important" class="p-4! md:p-8"></div>`)
      for (const width of [375, 700, 1200]) {
        await page.setViewportSize({ width, height: 800 })
        const actual = await page.evaluate(() => ({
          columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ')
            .length,
          direction: getComputedStyle(document.getElementById('flex')).flexDirection,
          padding: getComputedStyle(document.getElementById('padding')).paddingTop,
          important: getComputedStyle(document.getElementById('important')).paddingTop,
        }))
        assert.deepEqual(actual, {
          columns: width >= 768 ? 3 : 1,
          direction: width >= 640 ? 'row' : 'column',
          padding: width >= 768 ? '32px' : '16px',
          important: '16px',
        })
      }
    } finally {
      await page.close()
    }
  })
}

test('owned static plus dynamic styles still match the Native style array, without styling raw descendants', {
  skip: !executablePath,
}, async () => {
  const source =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: authored TSX, not this test's interpolation
    "import { View } from '@hozo/core'; const Example = () => <View className={`p-3 ${dynamic}`} />"
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const nativeElement = evaluate(`${native.styles}\nmodule.exports = (${native.jsx})`, {
    dynamic: 'p-4 flex-row',
    hozoClasses,
    View: 'View',
    StyleSheet: { create: (styles) => styles },
    h: (type, props) => ({ type, props }),
  })
  const nativeStyle = Object.assign(
    {},
    ...[nativeElement.props.style].flat(Infinity).filter(Boolean),
  )
  assert.equal(nativeStyle.paddingTop, 16)
  assert.equal(nativeStyle.flexDirection, 'row')
  const html = renderToStaticMarkup(
    evaluate(`module.exports = (${web.jsx})`, { dynamic: 'p-4 flex-row' }),
  )
  assert.match(html, /hozo-candidate-owner/)
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${tailwindCss}</style><style>${web.css}</style><style>${candidateCss}</style>${html}`,
    )
    const actual = await page.locator('.hozo-candidate-owner').evaluate((element) => {
      element.innerHTML = '<div id="raw-child" class="grid grid-cols-1 md:grid-cols-3"></div>'
      return {
        padding: getComputedStyle(element).paddingTop,
        direction: getComputedStyle(element).flexDirection,
        columns: getComputedStyle(element.firstElementChild).gridTemplateColumns.split(' ').length,
      }
    })
    assert.deepEqual(actual, {
      padding: `${nativeStyle.paddingTop}px`,
      direction: nativeStyle.flexDirection,
      columns: 3,
    })
  } finally {
    await page.close()
  }
})

test('owned candidates work without Tailwind, and empty roots/slots keep absent values', {
  skip: !executablePath,
}, async () => {
  const source =
    "import { View } from '@hozo/core'; const Example = () => <View className={dynamic} />"
  const web = compiler.compile(source)[0]
  const html = renderToStaticMarkup(
    evaluate(`module.exports = (${web.jsx})`, { dynamic: 'flex-row p-4 sm:p-4 md:p-8' }),
  )
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    // Reversed base/candidate import order cannot make base column/padding
    // win against dynamic utilities in a standalone Hozo project.
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${candidateCss}</style><style>${web.css}</style>${html}`,
    )
    assert.deepEqual(
      await page.locator('.hozo-candidate-owner').evaluate((element) => ({
        direction: getComputedStyle(element).flexDirection,
        padding: getComputedStyle(element).paddingTop,
      })),
      { direction: 'row', padding: '32px' },
    )
  } finally {
    await page.close()
  }
  const emptySource =
    "import { Text } from '@hozo/core'; const Example = () => <Text className={dynamic}>Text</Text>"
  assert.doesNotMatch(
    renderToStaticMarkup(
      evaluate(`module.exports = (${compiler.compile(emptySource)[0].jsx})`, { dynamic: null }),
    ),
    /hozo-candidate-owner/,
  )
  const chipSource =
    'import { Chip } from \'@hozo/core\'; const Example = () => <Chip label="Filter" removeClassName={dynamic} onRemove={remove} />'
  const chip = compiler.compile(chipSource)[0]
  for (const dynamic of [undefined, null, '', 'p-4']) {
    const props = evaluate(`module.exports = (${chip.jsx})`, {
      dynamic,
      remove: () => {},
      HozoChip: 'Chip',
      h: (_type, props) => props,
    })
    assert.equal(props.removeClassName, dynamic ? `hozo-candidate-owner ${dynamic}` : dynamic)
  }
  console.log(
    `[candidate-cascade] ${cache.candidates().length} candidates, ${Buffer.byteLength(candidateCss)} CSS bytes, ${gzipSync(candidateCss).length} gzip bytes`,
  )
})

// #881. A component's own classes compile statically; its caller's
// `className` arrives at runtime. The caller wins over the resting look --
// unconditional classes and a branch the source picked -- and loses to the
// element's state, on both platforms and whichever stylesheet comes first.
test("a caller's className beats the component's resting look and loses to its state", {
  skip: !executablePath,
}, async () => {
  const callerCache = openCandidateCache(path.join(directory, 'caller-candidates.json'))
  callerCache.scanFile('app.ts', "export const caller = 'bg-red-500 px-8 opacity-100'", 1)
  const callerCss = callerCache.renderCss(undefined, ['bg-red-500', 'px-8', 'opacity-100'])
  const source =
    "import clsx from 'clsx'\nimport { Button } from '@hozo/core'\n" +
    "const Example = () => <Button disabled={off} className={clsx('bg-blue-500 p-2 disabled:opacity-50', big ? 'px-6' : 'px-1', caller)}>Save</Button>"
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(callerCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const caller = 'bg-red-500 px-8 opacity-100'
  for (const off of [false, true]) {
    const nativeElement = evaluate(
      `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
      {
        off,
        big: true,
        caller,
        hozoClasses,
        Pressable: 'Pressable',
        HozoPressable: 'HozoPressable',
        Text: 'Text',
        StyleSheet: { create: (styles) => styles },
        h: (type, props) => ({ type, props }),
      },
    )
    // A pressable with a runtime class resolves its style per state (#886);
    // at rest here.
    const style = nativeElement.props.style
    const resting =
      typeof style === 'function'
        ? style({ pressed: false, hovered: false, focused: false, focusVisible: false })
        : style
    const nativeStyle = Object.assign({}, ...[resting].flat(Infinity).filter(Boolean))
    assert.equal(
      nativeStyle.backgroundColor,
      '#fb2c36',
      'Native: the caller beats the resting colour',
    )
    assert.equal(nativeStyle.paddingStart, 32, 'Native: the caller beats the picked branch')
    assert.equal(nativeStyle.opacity, off ? 0.5 : 1, 'Native: the disabled state beats the caller')
    const html = renderToStaticMarkup(
      evaluate(`module.exports = (${web.jsx})`, { off, big: true, caller }),
    )
    for (const order of ['component-first', 'candidates-first']) {
      const sheets = order === 'component-first' ? [web.css, callerCss] : [callerCss, web.css]
      const page = await browser.newPage()
      try {
        await page.setContent(
          `<style>html { font-size: 16px }</style>${sheets.map((css) => `<style>${css}</style>`).join('')}${html}`,
        )
        const actual = await page.locator('button').evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            background: style.backgroundColor,
            padding: style.paddingLeft,
            opacity: style.opacity,
          }
        })
        assert.deepEqual(
          actual,
          {
            background: 'oklch(0.637 0.237 25.331)',
            padding: `${nativeStyle.paddingStart}px`,
            opacity: String(nativeStyle.opacity),
          },
          `${order}, disabled ${off}`,
        )
      } finally {
        await page.close()
      }
    }
  }
})

// #883. A branch on an element the compiler keeps as a component -- the
// `Button` primitive with a spread that may carry `href` -- reaches the DOM
// only through `className`, the prop that component passes on. It was an
// attribute the component dropped, so the negated branch always applied.
test('a className branch on a component applies both ways', {
  skip: !executablePath,
}, async () => {
  const { Button } = await import('@hozo/primitives')
  const source =
    "import clsx from 'clsx'\nimport { Button } from '@hozo/primitives'\n" +
    "const Example = () => <Button {...rest} className={clsx('p-2', small ? 'px-3' : 'px-4')}>Go</Button>"
  const web = compiler.compile(source)[0]
  assert.doesNotMatch(web.jsx, /<button/, 'the element stays a component')
  const page = await browser.newPage()
  try {
    for (const [small, padding] of [
      [true, '12px'],
      [false, '16px'],
    ]) {
      const html = renderToStaticMarkup(
        evaluate(`module.exports = (${web.jsx})`, {
          Button,
          rest: {},
          small,
          hozoDomProps: (props) => props,
        }),
      )
      await page.setContent(
        `<style>html { font-size: 16px }</style><style>${web.css}</style>${html}`,
      )
      assert.equal(
        await page.locator('button').evaluate((element) => getComputedStyle(element).paddingLeft),
        padding,
        `small ${small}`,
      )
    }
  } finally {
    await page.close()
  }
})

// #886. A class string that reaches a pressable at runtime keeps its states
// on Native: the compiler hands the resolver the state the pressable
// tracks, and the candidate module keeps the classes that need it.
test('a runtime class keeps its pressed and disabled looks on Native', () => {
  const stateCache = openCandidateCache(path.join(directory, 'state-candidates.json'))
  stateCache.scanFile(
    'app.ts',
    "export const look = 'bg-blue-500 active:opacity-80 disabled:opacity-50'",
    1,
  )
  const source =
    "import { Pressable } from '@hozo/core'\n" +
    'const Example = () => <Pressable disabled={off} onPress={go} className={look}>Go</Pressable>'
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(stateCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const styleFor = (off, pressed) => {
    const element = evaluate(
      `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
      {
        off,
        go: () => {},
        look: 'bg-blue-500 active:opacity-80 disabled:opacity-50',
        hozoClasses,
        HozoPressable: 'HozoPressable',
        Text: 'Text',
        StyleSheet: { create: (styles) => styles },
        h: (type, props) => ({ type, props }),
      },
    )
    assert.equal(
      typeof element.props.style,
      'function',
      'the pressable resolves its style per state',
    )
    const resolved = element.props.style({
      pressed,
      hovered: false,
      focused: false,
      focusVisible: false,
    })
    return Object.assign({}, ...[resolved].flat(Infinity).filter(Boolean))
  }
  assert.equal(styleFor(false, false).backgroundColor, '#2b7fff')
  assert.equal(styleFor(false, false).opacity, undefined)
  assert.equal(styleFor(false, true).opacity, 0.8)
  assert.equal(styleFor(true, false).opacity, 0.5)
})

// #886, slice 2. `@hozo/patterns`' Native Tabs resolves its class props
// through the project's resolver, with each tab's state. Run from its own
// source against stand-ins for React Native and React: what is asserted is
// the style each element is handed, not how React Native draws it.
test("@hozo/patterns' Native Tabs applies its class props, selected and pressed included", async () => {
  const look = 'p-4 px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const { load } = await patternHarness('tabs-candidates.json', look)
  const { HozoTabs } = load('tabs.native.tsx')
  const tree = HozoTabs({
    className: 'p-4',
    tabClassName: 'px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50',
    tabs: [
      { label: 'One', content: 'first' },
      { label: 'Two', content: 'second', disabled: true },
    ],
  })
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  assert.equal(flat(tree.props.style).paddingTop, 16, 'the root applies className')
  const found = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Pressable') found.push(node)
    for (const child of [node.props?.children].flat(Infinity)) walk(child)
  }
  walk(tree)
  const [first, second] = found
  const at = (tab, pressed) => flat(tab.props.style({ pressed }))
  assert.equal(at(first, false).paddingStart, 12)
  assert.equal(at(first, false).backgroundColor, '#2b7fff', 'the selected tab')
  assert.equal(at(first, false).opacity, undefined)
  assert.equal(at(first, true).opacity, 0.8, 'pressed')
  assert.equal(at(second, false).backgroundColor, undefined, 'not selected')
  assert.equal(at(second, false).opacity, 0.5, 'disabled')
})

// Runs `@hozo/patterns`' Native components from their own source, against
// stand-ins for React, React Native and the hooks they read, with a real
// candidate module scanned for `look` behind `@hozo/engine/project`.
async function patternHarness(cacheName, look) {
  const { readFileSync } = await import('node:fs')
  const cache = openCandidateCache(path.join(directory, cacheName))
  cache.scanFile('app.ts', `export const c = '${look}'`, 1)
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const loaded = new Map()
  const load = (file) => {
    // These tree tests feed explicit interaction facts into the style/label
    // callbacks. The real shared tracker and host bridge are exercised by
    // native-control-indicators.test.mjs without launching a browser.
    if (file === 'pressable.native.tsx') return { Pressable: 'Pressable' }
    if (!loaded.has(file)) {
      const source = readFileSync(
        new URL(`../../../packages/patterns/src/${file}`, import.meta.url),
        'utf8',
      )
      loaded.set(file, evaluate(source, { require: (name) => modules(name) }))
    }
    return loaded.get(file)
  }
  const modules = (name) =>
    name.startsWith('./')
      ? load(name.slice(2))
      : {
          react: {
            useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
            useCallback: (fn) => fn,
            useRef: (current) => ({ current }),
            useMemo: (fn) => fn(),
            useEffect: () => {},
            // This stateless probe does not mount React. OTP's committed
            // selection-buffer effect is exercised by the real renderer
            // in otp-caret.test.ts, not by these resting style lookups.
            useLayoutEffect: () => {},
          },
          'react-native': {
            View: 'View',
            Pressable: 'Pressable',
            Text: 'Text',
            Modal: 'Modal',
            TextInput: 'TextInput',
            Image: 'Image',
            Linking: { openURL: () => {} },
            StyleSheet: { flatten: flat },
          },
          '@hozo/engine/project': { hozoClasses },
          '@hozo/behaviors': {
            hozoTextChildren: (children) => children,
            useHozoMessage: () => (key, _values, fallback) => fallback ?? key,
            useHozoI18n: () => ({ dir: 'ltr', locale: 'en' }),
          },
          // Initial input state only in these structural probes. Real events
          // and tracker updates are tested in the browser-free React probe.
          '@hozo/behaviors/pressable-interaction': {
            usePressableInteraction: () => ({
              state: { pressed: false, hovered: false, focused: false, focusVisible: false },
              handlers: {},
            }),
          },
          '@hozo/engine/navigation': {
            activateHozoNavigation: () => {},
            useHozoNavigation: () => ({}),
          },
        }[name]
  const pressables = (tree) => {
    const found = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      // The ones that resolve a look; a Modal's backdrop has a fixed style.
      if (node.type === 'Pressable' && typeof node.props.style === 'function') found.push(node)
      for (const child of [node.props?.children].flat(Infinity)) walk(child)
    }
    walk(tree)
    return found
  }
  // A pressable's box at a state, and the Text its children render then.
  const at = (pressable, pressed, extra = {}) => {
    const state = { pressed, hovered: false, focused: false, focusVisible: false, ...extra }
    const children = pressable.props.children
    const label = typeof children === 'function' ? children(state) : children
    return {
      box: flat(pressable.props.style(state)),
      text: flat(label?.type === 'Text' ? label.props.style : undefined),
    }
  }

  return { load, pressables, at, flat }
}

// #886, slice 3: the rest of `@hozo/patterns`' Native components, through
// `patternHarness`. `text-style.native.ts` -- which moves a label's colour and
// weight off a Pressable onto its Text -- is loaded as the real one.
test("@hozo/patterns' Native controls apply their class props with each one's state", async () => {
  const look =
    'p-2 text-red-500 aria-expanded:bg-blue-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const { load, pressables, at } = await patternHarness('controls-candidates.json', look)

  const accordion = load('accordion.native.tsx').HozoAccordion({
    triggerClassName: look,
    defaultExpanded: 'a',
    items: [
      { id: 'a', header: 'Open', content: 'x' },
      { id: 'b', header: 'Shut', content: 'y', disabled: true },
    ],
  })
  const [open, shut] = pressables(accordion)
  assert.equal(at(open, false).box.backgroundColor, '#2b7fff', 'accordion: expanded')
  assert.equal(at(open, false).box.color, undefined, 'accordion: the label colour leaves the box')
  assert.equal(at(open, false).text.color, '#fb2c36', 'accordion: and reaches the Text')
  assert.equal(at(open, true).box.opacity, 0.8, 'accordion: pressed')
  assert.equal(at(shut, false).box.backgroundColor, undefined, 'accordion: collapsed')
  assert.equal(at(shut, false).box.opacity, 0.5, 'accordion: disabled')

  const radio = load('radio.native.tsx').HozoRadioGroup({
    optionClassName: look,
    defaultValue: 1,
    options: [
      { value: 1, label: 'One' },
      { value: 2, label: 'Two' },
    ],
  })
  const [one, two] = pressables(radio)
  assert.equal(at(one, false).box.backgroundColor, '#2b7fff', 'radio: checked')
  assert.equal(at(two, false).box.backgroundColor, undefined, 'radio: unchecked')
  assert.equal(at(one, false).text.color, '#fb2c36', 'radio: label')

  const listbox = load('listbox.native.tsx').HozoListbox({
    optionClassName: look,
    defaultValue: 'b',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  })
  const [a, b] = pressables(listbox)
  assert.equal(at(a, false).box.backgroundColor, undefined, 'listbox: unselected')
  assert.equal(at(b, false).box.backgroundColor, '#2b7fff', 'listbox: selected')

  const checkbox = load('toggle.native.tsx').HozoCheckbox({
    className: look,
    defaultChecked: true,
    children: 'Agree',
  })
  assert.equal(at(checkbox, false).box.backgroundColor, '#2b7fff', 'checkbox: checked')
  assert.equal(at(checkbox, false).text.color, '#fb2c36', 'checkbox: label')

  const menu = load('menu.native.tsx').HozoMenu({
    triggerClassName: look,
    itemClassName: look,
    trigger: 'More',
    items: [{ label: 'Delete', disabled: true }],
  })
  const [trigger, item] = pressables(menu)
  assert.equal(at(trigger, true).box.opacity, 0.8, 'menu: pressed trigger')
  assert.equal(at(trigger, false).text.color, '#fb2c36', 'menu: trigger label')
  assert.equal(at(item, false).box.opacity, 0.5, 'menu: disabled item')
})

// #886, slice 3, second batch: Tabs' labels, Chip, Pagination, Tree,
// Combobox and Toolbar. Popover, Drawer, BottomSheet, Dialog and Tooltip
// resolve the same way but sit on Animated, a Portal or a positioner,
// which these stand-ins do not model.
test("@hozo/patterns' second batch of Native controls apply their class props", async () => {
  const look =
    'p-2 text-red-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 aria-expanded:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const { load, pressables, at, flat } = await patternHarness('batch-candidates.json', look)

  const [tab] = pressables(
    load('tabs.native.tsx').HozoTabs({
      tabClassName: look,
      tabs: [{ label: 'One', content: 'x' }],
    }),
  )
  assert.equal(at(tab, false).text.color, '#fb2c36', 'tabs: a string label takes the text half')
  assert.equal(at(tab, false).box.color, undefined, 'tabs: and the box does not')

  const chip = load('chip.native.tsx').HozoChip({
    className: look,
    defaultSelected: true,
    children: 'Filter',
  })
  assert.equal(at(chip, false).box.backgroundColor, '#2b7fff', 'chip: checked')
  assert.equal(at(chip, true).box.opacity, 0.8, 'chip: pressed')
  assert.equal(at(chip, false).text.color, '#fb2c36', 'chip: label')

  const pages = pressables(
    load('pagination.native.tsx').HozoPagination({
      itemClassName: look,
      currentItemClassName: 'p-2',
      pageCount: 3,
      defaultPage: 1,
    }),
  )
  const [previous, first, second] = pages
  assert.equal(at(previous, false).box.opacity, 0.5, 'pagination: disabled previous')
  assert.equal(at(first, false).box.backgroundColor, '#2b7fff', 'pagination: current page')
  assert.equal(at(second, false).box.backgroundColor, undefined, 'pagination: another page')

  const [branch, leaf] = pressables(
    load('tree.native.tsx').HozoTree({
      rowClassName: look,
      defaultExpanded: ['a'],
      selectedId: 'b',
      nodes: [{ id: 'a', label: 'A', children: [{ id: 'b', label: 'B' }] }],
    }),
  )
  assert.equal(at(branch, false).box.backgroundColor, '#2b7fff', 'tree: expanded branch')
  assert.equal(at(leaf, false).box.backgroundColor, '#2b7fff', 'tree: selected leaf')
  assert.equal(at(leaf, false).text.color, '#fb2c36', 'tree: label')

  const toolbar = load('toolbar.native.tsx').HozoToolbar({ className: 'p-2', items: [] })
  assert.equal(flat(toolbar.props.style).paddingTop, 8, 'toolbar: className')
})

// #886, slice 3, third batch: the patterns with several slots. Avatar,
// Stepper and OtpInput here; ColorPicker, CommandPalette and Slider resolve
// the same way but sit on a slider, a portal or a responder these stand-ins
// do not model.
test("@hozo/patterns' Native slotted patterns apply their class props", async () => {
  const look = 'p-2 p-4 text-red-500 bg-blue-500 opacity-50'
  const { load, flat } = await patternHarness('slotted-candidates.json', look)
  const find = (tree, test) => {
    const found = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (test(node)) found.push(node)
      for (const child of [node.props?.children].flat(Infinity)) walk(child)
    }
    walk(tree)
    return found
  }

  const avatar = load('avatar.native.tsx').HozoAvatar({
    name: 'Ada Lovelace',
    className: 'p-2',
    fallbackClassName: 'bg-blue-500 text-red-500',
  })
  assert.equal(flat(avatar.props.style).paddingTop, 8, 'avatar: className')
  const [initials] = find(avatar, (node) => node.type === 'Text')
  assert.equal(flat(initials.props.style).color, '#fb2c36', 'avatar: fallback text')

  const stepper = load('stepper.native.tsx').HozoStepper({
    steps: [{ label: 'One' }, { label: 'Two' }],
    activeStep: 0,
    className: 'p-4',
    currentStepClassName: 'opacity-50',
  })
  assert.equal(flat(stepper.props.style).paddingTop, 16, 'stepper: className')
  const faded = find(stepper, (node) => flat(node.props?.style).opacity === 0.5)
  assert.ok(faded.length > 0, 'stepper: the current step takes currentStepClassName')

  const otp = load('otp-input.native.tsx').HozoOtpInput({
    accessibilityLabel: 'Code',
    length: 2,
    defaultValue: '1',
    cellClassName: 'p-2',
    filledCellClassName: 'bg-blue-500',
  })
  const otpContents = otp.props.children({
    pressed: false,
    hovered: false,
    focused: false,
    focusVisible: false,
  })
  const cells = find(
    otpContents,
    (node) => node.type === 'View' && node.props.accessibilityElementsHidden,
  )
  assert.equal(flat(cells[0].props.style).backgroundColor, '#2b7fff', 'otp: a filled cell')
  assert.equal(flat(cells[1].props.style).backgroundColor, undefined, 'otp: an empty cell')
  assert.equal(flat(cells[1].props.style).paddingTop, 8, 'otp: cellClassName')
})
