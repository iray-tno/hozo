import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'

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
