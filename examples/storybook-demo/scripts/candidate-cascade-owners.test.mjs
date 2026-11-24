// Layered candidate cascade, raw Tailwind variants, mixed AOT routes, and pattern inputs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { openCandidateCache } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import {
  buildCascadeTailwindCss,
  compiledStyles,
  createCascadeContext,
  evaluate,
  executablePath,
  launchCandidateBrowser,
  residualWarnings,
} from './candidate-cascade-harness.mjs'

const { directory, cache, candidateCss, compiler, assertCandidateStylesRequired, cleanup } =
  createCascadeContext()
let browser
let tailwindCss

before(async () => {
  tailwindCss = await buildCascadeTailwindCss()
  browser = await launchCandidateBrowser()
})
after(async () => {
  await browser?.close()
  cleanup()
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
  // A map that writes an inline edge both logically and physically reads
  // the layout direction from React Native (#2018).
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
    I18nManager: { isRTL: false },
  })
  const nativeElement = evaluate(
    `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
    {
      dynamic: 'p-4 flex-row',
      hozoClasses,
      View: 'View',
      StyleSheet: { create: (styles) => styles },
      h: (type, props) => ({ type, props }),
    },
  )
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

test('mixed Chip root keeps compiled states above caller candidates on Web and Native', {
  skip: !executablePath,
}, async () => {
  const caller = 'p-4 opacity-75 rounded-none focus:outline-2'
  const other = 'hover:outline-offset-8'
  // Tailwind orders rules, not authored class tokens. Pick resting values
  // for which its raw utility order also agrees with Hozo's caller-over-AOT
  // resting contract (opacity-100 would beat opacity-75 in raw Tailwind).
  const own =
    'p-2 opacity-25 outline-0 hover:opacity-50 not-focus:rounded-lg disabled:outline-offset-4'
  const callerCache = openCandidateCache(path.join(directory, 'chip-root-candidates.json'))
  callerCache.scanFile('caller.ts', `export const classes = '${caller} ${other}'`, 1)
  const callerCss = callerCache.renderCss()
  const tailwindOracle = (
    await compile('@theme { --spacing: 0.25rem; --radius-lg: 0.5rem; } @tailwind utilities;')
  ).build(`${own} ${caller} ${other}`.split(' '))
  const source = `import { Chip, cx } from '@hozo/core';
    const Example = () => <Chip defaultSelected disabled={disabled}
      className={cx('${own}', first(), second())}>Token</Chip>`
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(callerCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip as HozoChip} from '@hozo/patterns';
        function App() {
          const disabled = false;
          const first = () => ${JSON.stringify(caller)};
          const second = () => ${JSON.stringify(other)};
          return ${web.jsx};
        }
        createRoot(document.getElementById('root')).render(<App/>);`,
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
  // The actual Native pattern lifecycle is exercised in
  // pattern-dynamic-slots.test.ts; here its emitted callback is compared to
  // the actual Web Chip/CSS cascade, in both stylesheet import orders.
  const readNative = ({ hovered = false, focused = false, disabled = false } = {}) => {
    const calls = []
    const element = evaluate(
      `const hozoStyles = ${native.styles}; module.exports = (${native.jsx})`,
      {
        disabled,
        hozoClasses,
        first: () => {
          calls.push('first')
          return caller
        },
        second: () => {
          calls.push('second')
          return other
        },
        HozoChip: 'Chip',
        StyleSheet: { create: (styles) => styles },
        h: (_type, props) => ({ props }),
      },
    )
    const state = {
      hovered,
      focused,
      focusVisible: focused,
      pressed: false,
      disabled,
      enabled: !disabled,
      'aria-pressed': true,
      'aria-checked': false,
      'aria-disabled': false,
    }
    const styles = Object.assign(
      {},
      ...[
        hozoClasses(element.props.className, state),
        element.props.hozoStyle?.(state),
        element.props.style,
      ]
        .flat(Infinity)
        .filter(Boolean),
    )
    assert.deepEqual(Array.from(calls), ['first', 'second'])
    return {
      padding: `${styles.paddingTop}px`,
      opacity: String(styles.opacity),
      radius: `${styles.borderRadius ?? 0}px`,
      outline: `${styles.outlineWidth}px`,
      offset: `${styles.outlineOffset ?? 0}px`,
    }
  }
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    assert.deepEqual(readNative(), {
      padding: '16px',
      opacity: '0.75',
      radius: '8px',
      outline: '0px',
      offset: '0px',
    })
    for (const { sheets, raw } of [
      { sheets: [web.css, callerCss], raw: false },
      { sheets: [callerCss, web.css], raw: false },
      { sheets: [tailwindOracle], raw: true },
    ]) {
      await page.setContent(
        `<style>html {font-size:16px}</style>${sheets.map((css) => `<style>${css}</style>`).join('')}<div id="root">${raw ? `<button class="${own} ${caller} ${other}">Token</button>` : ''}</div>`,
      )
      if (!raw) await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const button = page.locator('#root button')
      await button.waitFor()
      const read = () =>
        button.evaluate((e) => {
          const css = getComputedStyle(e)
          return {
            padding: css.paddingTop,
            opacity: css.opacity,
            radius: css.borderRadius,
            outline: css.outlineWidth,
            offset: css.outlineOffset,
          }
        })
      await page.mouse.move(0, 0)
      assert.deepEqual(
        await read(),
        readNative(),
        raw ? 'raw Tailwind resting' : 'compiled Web resting',
      )
      await button.hover()
      assert.deepEqual(await read(), readNative({ hovered: true }))
      await button.focus()
      assert.deepEqual(await read(), readNative({ hovered: true, focused: true }))
      await page.evaluate(() => document.activeElement.blur())
      await page.mouse.move(0, 0)
      assert.deepEqual(await read(), readNative())
      if (raw) {
        await page.evaluate(() => {
          const button = document.querySelector('#root button')
          button.disabled = true
        })
        assert.deepEqual(await read(), readNative({ disabled: true }))
      }
      // #993: the retained Web Chip does not supply the marker used by AOT
      // disabled selectors. Do not certify that unrelated broken path here;
      // the independent Tailwind button above checks Native's owner fact.
      // Native-only explicit style is exercised by the lifecycle fixture,
      // not passed to a Web Chip API that does not publish a style prop.
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('mixed secondary AOT classes use the actual button or link rather than a widget-root marker', {
  skip: !executablePath,
}, async () => {
  const own =
    'outline-0 rounded-none m-0 enabled:outline-2 disabled:outline-offset-4 not-disabled:rounded-lg aria-disabled:mt-2'
  const caller = 'opacity-75'
  const source = `import {Pagination,cx} from '@hozo/core'; const C = () =>
    <Pagination pageCount={3} getPageHref={getPageHref} itemClassName={cx('${own}', getClasses())} />`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'mixed-secondary.json'))
  candidates.scanFile('caller.ts', `const classes = '${caller}'`, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(`${own} ${caller}`.split(' '))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination as HozoPagination} from '@hozo/patterns';
        createRoot(document.getElementById('root')).render(<>{[false,true].map(link => {
          const getPageHref = link ? page => '#page-' + page : undefined;
          const getClasses = () => '${caller}';
          return <section key={String(link)} id={link ? 'links' : 'buttons'}>${web.jsx}</section>;
        })}</>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><div id="oracle"></div>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      await page.waitForFunction(
        () => document.querySelectorAll('#root button,#root a').length === 10,
      )
      const read = (locator) =>
        locator.evaluate((e) => {
          const css = getComputedStyle(e)
          return {
            opacity: css.opacity,
            radius: css.borderRadius,
            outline: css.outlineWidth,
            offset: css.outlineOffset,
            margin: css.marginTop,
          }
        })
      for (const link of [false, true])
        for (const boundary of [true, false]) {
          const controls = page.locator(link ? '#links a' : '#buttons button')
          const actual = await read(controls.nth(boundary ? 0 : 1))
          const expected = {
            opacity: '0.75',
            radius: !link && boundary ? '0px' : '8px',
            outline: !link && !boundary ? '2px' : '0px',
            offset: !link && boundary ? '4px' : '0px',
            margin: link && boundary ? '8px' : '0px',
          }
          assert.deepEqual(actual, expected, `compiled link=${link}, boundary=${boundary}`)
          await oracle.locator('#oracle').evaluate(
            (root, { link, boundary, classes }) => {
              const owner = document.createElement(link ? 'a' : 'button')
              owner.className = classes
              if (link) {
                owner.href = '#'
                if (boundary) owner.setAttribute('aria-disabled', 'true')
              } else owner.disabled = boundary
              root.replaceChildren(owner)
            },
            { link, boundary, classes: `${own} ${caller}` },
          )
          assert.deepEqual(
            actual,
            await read(oracle.locator('#oracle > *')),
            'independent Tailwind owner',
          )
          await assertCandidateStylesRequired(
            page,
            () => read(controls.nth(boundary ? 0 : 1)),
            `mixed secondary link=${link}, boundary=${boundary}`,
          )
        }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('ordered secondary guards preserve empty classes and abrupt evaluation without new lexical scopes', () => {
  const source = `import {Chip,cx} from '@hozo/core'; const C = () =>
    <Chip removeClassName={cx(first(), guard() && 'p-2', last())} />`
  const web = compiler.compile(source)[0]
  for (const enabled of [false, true]) {
    const calls = []
    const element = evaluate(`module.exports = (${web.jsx})`, {
      HozoChip: 'Chip',
      first() {
        calls.push('first')
      },
      guard() {
        calls.push('guard')
        return enabled
      },
      last() {
        calls.push('last')
      },
    })
    assert.deepEqual(calls, ['first', 'guard', 'last'])
    assert.equal(
      Boolean(element.props.removeClassName),
      enabled,
      'inactive guards cannot leave truthy internal markers',
    )
  }
  const calls = []
  assert.throws(
    () =>
      evaluate(`module.exports = (${web.jsx})`, {
        HozoChip: 'Chip',
        first() {
          calls.push('first')
        },
        guard() {
          calls.push('guard')
          throw new Error('guard failed')
        },
        last() {
          calls.push('last')
        },
      }),
    /guard failed/,
  )
  assert.deepEqual(calls, ['first', 'guard'])
})

test('ordered secondary guards match actual owner pixels and independent Tailwind in both stylesheet orders', {
  skip: !executablePath,
}, async () => {
  const own = 'p-0 rounded-none not-focus:rounded-lg hover:opacity-50'
  const source = `import {Pagination,cx} from '@hozo/core'; const C = () =>
    <Pagination pageCount={3} itemClassName={cx('${own}', first(), outer() ? inner() ? 'p-2' : 'p-4' : off() && 'p-6', last())} />`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'ordered-secondary.json'))
  candidates.scanFile('caller.ts', "const classes = 'opacity-75'", 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(`${own} p-2 p-4 p-6 opacity-75`.split(' '))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination as HozoPagination} from '@hozo/patterns';
        const root = createRoot(document.getElementById('root'));
        function Example({values}) {
          window.calls = [];
          const read = (name, value) => () => {window.calls.push(name); return value;};
          const first = read('first', undefined), last = read('last', 'opacity-75');
          const outer = read('outer', values.outer), inner = read('inner', values.inner), off = read('off', values.off);
          return <section data-case={values.id}>${web.jsx}</section>;
        }
        window.show = values => root.render(<Example values={values}/>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><button id="oracle"></button>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const read = (locator) =>
        locator.evaluate((e) => {
          const css = getComputedStyle(e)
          return { padding: css.paddingTop, radius: css.borderRadius, opacity: css.opacity }
        })
      for (const values of [
        { id: 1, outer: true, inner: true, off: false, padding: 8 },
        { id: 2, outer: true, inner: false, off: false, padding: 16 },
        { id: 3, outer: false, inner: true, off: false, padding: 0 },
        { id: 4, outer: false, inner: true, off: true, padding: 24 },
      ]) {
        await page.mouse.move(0, 0)
        await page.evaluate(() => document.activeElement?.blur())
        await page.evaluate((values) => window.show(values), values)
        await page.waitForFunction(
          (id) => document.querySelector('[data-case]')?.dataset.case === String(id),
          values.id,
        )
        const owner = page.locator('#root button').nth(1)
        const expected = { padding: `${values.padding}px`, radius: '8px', opacity: '0.75' }
        assert.deepEqual(await read(owner), expected)
        await oracle.locator('#oracle').evaluate(
          (e, classes) => {
            e.className = classes
          },
          `${own} ${values.padding ? `p-${values.padding / 4}` : ''} opacity-75`,
        )
        assert.deepEqual(await read(oracle.locator('#oracle')), expected, 'independent Tailwind')
        await assertCandidateStylesRequired(page, () => read(owner), `ordered guard ${values.id}`)
        const calls = ['first', 'outer', values.outer ? 'inner' : 'off', 'last']
        assert.deepEqual(await page.evaluate(() => window.calls), calls)
        await owner.hover()
        assert.equal((await read(owner)).opacity, '0.5')
        await owner.focus()
        assert.equal((await read(owner)).radius, '0px')
        assert.deepEqual(
          await page.evaluate(() => window.calls),
          calls,
          'owner events cannot rerun author inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

// A real component on one page and an independent raw Tailwind input on
// another: a modal focus trap must not pull focus away from the oracle.
async function patternInputFixture(component, own, props) {
  const negative = 'enabled:px-3 not-focus:mb-2'
  const expression = (mode) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}', ${JSON.stringify(`${own} ${negative}`)})}`
        : `{cx('p-2 rounded-none opacity-100 ${negative}',getClasses('${mode}',${JSON.stringify(own.replace('p-2 rounded-none opacity-100 ', ''))}))}`
  const source = `import {View,${component},cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><${component} ${props(mode)}
      inputClassName=${expression(mode)} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  const residual = residualWarnings(web, source)
  assert.equal(residual.length, 1)
  const [diagnostic] = residual
  assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
  assert.equal(diagnostic.severity, 'warning')
  assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed'/)
  const names = `${own} ${negative}`.split(' ')
  const candidates = openCandidateCache(path.join(directory, `${component}-input.json`))
  candidates.scanFile('InputFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss(undefined, names)
  assert.ok(candidateCss.includes('.p-2'), 'the actual candidate stylesheet must be populated')
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {${component} as Hozo${component}} from '@hozo/patterns';
      const root=createRoot(document.getElementById('root'));
      function Example({mode='literal',open=true,disabled=false,stamp}) {
        window.calls=[];
        const getClasses=(name,value)=>{window.calls.push(name);return value};
        const commands=[{id:'a',label:'Alpha',onSelect:()=>{}},{id:'b',label:'Beta',onSelect:()=>{}}];
        return <section data-stamp={stamp}>${web.jsx}</section>;
      }
      window.show=value=>root.render(<Example {...value}/>);`,
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
  return { web, candidateCss, oracleCss, bundle, rawClasses: `${own} ${negative}` }
}

const readPatternInput = (locator) =>
  locator.evaluate((e) => {
    const s = getComputedStyle(e)
    return [
      s.paddingLeft,
      s.paddingTop,
      s.opacity,
      s.borderRadius,
      s.borderTopWidth,
      s.outlineWidth,
      s.marginTop,
      s.marginBottom,
    ]
  })

async function comparePatternInput(page, oracle, field, raw, focused) {
  await page.bringToFront()
  if (focused) await field.focus()
  else await field.evaluate((e) => e.blur())
  const actual = await readPatternInput(field)
  await oracle.bringToFront()
  if (focused) await raw.focus()
  else await raw.evaluate((e) => e.blur())
  assert.deepEqual(actual, await readPatternInput(raw))
  await page.bringToFront()
  return actual
}

test('CommandPalette real input matches independent Tailwind across focus and class routes', {
  skip: !executablePath,
}, async () => {
  const own =
    'p-2 rounded-none opacity-100 border-0 focus:opacity-50 focus-visible:outline-2 disabled:opacity-25 read-only:rounded-lg aria-expanded:border-2 aria-disabled:mt-4 aria-selected:mb-8'
  const fixture = await patternInputFixture(
    'CommandPalette',
    own,
    (mode) => `open={open && mode==='${mode}'} portal={false} commands={commands}`,
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${fixture.oracleCss}</style><input id="oracle" type="text" role="combobox" aria-expanded="true" class="${fixture.rawClasses}"/>`,
    )
    const raw = oracle.locator('#oracle')
    for (const sheets of [
      [fixture.web.css, fixture.candidateCss],
      [fixture.candidateCss, fixture.web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, fixture.candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: fixture.bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const show = async (open, stamp) => {
          await page.evaluate((props) => window.show(props), { mode, open, stamp })
          await page.waitForFunction(
            (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
            stamp,
          )
          assert.equal((await page.evaluate(() => window.calls)).length, 2)
        }
        await show(true, `${mode}-open`)
        const section = page.getByTestId(mode)
        const field = section.locator('input')
        const focused = await comparePatternInput(page, oracle, field, raw, true)
        assert.deepEqual(focused.slice(0, 4), ['12px', '8px', '0.5', '0px'])
        assert.equal(focused[4], '2px')
        assert.equal(focused[5], '2px')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(
            page,
            () => readPatternInput(field),
            `Command input ${mode}`,
          )
        await field.fill('Beta')
        assert.equal(await section.locator('[role="option"]').count(), 1)
        assert.deepEqual(await readPatternInput(field), focused)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          2,
          'query/focus does not rerun authored inputs',
        )
        await comparePatternInput(page, oracle, field, raw, false)
        assert.equal((await readPatternInput(field))[2], '1')
        await show(false, `${mode}-closed`)
        assert.equal(await section.locator('input').count(), 0)
        await show(true, `${mode}-reopen`)
        assert.equal(await field.inputValue(), '')
        await comparePatternInput(page, oracle, field, raw, true)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('ColorPicker real input matches independent Tailwind across focus, disabled and draft changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'p-2 rounded-none opacity-100 border-0 focus:opacity-50 focus-visible:outline-2 disabled:opacity-25 read-only:rounded-lg aria-disabled:mt-4 aria-selected:mb-8 aria-checked:ml-8'
  const fixture = await patternInputFixture(
    'ColorPicker',
    own,
    () =>
      `accessibilityLabel="Theme" disabled={disabled} defaultValue="#123456" presets={['#123456','#654321']}`,
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${fixture.oracleCss}</style><input id="oracle" type="text" class="${fixture.rawClasses}"/>`,
    )
    const raw = oracle.locator('#oracle')
    for (const sheets of [
      [fixture.web.css, fixture.candidateCss],
      [fixture.candidateCss, fixture.web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, fixture.candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: fixture.bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const show = async (disabled, stamp) => {
          await page.evaluate((props) => window.show(props), { mode, disabled, stamp })
          await page.waitForFunction(
            (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
            stamp,
          )
          await raw.evaluate((e, disabled) => {
            e.disabled = disabled
          }, disabled)
          assert.equal((await page.evaluate(() => window.calls)).length, 2)
        }
        await show(false, `${mode}-enabled`)
        const field = page.getByTestId(mode).locator('input[type="text"]')
        const focused = await comparePatternInput(page, oracle, field, raw, true)
        assert.deepEqual(focused.slice(0, 4), ['12px', '8px', '0.5', '0px'])
        assert.equal(focused[5], '2px')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(
            page,
            () => readPatternInput(field),
            `Color input ${mode}`,
          )
        await field.fill('#abc')
        assert.equal(await field.inputValue(), '#abc')
        await comparePatternInput(page, oracle, field, raw, false)
        assert.equal(
          await field.inputValue(),
          '#aabbcc',
          'blur normalizes without losing the editing draft',
        )
        await field.focus()
        await field.fill('#f')
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          2,
          'draft/focus do not rerun authored inputs',
        )
        await show(true, `${mode}-disabled`)
        const disabled = await comparePatternInput(page, oracle, field, raw, false)
        assert.deepEqual(disabled.slice(0, 4), ['8px', '8px', '0.25', '8px'])
        await page.waitForFunction(
          (mode) =>
            document.querySelector(`[data-testid="${mode}"] input[type="text"]`)?.value ===
            '#aabbcc',
          mode,
        )
        assert.equal(await field.evaluate((e) => e.matches(':focus')), false)
        await show(false, `${mode}-again`)
        const resting = await comparePatternInput(page, oracle, field, raw, false)
        assert.equal(resting[2], '1', 'enable does not revive stale focus')
        assert.equal(resting[3], '0px')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Menu button expansion and action-div states match isolated Tailwind in both CSS orders', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'p-2 opacity-75 text-[#654321] disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    trigger:
      'p-2 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-expanded:border-2 read-only:rounded-lg enabled:px-3 disabled:mt-8 aria-disabled:mb-8 aria-selected:ml-8',
    menu: 'p-2 opacity-100 text-[#123456] read-only:rounded-lg disabled:opacity-25 enabled:opacity-50 aria-selected:border-8',
    item: 'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#654321] active:opacity-75 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-selected:ml-8 aria-checked:mr-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base =
      part === 'root'
        ? 'p-2 opacity-75'
        : part === 'menu'
          ? 'p-2 opacity-100'
          : `${part === 'item' ? 'p-1' : 'p-2'} border-0 opacity-100 rounded-none`
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  // Keep the original adjacent stacking contexts: the popup must escape
  // them, not rely on test-only spacing to receive real pointer events.
  const source = `import {View,Menu,cx} from '@hozo/core';const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Menu trigger="Actions" items={items} accessibilityLabel="Letters"
      className=${expression(mode, 'root')} triggerClassName=${expression(mode, 'trigger')}
      menuClassName=${expression(mode, 'menu')} itemClassName=${expression(mode, 'item')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  assert.ok(web.diagnostics.length > 0)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'menu-owners.json'))
  candidates.scanFile('MenuFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((classes) => classes.split(' ')))
  // The same official reset on each page, without any oracle utilities on
  // the target. Tailwind's reset makes button typography inherit as in apps.
  const tailwindRoot = path.dirname(
    createRequire(import.meta.url).resolve('tailwindcss/package.json'),
  )
  const preflight = readFileSync(path.join(tailwindRoot, 'preflight.css'), 'utf8')
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {Menu as HozoMenu} from '@hozo/patterns';window.calls=0;window.changes=[];
        const getClasses=value=>{window.calls++;return value};
        const items=[{label:'Alpha',onSelect:()=>window.changes.push('a')},{label:'Beta',disabled:true,onSelect:()=>window.changes.push('b')},{label:'Gamma',onSelect:()=>window.changes.push('c')}];
        createRoot(document.getElementById('root')).render(${web.jsx});`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.marginLeft,
        s.marginRight,
        s.color,
        s.backgroundColor,
      ]
    })
  try {
    await oracle.setContent(`<style>${preflight}</style><style>${oracleCss}</style><div id="owner" class="${looks.root}">
      <button id="trigger" type="button" aria-expanded="false" class="${looks.trigger}">Actions</button>
      <div id="menu" role="menu" class="${looks.menu}"><div id="item" tabindex="0" role="menuitem" class="${looks.item}">Item</div></div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>${preflight}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const section = page.getByTestId(mode)
        const owner = section.locator(':scope > div').first()
        const trigger = section.getByRole('button', { name: 'Actions' })
        const menu = section.getByRole('menu')
        const rows = menu.getByRole('menuitem')
        await trigger.waitFor()
        const initialCalls = await page.evaluate(() => window.calls)
        assert.deepEqual(await read(owner), await read(oracle.locator('#owner')))
        const compare = async (target, reference, { focus = false, hover = false } = {}) => {
          await page.bringToFront()
          await page.mouse.move(1200, 700)
          await page.evaluate(() => document.activeElement?.blur())
          if (focus) {
            await page.keyboard.press('Shift')
            await target.focus()
          }
          if (hover) await target.hover()
          const actual = await read(target)
          await oracle.bringToFront()
          await oracle.mouse.move(1200, 700)
          await oracle.evaluate(() => document.activeElement?.blur())
          if (focus) {
            await oracle.keyboard.press('Shift')
            await reference.focus()
          }
          if (hover) await reference.hover()
          assert.deepEqual(
            actual,
            await read(reference),
            `${mode}: ${(await target.getAttribute('role')) ?? 'trigger'}`,
          )
          await page.bringToFront()
        }
        await oracle.locator('#trigger').evaluate((e) => e.setAttribute('aria-expanded', 'false'))
        await compare(trigger, oracle.locator('#trigger'), { focus: true })
        assert.equal(await menu.count(), 0, 'trigger focus alone does not open')
        await trigger.click()
        await menu.waitFor()
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('role') === 'menuitem',
        )
        assert.equal(await rows.first().evaluate((e) => e === document.activeElement), true)
        await rows.nth(2).focus()
        await page.evaluate(() => window.dispatchEvent(new Event('resize')))
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
        assert.equal(
          await rows.nth(2).evaluate((e) => e === document.activeElement),
          true,
          'position updates do not rerun the initial focus effect',
        )
        await oracle.locator('#trigger').evaluate((e) => e.setAttribute('aria-expanded', 'true'))
        await compare(trigger, oracle.locator('#trigger'))
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
        assert.deepEqual(await read(menu), await read(oracle.locator('#menu')))
        const checkItem = async (at, disabled = false, interaction = {}) => {
          await oracle.locator('#item').evaluate((e, disabled) => {
            if (disabled) e.setAttribute('aria-disabled', 'true')
            else e.removeAttribute('aria-disabled')
          }, disabled)
          await compare(rows.nth(at), oracle.locator('#item'), interaction)
          assert.equal(await rows.nth(at).getAttribute('aria-selected'), null)
        }
        await checkItem(0)
        await checkItem(1, true)
        await checkItem(0, false, { focus: true })
        await checkItem(2, false, { hover: true })
        await checkItem(0) // Stable geometry/modality for CSS-removal controls.
        if (mode !== 'literal') {
          for (const [part, node] of [
            ['root', owner],
            ['trigger', trigger],
            ['menu', menu],
            ['item', rows.first()],
          ])
            await assertCandidateStylesRequired(page, () => read(node), `Menu ${part} ${mode}`)
        }
        const before = await page.evaluate(() => window.changes.length)
        await rows.nth(1).evaluate((e) => e.click())
        assert.equal(await menu.count(), 1)
        assert.equal(await page.evaluate(() => window.changes.length), before)
        // Existing Web roving-focus behavior is exercised independently of
        // Native host events: Down skips disabled Beta and Enter acts once.
        await rows.first().focus()
        await page.keyboard.press('ArrowDown')
        await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
        await page.keyboard.press('Enter')
        assert.equal(await menu.count(), 0)
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'c')
        assert.equal(await trigger.evaluate((e) => e === document.activeElement), true)
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
        await trigger.press('ArrowUp')
        await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
        await page.keyboard.press('Escape')
        assert.equal(await menu.count(), 0)
        await trigger.click()
        await rows.first().waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent === 'Alpha')
        await rows.first().click()
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'a')
        assert.equal(await menu.count(), 0)
        assert.equal(
          await page.evaluate(() => window.calls),
          initialCalls,
          'open and item events do not rerun authored class inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Menu top layer escapes clipping while retaining live CSS ancestry and modal boundaries', {
  skip: !executablePath,
}, async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
    import {HozoMenu as Menu} from '../../packages/patterns/src/menu.tsx';
    window.actions=[];
    const items=[{label:'Alpha',onSelect:()=>window.actions.push('a')},{label:'Beta',disabled:true,onSelect:()=>window.actions.push('b')},{label:'Gamma',onSelect:()=>window.actions.push('c')}];
    const menu=<Menu trigger="Actions" items={items} accessibilityLabel="Letters" menuClassName="panel" itemClassName="item"/>;
    createRoot(document.getElementById('root')).render(<React.StrictMode>
      <div id="theme" className="theme" dir="rtl" lang="ja"><div id="clip">{menu}</div></div>
      <button id="outside">Outside</button><dialog id="modal">{menu}</dialog>
    </React.StrictMode>);`
  const bundleFor = async (mutation = false) => {
    let mutations = 0
    const result = await build({
      stdin: {
        contents: source,
        loader: 'tsx',
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: mutation
        ? [
            {
              name: 'inline-menu-negative-control',
              setup(builder) {
                builder.onLoad({ filter: /patterns[\\/]src[\\/]menu\.tsx$/ }, ({ path: file }) => {
                  const contents = readFileSync(file, 'utf8')
                  assert.equal((contents.match(/\s+topLayer\b/g) ?? []).length, 1)
                  mutations++
                  return {
                    contents: contents.replace(/\s+topLayer\b/, ''),
                    loader: 'tsx',
                    resolveDir: path.dirname(file),
                  }
                })
              },
            },
          ]
        : [],
    })
    assert.equal(mutations, mutation ? 1 : 0, 'negative control must mutate the real Menu source')
    return result.outputFiles[0].text
  }
  const script = await bundleFor()
  const mutationScript = await bundleFor(true)
  const css = `body{margin:0}#theme{position:absolute;left:35px;top:35px;width:180px;opacity:.7;transform:translate(20px,15px) scale(1.1)}
    #clip{height:44px;overflow:hidden}.theme{--ink:rgb(23,45,67);--surface:rgb(235,241,247);color:var(--ink);font:19px/1.4 monospace}
    .theme.hot{--ink:rgb(123,45,67);--surface:rgb(245,231,217);font-size:23px}
    .theme [role=menuitem]{border-inline-start:3px solid currentColor}.panel{background:var(--surface);min-width:170px}.item{padding:8px}
    #outside{position:absolute;left:500px;top:20px}#blocker{position:fixed;z-index:2147483647;background:pink}`
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const init = async (script, unsupported = false) => {
    await page.goto('about:blank')
    await page.setContent(
      `<style>${css}</style><div id="root"></div><div id="blocker" hidden></div>`,
    )
    await page.evaluate((unsupported) => {
      window.showCount = 0
      window.fallbackWarnings = []
      const original = HTMLElement.prototype.showPopover
      if (unsupported)
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: undefined,
        })
      else
        HTMLElement.prototype.showPopover = function (...args) {
          window.showCount++
          return original.apply(this, args)
        }
      const warn = console.warn
      console.warn = (...args) => {
        window.fallbackWarnings.push(args.join(' '))
        warn(...args)
      }
    }, unsupported)
    await page.addScriptTag({ content: script })
    await page.locator('#theme button').waitFor()
  }
  const trigger = () => page.locator('#theme button')
  const menu = () => page.locator('#theme [role=menu]')
  const rows = () => menu().getByRole('menuitem')
  const hit = (node) =>
    node.evaluate((e) => {
      const r = e.getBoundingClientRect()
      const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return target === e || e.contains(target)
    })
  const blocker = async () =>
    menu().evaluate((e) => {
      const r = e.getBoundingClientRect()
      Object.assign(document.getElementById('blocker').style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      })
      document.getElementById('blocker').hidden = false
    })
  try {
    // Mutate only the opt-in, retaining the real Menu and positioner. This
    // reproduces the original missing layer rather than comparing two copies
    // of the new algorithm. No forced click/hover bypasses hit testing.
    await init(mutationScript)
    await trigger().click()
    await menu().waitFor()
    await blocker()
    assert.equal(
      await hit(rows().last()),
      false,
      'the old inline path must fail the hit-test control',
    )

    await init(script)
    await trigger().click()
    await menu().waitFor()
    assert.equal(
      await page.locator('#theme [popover]').evaluate((e) => e.matches(':popover-open')),
      true,
    )
    assert.equal(
      await rows()
        .first()
        .evaluate((e) => e === document.activeElement),
      true,
    )
    assert.equal(
      await page.evaluate(() => window.showCount),
      1,
      'StrictMode setup does not repeatedly show an open host',
    )
    await blocker()
    assert.equal(await hit(rows().last()), true)
    await rows().last().hover()
    const inherited = () =>
      rows()
        .last()
        .evaluate((e) => {
          const s = getComputedStyle(e)
          return [
            s.color,
            s.fontSize,
            s.fontFamily,
            s.direction,
            s.borderInlineStartWidth,
            e.closest('[lang]')?.getAttribute('lang'),
            getComputedStyle(e.parentElement).backgroundColor,
          ]
        })
    assert.deepEqual(await inherited(), [
      'rgb(23, 45, 67)',
      '19px',
      'monospace',
      'rtl',
      '3px',
      'ja',
      'rgb(235, 241, 247)',
    ])
    await rows().last().focus()
    await page.locator('#theme').evaluate((e) => {
      e.classList.add('hot')
      e.dir = 'ltr'
      e.lang = 'en'
    })
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('#theme [role=menuitem]')).fontSize === '23px',
    )
    assert.deepEqual(await inherited(), [
      'rgb(123, 45, 67)',
      '23px',
      'monospace',
      'ltr',
      '3px',
      'en',
      'rgb(245, 231, 217)',
    ])
    assert.equal(
      await rows()
        .last()
        .evaluate((e) => e === document.activeElement),
      true,
    )
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const alignment = await page.locator('#theme').evaluate((e) => {
      const anchor = e.querySelector('button').getBoundingClientRect(),
        popup = e.querySelector('[data-placement]').getBoundingClientRect()
      return [Math.abs(anchor.left - popup.left), Math.abs(anchor.bottom + 4 - popup.top)]
    })
    assert.ok(
      alignment.every((delta) => delta < 1),
      `viewport coordinates survive transformed ancestors: ${alignment}`,
    )
    assert.equal(await rows().nth(1).getAttribute('aria-disabled'), 'true')
    await rows().last().click()
    assert.deepEqual(await page.evaluate(() => window.actions), ['c'])
    assert.equal(await page.locator(':popover-open').count(), 0)
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
    await page.locator('#blocker').evaluate((e) => {
      e.hidden = true
    })
    await trigger().press('ArrowUp')
    await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
    await page.keyboard.press('Escape')
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
    await trigger().click()
    await menu().waitFor()
    await page.locator('#outside').click()
    assert.equal(await menu().count(), 0)
    assert.equal(await page.locator('#outside').evaluate((e) => e === document.activeElement), true)
    assert.equal(await page.locator(':popover-open').count(), 0)
    assert.equal(await page.evaluate(() => window.showCount), 3)
    await page.locator('#modal').evaluate((e) => e.showModal())
    const dialog = page.locator('#modal')
    await dialog.getByRole('button', { name: 'Actions' }).click()
    await dialog.getByRole('menu').waitFor()
    assert.equal(await hit(dialog.getByRole('menuitem').last()), true)
    await dialog.getByRole('menuitem').last().click()
    assert.deepEqual(await page.evaluate(() => window.actions), ['c', 'c'])
    assert.equal(await dialog.evaluate((e) => e.open), true)
    await dialog.evaluate((e) => e.close())
    assert.deepEqual(errors, [])

    // Fresh document/script: unsupported capability is explicit and remains
    // usable inline in a layout that does not need the missing layer.
    await init(script, true)
    await page.locator('#theme').evaluate((e) => {
      e.style.transform = 'none'
      e.style.opacity = '1'
      e.querySelector('#clip').style.overflow = 'visible'
    })
    for (let n = 0; n < 2; n++) {
      await trigger().click()
      await menu().waitFor()
      assert.equal(await page.locator('#theme [popover]').count(), 0)
      await page.keyboard.press('Escape')
    }
    assert.equal(
      await page.evaluate(
        () =>
          window.fallbackWarnings.filter((x) => x.includes('showPopover is unavailable')).length,
      ),
      1,
    )
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
  } finally {
    await page.close()
  }
})

test('Listbox option focus and committed selection match isolated Tailwind in both CSS orders', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'p-2 opacity-75 text-[#654321] disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    option:
      'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-selected:border-2 aria-selected:text-[#123456] aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-checked:ml-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base = part === 'root' ? 'p-2 opacity-75' : 'p-1 border-0 opacity-100 rounded-none'
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  const source = `import {View,Listbox,cx} from '@hozo/core';const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><Listbox options={options} multiple={multiple}
          value={value} defaultValue={initial} onValueChange={choose} accessibilityLabel="Letters"
          className=${expression(mode, 'root')} optionClassName=${expression(mode, 'option')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  assert.ok(web.diagnostics.length > 0)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'listbox-owners.json'))
  candidates.scanFile('ListboxFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((value) => value.split(' ')))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {Listbox as HozoListbox} from '@hozo/patterns';
        window.calls=0;window.changes=[];
        const getClasses=value=>{window.calls++;return value};
        const choose=value=>window.changes.push(value);
        function App(){
          const [options,setOptions]=React.useState([{value:'a',label:'Alpha'},{value:'b',label:'Beta',disabled:true},{value:'c',label:'Gamma'}]);
          const [value,setValue]=React.useState(window.kind==='controlled'?'c':undefined);
          const multiple=window.kind==='multiple';const initial=multiple?['c']:'c';
          window.updateListbox=(value)=>{setValue(value);setOptions(options=>[...options].reverse())};
          return ${web.jsx};
        }
        createRoot(document.getElementById('root')).render(<App/>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.marginLeft,
        s.color,
        s.backgroundColor,
      ]
    })
  try {
    await oracle.setContent(`<style>html{font-size:16px}</style><style>${oracleCss}</style>
      <div id="owner" role="listbox" class="${looks.root}"><div id="option" tabindex="0" role="option" class="${looks.option}" aria-selected="false">Option</div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      for (const kind of ['single', 'multiple', 'controlled']) {
        await page.setContent(
          `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
        )
        await page.evaluate((kind) => {
          window.kind = kind
        }, kind)
        await page.addScriptTag({ content: bundle.outputFiles[0].text })
        for (const mode of ['literal', 'opaque', 'mixed']) {
          const owner = page.getByTestId(mode).getByRole('listbox')
          const rows = owner.getByRole('option')
          await rows.first().waitFor()
          const initialCalls = await page.evaluate(() => window.calls)
          await oracle.locator('#option').evaluate((e) => e.blur())
          await oracle.mouse.move(0, 0)
          assert.deepEqual(await read(owner), await read(oracle.locator('#owner')))
          assert.equal((await read(owner))[1], '0.75', 'a list div is neither enabled nor disabled')
          const check = async (
            at,
            selected,
            { disabled = false, focus = false, hover = false } = {},
          ) => {
            await page.bringToFront()
            await page.mouse.move(0, 0)
            await page.evaluate(() => document.activeElement?.blur())
            if (focus) {
              await page.keyboard.press('Shift')
              await rows.nth(at).focus()
            }
            if (hover) await rows.nth(at).hover()
            const actual = await read(rows.nth(at))
            assert.equal(await rows.nth(at).getAttribute('aria-selected'), String(selected))
            await oracle.bringToFront()
            await oracle.mouse.move(0, 0)
            const reference = oracle.locator('#option')
            await reference.evaluate(
              (e, { selected, disabled }) => {
                e.blur()
                e.setAttribute('aria-selected', String(selected))
                if (disabled) e.setAttribute('aria-disabled', 'true')
                else e.removeAttribute('aria-disabled')
              },
              { selected, disabled },
            )
            if (focus) {
              await oracle.keyboard.press('Shift')
              await reference.focus()
            }
            if (hover) await reference.hover()
            assert.deepEqual(actual, await read(reference), `${kind}/${mode}/${at}/${selected}`)
            await page.bringToFront()
          }
          await check(0, false)
          await check(1, false, { disabled: true })
          await check(2, true)
          await check(0, false, { focus: true })
          assert.equal(
            await rows.nth(2).getAttribute('aria-selected'),
            'true',
            'focus is not selection',
          )
          await check(0, false, { hover: true })
          if (mode !== 'literal') {
            // Removing candidate padding can move the row away from the
            // pointer. Probe a resting owner so restoring CSS does not also
            // require another physical mouse move to restore :hover.
            await check(0, false)
            await assertCandidateStylesRequired(
              page,
              () => read(owner),
              `Listbox root ${kind}/${mode}`,
            )
            await assertCandidateStylesRequired(
              page,
              () => read(rows.first()),
              `Listbox option ${kind}/${mode}`,
            )
          }
          await rows.first().click()
          await check(0, kind !== 'controlled')
          await check(2, kind !== 'single')
          const count = await page.evaluate(() => window.changes.length)
          await rows.nth(1).evaluate((e) => e.click())
          assert.equal(
            await page.evaluate(() => window.changes.length),
            count,
            'disabled option cannot commit',
          )
          if (kind === 'multiple') {
            assert.deepEqual(await page.evaluate(() => window.changes.at(-1)), ['c', 'a'])
            await rows.first().click()
            await check(0, false)
            await check(2, true)
          } else if (kind === 'controlled') {
            assert.equal(await page.evaluate(() => window.changes.at(-1)), 'a')
          }
          assert.equal(
            await page.evaluate(() => window.calls),
            initialCalls,
            'option events do not rerun authored expressions',
          )
        }
        // A caller update may rerun expressions; DOM identity and focus still
        // follow the option value, rather than the old array position.
        const rows = page.getByTestId('literal').getByRole('option')
        await rows.first().focus()
        await page.evaluate(() => window.updateListbox(window.kind === 'multiple' ? ['a'] : 'a'))
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="literal"] [role="option"]').textContent ===
            'Gamma',
        )
        assert.equal(await rows.nth(2).evaluate((e) => e === document.activeElement), true)
        assert.equal(await rows.nth(2).getAttribute('aria-selected'), 'true')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Combobox real owners match isolated Tailwind across focus, filtering, active options and blur', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'text-[#654321] opacity-75 disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    input:
      'p-2 opacity-100 rounded-none border-0 focus:opacity-50 focus-visible:outline-2 aria-expanded:border-2 enabled:px-3 disabled:mt-8 read-only:mb-8 aria-selected:ml-8',
    list: 'p-2 opacity-100 rounded-none read-only:rounded-lg disabled:opacity-25 enabled:opacity-50 aria-selected:border-8 text-[#123456]',
    option:
      'p-1 opacity-100 border-0 rounded-none hover:opacity-50 active:opacity-75 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-checked:ml-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base = {
      root: 'text-[#654321]',
      input: 'p-2 opacity-100 rounded-none border-0',
      list: 'p-2 opacity-100 rounded-none',
      option: 'p-1 opacity-100 border-0 rounded-none',
    }[part]
    assert.ok(classes.startsWith(base))
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  const source = `import {View,Combobox,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Combobox options={options} value="a" onValueChange={choose}
      accessibilityLabel="Country" emptyMessage="Nothing" className=${expression(mode, 'root')}
      ${['input', 'list', 'option'].map((part) => `${part}ClassName=${expression(mode, part)}`).join(' ')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  const residual = residualWarnings(web, source)
  assert.equal(residual.length, 5)
  for (const diagnostic of residual) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'combobox-owners.json'))
  candidates.scanFile('ComboboxFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((classes) => classes.split(' ')))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {Combobox as HozoCombobox} from '@hozo/patterns';
      window.calls=0;window.changes=[];
      const getClasses=value=>{window.calls++;return value};
      const choose=value=>window.changes.push(value);
      const options=[{value:'a',label:'Alpha'},{value:'b',label:'Beta',disabled:true},{value:'c',label:'Gamma'}];
      createRoot(document.getElementById('root')).render(${web.jsx});`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.color,
      ]
    })
  try {
    await oracle.setContent(`<style>html{font-size:16px}</style><style>${oracleCss}</style><div id="root-owner" class="${looks.root}">
      <input id="input" type="text" class="${looks.input}" aria-expanded="false"/>
      <div id="list" role="listbox" class="${looks.list}"><div id="option" role="option" class="${looks.option}" aria-selected="false"></div></div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const section = page.getByTestId(mode)
        const rootOwner = section.locator(':scope > div').first()
        const field = section.locator('input')
        const listbox = section.locator('[role="listbox"]')
        const rows = section.locator('[role="option"]')
        await field.waitFor()
        assert.deepEqual(await read(rootOwner), await read(oracle.locator('#root-owner')))
        assert.equal((await read(rootOwner))[2], '0.75', 'a wrapper div is not an enabled input')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(page, () => read(rootOwner), `Combobox root ${mode}`)
        const inputCheck = async (expanded) => {
          await oracle
            .locator('#input')
            .evaluate((e, expanded) => e.setAttribute('aria-expanded', String(expanded)), expanded)
          await comparePatternInput(page, oracle, field, oracle.locator('#input'), true)
          assert.equal(await field.getAttribute('aria-expanded'), String(expanded))
          assert.equal(await field.evaluate((e) => e === document.activeElement), true)
        }
        const optionCheck = async (index, selected, disabled = false, hover = false) => {
          const owner = rows.nth(index)
          await page.bringToFront()
          if (hover) await owner.hover()
          else await page.mouse.move(0, 0)
          const actual = await read(owner)
          await oracle.locator('#option').evaluate(
            (e, { selected, disabled }) => {
              e.setAttribute('aria-selected', String(selected))
              if (disabled) e.setAttribute('aria-disabled', 'true')
              else e.removeAttribute('aria-disabled')
            },
            { selected, disabled },
          )
          await oracle.bringToFront()
          if (hover) await oracle.locator('#option').hover()
          else await oracle.mouse.move(0, 0)
          assert.deepEqual(actual, await read(oracle.locator('#option')), `${mode} option ${index}`)
          await page.bringToFront()
          assert.equal(await owner.getAttribute('aria-selected'), String(selected))
          assert.equal(
            await field.evaluate((e) => e === document.activeElement),
            true,
            'options never steal DOM focus',
          )
        }
        await inputCheck(false)
        assert.equal(await listbox.count(), 0, 'focus alone does not open the popup')
        await field.fill('')
        await listbox.waitFor()
        assert.equal(await rows.count(), 3)
        await inputCheck(true)
        assert.deepEqual(await read(listbox), await read(oracle.locator('#list')))
        await optionCheck(0, false)
        await optionCheck(1, false, true)
        if (mode !== 'literal') {
          await assertCandidateStylesRequired(page, () => read(field), `Combobox input ${mode}`)
          await assertCandidateStylesRequired(page, () => read(listbox), `Combobox list ${mode}`)
          await assertCandidateStylesRequired(
            page,
            () => read(rows.first()),
            `Combobox option ${mode}`,
          )
        }
        await field.press('ArrowDown')
        await optionCheck(0, true)
        await optionCheck(2, false, false, true)
        await optionCheck(0, true)
        await field.press('ArrowDown')
        await optionCheck(1, true, true)
        const changes = await page.evaluate(() => window.changes.length)
        await field.press('Enter')
        assert.equal(await page.evaluate(() => window.changes.length), changes)
        await field.press('ArrowDown')
        await optionCheck(2, true)
        await field.fill('Ga')
        assert.equal(await rows.count(), 1)
        await optionCheck(0, false)
        await field.press('ArrowUp')
        await optionCheck(0, true)
        await field.press('Enter')
        assert.equal(await field.inputValue(), 'Gamma')
        assert.equal(await listbox.count(), 0)
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'c')
        await field.press('ArrowDown')
        await listbox.waitFor()
        await field.evaluate((e) => e.blur())
        assert.equal(await listbox.count(), 0)
        await field.focus()
        await field.fill('no-match')
        await listbox.waitFor()
        assert.equal(await rows.count(), 0)
        assert.equal(await listbox.textContent(), 'Nothing')
        await field.press('Escape')
        assert.equal(await listbox.count(), 0)
        await field.press('Escape')
        assert.equal(await field.inputValue(), '')
        assert.equal(
          await page.evaluate(() => window.calls),
          8,
          'owner events do not rerun authored class inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})
