// Decorative owners, Tailwind-free owned candidates, and @hozo/patterns Native runtime parity.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { openCandidateCache } from '@hozo/compiler'
import { createClassResolver, createClassTransitions, hozoSplitTextStyle } from '@hozo/engine'
import { hozoEdgeSpreadStyles } from '@hozo/engine/generated/authored-edges'
import { hozoAuthoredStyle, hozoGapSpreadStyles } from '@hozo/engine/generated/gap-styles'
import { hozoSpreadStyles } from '@hozo/engine/generated/spread-styles'
import { build } from 'esbuild'
import { Children, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import {
  compiledStyles,
  createCascadeContext,
  evaluate,
  executablePath,
  launchCandidateBrowser,
  residualWarnings,
} from './candidate-cascade-harness.mjs'

const {
  directory,
  cache,
  candidateCss,
  compiler,
  scannedCandidateCss,
  assertCandidateStylesRequired,
  cleanup,
} = createCascadeContext()
let browser

before(async () => {
  browser = await launchCandidateBrowser()
})
after(async () => {
  await browser?.close()
  cleanup()
})

test('Avatar decorative owners match independent Tailwind through image failure, retry and status changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 bg-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:mb-8 aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:mb-2'
  const slots = ['imageClassName', 'fallbackClassName', 'statusClassName']
  const expression = (mode, slot) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(own)})}`
        : `{cx(${JSON.stringify(`${own.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)},getClasses('${mode}/${slot}','read-only:rounded-lg'))}`
  const source = `import {View,Avatar,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Avatar src={src} name={name} status={status} fallback={fallback}
      className="text-[#654321] font-bold"
      ${slots.map((slot) => `${slot}=${expression(mode, slot)}`).join(' ')} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  const residual = residualWarnings(web, source)
  assert.equal(residual.length, 3)
  for (const diagnostic of residual) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} rounded-none text-[#654321] font-bold`.split(' ')
  const candidateCss = scannedCandidateCss('avatar-decorations', source, names)
  assert.ok(candidateCss.includes('read-only'))
  const oracleCss = (
    await compile(
      '@theme { --spacing:0.25rem; --radius-lg:0.5rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Avatar as HozoAvatar} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        function Example({src,name='Ada Lovelace',status,stamp}) {
          window.calls=[];
          const getClasses=(name,value)=>{window.calls.push(name);return value};
          const fallback=<b>?</b>;
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
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.marginBottom,
        s.marginTop,
        s.opacity,
        s.borderRadius,
        s.backgroundColor,
      ]
    })
  const picture = (color) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${color}"/></svg>`)}`
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><img id="image-oracle" class="${own} ${negative}"/><span id="span-oracle" class="${own} ${negative}"></span>`,
    )
    await page.route('https://avatar.test/**', (route) => route.abort())
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const show = async (props, stamp) => {
        await page.evaluate((props) => window.show(props), { ...props, stamp })
        await page.waitForFunction(
          (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
          stamp,
        )
        assert.equal((await page.evaluate(() => window.calls)).length, 6)
      }
      const check = async (part, image = false) => {
        const actual = await read(part)
        assert.deepEqual(
          actual,
          await read(oracle.locator(image ? '#image-oracle' : '#span-oracle')),
        )
        assert.deepEqual(actual, ['8px', '4px', '8px', '0px', '1', '8px', 'rgb(18, 52, 86)'])
        assert.equal(await part.getAttribute('aria-hidden'), 'true')
      }
      const owners = () =>
        ['literal', 'opaque', 'mixed'].map((mode) => page.locator(`[data-testid="${mode}"] > span`))
      await show({ src: picture('red'), status: 'online' }, 'initial')
      for (const owner of owners()) {
        assert.equal(await owner.getAttribute('role'), 'img')
        assert.equal(await owner.getAttribute('aria-label'), 'Ada Lovelace, online')
        await check(owner.locator('img'), true)
        await check(owner.locator('[data-hozo-status]'))
        assert.equal(await owner.locator('span:not([data-hozo-status])').count(), 0)
      }
      for (const mode of ['opaque', 'mixed']) {
        const owner = page.getByTestId(mode).locator('img')
        await assertCandidateStylesRequired(page, () => read(owner), `Avatar ${mode}`)
      }
      // Exercise the actual image error handler with a failed request, not
      // a reimplemented fallback condition in the test.
      await show({ src: 'https://avatar.test/broken.png', status: 'busy' }, 'failure')
      for (const owner of owners()) {
        await owner.locator('span:not([data-hozo-status])').waitFor()
        assert.equal(await owner.locator('img').count(), 0)
        const fallback = owner.locator('span:not([data-hozo-status])')
        await check(fallback)
        assert.equal(await fallback.textContent(), 'AL')
        assert.deepEqual(
          await fallback.evaluate((e) => [
            getComputedStyle(e).color,
            getComputedStyle(e).fontWeight,
          ]),
          ['rgb(101, 67, 33)', '700'],
        )
        await check(owner.locator('[data-hozo-status]'))
      }
      for (const mode of ['opaque', 'mixed']) {
        const owner = page.getByTestId(mode).locator('span:not([data-hozo-status])').last()
        await assertCandidateStylesRequired(page, () => read(owner), `Avatar fallback ${mode}`)
      }
      assert.equal(
        (await page.evaluate(() => window.calls)).length,
        6,
        'image errors do not rerun authored inputs',
      )
      await show({ src: picture('blue') }, 'retry')
      for (const owner of owners()) {
        await check(owner.locator('img'), true)
        assert.equal(
          await owner.locator('span').count(),
          0,
          'retry removes fallback; missing status removes dot',
        )
      }
      await show({ name: '' }, 'custom-fallback')
      for (const owner of owners()) {
        assert.equal(await owner.getAttribute('role'), null)
        assert.equal(await owner.getAttribute('aria-hidden'), 'true')
        assert.equal(await owner.locator('img,[data-hozo-status]').count(), 0)
        await check(owner.locator('span'))
        assert.equal(await owner.locator('span > b').textContent(), '?')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('CommandPalette decorative owners match independent Tailwind through query and active-command changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 text-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:text-[#ff0000] aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:text-[#123456]'
  const extra = 'bg-[#123456]'
  const slots = ['shortcutClassName', 'groupHeadingClassName', 'emptyClassName']
  const expression = (mode, slot) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative} ${extra}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(`${own} ${extra}`)})}`
        : `{cx(${JSON.stringify(`${own.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)},getClasses('${mode}/${slot}','${extra} read-only:rounded-lg'))}`
  const source = `import {View,CommandPalette,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><CommandPalette
      open={mode === '${mode}'} portal={false} commands={commands} accessibilityLabel="Decorative commands"
      itemClassName="aria-selected:font-bold" panelClassName="text-[#654321]"
      ${slots.map((slot) => `${slot}=${expression(mode, slot)}`).join(' ')} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  const residual = residualWarnings(web, source)
  assert.equal(residual.length, 3)
  for (const diagnostic of residual) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} ${extra} aria-selected:font-bold`.split(' ')
  const candidateCss = scannedCandidateCss('command-decorations', source, names)
  const oracleCss = (
    await compile(
      '@theme { --spacing:0.25rem; --radius-lg:0.5rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {CommandPalette as HozoCommandPalette} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        const initial=[{id:'a',label:'Alpha',group:'Group',shortcut:'A',onSelect:()=>{}},
          {id:'b',label:'Beta',group:'Group',shortcut:'B',disabled:true,onSelect:()=>{}},
          {id:'c',label:'Gamma',onSelect:()=>{}}];
        function Example({mode,stamp,plain}) {
          window.calls=[];
          const commands=plain ? [{id:'plain',label:'Plain',onSelect:()=>{}}] : initial;
          const getClasses=(name,value)=>{window.calls.push(name);return value};
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
  const page = await browser.newPage()
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
        s.color,
        s.marginTop,
        s.marginBottom,
        s.backgroundColor,
        s.fontWeight,
      ]
    })
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><div><span id="oracle" class="${own} ${negative} ${extra}"></span></div>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        await page.evaluate((mode) => window.show({ mode, stamp: mode, plain: false }), mode)
        await page.waitForFunction(
          (mode) => document.querySelector('[data-stamp]')?.dataset.stamp === mode,
          mode,
        )
        const section = page.locator(`[data-testid="${mode}"]`)
        const input = section.locator('[role="combobox"]')
        await input.waitFor()
        const option = (label) => section.locator('[role="option"]').filter({ hasText: label })
        const shortcut = (label) => option(label).locator('span[aria-hidden="true"]')
        const heading = section.locator('[role="group"] > [role="presentation"]')
        const check = async (locator, bold = false) => {
          await oracle.locator('#oracle').evaluate((e, bold) => {
            e.parentElement.style.fontWeight = bold ? '700' : '400'
          }, bold)
          const actual = await read(locator)
          assert.deepEqual(actual, await read(oracle.locator('#oracle')), mode)
          assert.deepEqual(actual, [
            '8px',
            '4px',
            '1',
            '8px',
            'rgb(18, 52, 86)',
            '0px',
            '8px',
            'rgb(18, 52, 86)',
            bold ? '700' : '400',
          ])
        }
        assert.equal(await section.locator('[role="option"]').count(), 3)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          6,
          'closed palettes still evaluate authored props',
        )
        await check(heading)
        await check(shortcut('Alpha'), true)
        await check(shortcut('Beta'))
        if (mode !== 'literal') {
          await assertCandidateStylesRequired(page, () => read(heading), `Command heading ${mode}`)
          await assertCandidateStylesRequired(
            page,
            () => read(shortcut('Alpha')),
            `Command shortcut ${mode}`,
          )
        }
        await option('Gamma').hover()
        await page.waitForFunction(
          () =>
            document.querySelector('[role="option"][aria-selected="true"]')?.textContent ===
            'Gamma',
        )
        await check(shortcut('Alpha'))
        await input.fill('Beta')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
        await check(shortcut('Beta'))
        await input.fill('no-match')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0)
        assert.equal(await heading.count(), 0)
        const empty = section.locator('[role="listbox"] + div').first()
        await check(empty)
        if (mode !== 'literal')
          await assertCandidateStylesRequired(page, () => read(empty), `Command empty ${mode}`)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          6,
          'query/hover must not rerun author inputs',
        )
        await input.fill('')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 3)
        await check(shortcut('Alpha'), true)
        await page.evaluate(
          (mode) => window.show({ mode, stamp: `${mode}-plain`, plain: true }),
          mode,
        )
        await page.waitForFunction(
          () => document.querySelector('[role="option"]')?.textContent === 'Plain',
        )
        assert.equal(await heading.count(), 0)
        assert.equal(await section.locator('[role="option"] span[aria-hidden]').count(), 0)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('decorative Stepper and Pagination owners match independent non-control Tailwind across class routes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 text-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:text-[#ff0000] aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:text-[#123456]'
  const extra = 'bg-[#123456]'
  const slots = {
    indicatorClassName: '',
    completedIndicatorClassName: 'border-2',
    currentIndicatorClassName: 'border-4',
    errorIndicatorClassName: 'border-8',
    descriptionClassName: '',
  }
  const expression = (mode, slot, status = '') => {
    const classes = `${own} ${status}`
    return mode === 'literal'
      ? JSON.stringify(`${classes} ${negative} ${extra}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(`${classes} ${extra}`)})}`
        : `{cx(${JSON.stringify(`${classes.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)}, getClasses('${mode}/${slot}', '${extra} read-only:rounded-lg'))}`
  }
  const source = `import {View,Stepper,Pagination,cx} from '@hozo/core'; const C = () => <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}">
      <Stepper steps={steps} activeStep={activeStep} onStepPress={clickable ? press : undefined}
        stepClassName="text-[#654321]" ${Object.entries(slots)
          .map(([slot, status]) => `${slot}=${expression(mode, slot, status)}`)
          .join(' ')} />
      <Pagination pageCount={pageCount} page={10} className="text-[#654321]" ellipsisClassName=${expression(mode, 'ellipsisClassName')} />
    </View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  const residual = residualWarnings(web, source)
  assert.equal(
    residual.length,
    6,
    'each mixed decorative slot retains its residual candidate warning',
  )
  for (const diagnostic of residual) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} ${extra} border-2 border-4 border-8`.split(' ')
  const candidateCss = scannedCandidateCss('decorative-owners', source, names)
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Stepper as HozoStepper, Pagination as HozoPagination} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        const steps=[{label:'Done',description:'Done details'}, {label:'Now',description:'Now details',disabled:true},
          {label:'Error',description:'Error details',status:'error'}, {label:'Later',description:'Later details'}];
        const press=()=>{};
        function Example({activeStep,pageCount,clickable,stamp}) {
          window.calls=[];
          const getClasses=(slot,value)=>{window.calls.push(slot); return value};
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
  const page = await browser.newPage()
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
        s.color,
        s.marginTop,
        s.marginBottom,
        s.backgroundColor,
        s.borderTopWidth,
      ]
    })
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><span id="oracle"></span>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const value of [
        { activeStep: 1, pageCount: 20, clickable: true, stamp: 'first' },
        { activeStep: 0, pageCount: 3, clickable: true, stamp: 'changed' },
        { activeStep: 1, pageCount: 20, clickable: false, stamp: 'descriptive' },
      ]) {
        await page.evaluate((value) => window.show(value), value)
        await page.waitForFunction(
          (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
          value.stamp,
        )
        assert.equal((await page.evaluate(() => window.calls)).length, 12)
        const borders = value.activeStep === 1 ? [2, 4, 8, 0] : [4, 0, 8, 0]
        for (const mode of ['literal', 'opaque', 'mixed']) {
          const section = page.locator(`[data-testid="${mode}"]`)
          const rows = section.locator('ol > li')
          assert.equal(await rows.count(), 4)
          for (let index = 0; index < 4; index++) {
            const owner = value.clickable ? rows.nth(index).locator('button') : rows.nth(index)
            const spans = owner.locator('span[aria-hidden="true"]')
            for (const [position, border] of [
              [0, borders[index]],
              [2, 0],
            ]) {
              await oracle.locator('#oracle').evaluate(
                (e, classes) => {
                  e.className = classes
                },
                `${own} ${negative} ${extra} ${border ? `border-${border}` : ''}`,
              )
              const actual = await read(spans.nth(position))
              assert.deepEqual(
                actual,
                await read(oracle.locator('#oracle')),
                `${mode}/${value.stamp}/${index}/${position}`,
              )
              assert.deepEqual(actual, [
                '8px',
                '4px',
                '1',
                '8px',
                'rgb(18, 52, 86)',
                '0px',
                '8px',
                'rgb(18, 52, 86)',
                `${border}px`,
              ])
              if (mode !== 'literal')
                await assertCandidateStylesRequired(
                  page,
                  () => read(spans.nth(position)),
                  `Stepper ${mode}/${value.stamp}/${index}/${position}`,
                )
            }
          }
          const ellipses = section.locator('nav li[aria-hidden="true"]')
          if (value.pageCount === 3) assert.equal(await ellipses.count(), 0)
          else {
            assert.ok((await ellipses.count()) > 0)
            await oracle.locator('#oracle').evaluate((e, classes) => {
              e.className = classes
            }, `${own} ${negative} ${extra}`)
            for (const ellipsis of await ellipses.all()) {
              assert.deepEqual(await read(ellipsis), await read(oracle.locator('#oracle')))
              if (mode !== 'literal')
                await assertCandidateStylesRequired(
                  page,
                  () => read(ellipsis),
                  `Pagination ellipsis ${mode}/${value.stamp}`,
                )
            }
          }
          if (value.clickable) {
            await rows.nth(0).locator('button').focus()
            assert.equal(
              (await page.evaluate(() => window.calls)).length,
              12,
              'focus does not re-evaluate author classes',
            )
          }
        }
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('root capture scopes keep inherited and loop-owned pixels aligned with independent Tailwind', {
  skip: !executablePath,
}, async () => {
  const source = `import {View,Text,cx} from '@hozo/core'; const C = () =>
    <View className={cx(first(), guard() ? 'text-[#123456]' : 'text-[#654321]', last())} testID={after()}>
      <Text>Known</Text><Foreign><Text>Opaque</Text></Foreign><><Text>Fragment</Text></>
      {rows.map(row => <Text className={readRow(row) ? 'p-2' : 'p-4'} key={row}>{row}</Text>)}
    </View>`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'root-capture.json'))
  candidates.scanFile('caller.ts', "const classes = 'opacity-75'", 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (await compile('@theme { --spacing:0.25rem; } @tailwind utilities;')).build([
    'text-[#123456]',
    'text-[#654321]',
    'p-2',
    'p-4',
    'opacity-75',
  ])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        const root = createRoot(document.getElementById('root'));
        function Foreign({children}) {return <article>{children}</article>}
        function Probe({value}) {
          window.calls = [];
          const first = () => {window.calls.push('first'); return 'opacity-75'};
          const guard = () => {window.calls.push('guard'); return value};
          const last = () => {window.calls.push('last')};
          const after = () => {window.calls.push('after'); return 'captured-root'};
          const rows = ['one','two'];
          const readRow = row => {window.calls.push(row); return (row === 'one') === value};
          return <section data-case={String(value)}>{${web.jsx}}</section>;
        }
        window.show = value => root.render(<Probe value={value}/>);`,
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
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><section id="oracle"></section>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const value of [true, false]) {
        await page.evaluate((value) => window.show(value), value)
        await page.waitForFunction(
          (value) => document.querySelector('[data-case]')?.dataset.case === String(value),
          value,
        )
        assert.deepEqual(await page.evaluate(() => window.calls), [
          'first',
          'guard',
          'last',
          'after',
          'one',
          'two',
        ])
        const expectedColor = value ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)'
        const actual = await page.locator('#root span').evaluateAll((elements) =>
          elements.map((e) => ({
            text: e.textContent,
            color: getComputedStyle(e).color,
            padding: getComputedStyle(e).paddingTop,
          })),
        )
        assert.deepEqual(
          actual.map((item) => item.text),
          ['Known', 'Opaque', 'Fragment', 'one', 'two'],
        )
        assert.ok(actual.every((item) => item.color === expectedColor))
        assert.deepEqual(
          actual.slice(3).map((item) => item.padding),
          value ? ['8px', '16px'] : ['16px', '8px'],
        )
        await oracle.locator('#oracle').evaluate((e, value) => {
          e.className = value ? 'text-[#123456]' : 'text-[#654321]'
          const nodes = ['Known', 'Opaque', 'Fragment', 'one', 'two'].map((text, index) => {
            const span = document.createElement('span')
            span.textContent = text
            if (index > 2) span.className = (index === 3) === value ? 'p-2' : 'p-4'
            return span
          })
          e.replaceChildren(...nodes)
        }, value)
        const expected = await oracle.locator('#oracle span').evaluateAll((elements) =>
          elements.map((e) => ({
            text: e.textContent,
            color: getComputedStyle(e).color,
            padding: getComputedStyle(e).paddingTop,
          })),
        )
        assert.deepEqual(
          actual,
          expected,
          'independent Tailwind inheritance and per-row guard selection',
        )
        const rootOpacity = () =>
          page.getByTestId('captured-root').evaluate((e) => getComputedStyle(e).opacity)
        assert.equal(await rootOpacity(), '0.75')
        await assertCandidateStylesRequired(page, rootOpacity, `root capture ${value}`)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
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
    assert.equal(
      props.removeClassName,
      dynamic ? `hozo-candidate-owner hozo-candidate-slot-owner ${dynamic}` : dynamic,
    )
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
test("@hozo/patterns' Native Tabs applies its class props, selected, pressed, hovered and focus-visible included", async () => {
  const states = 'hover:bg-red-500 focus-visible:border-2'
  const look = `p-4 px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50 ${states}`
  const { load } = await patternHarness('tabs-candidates.json', look)
  const { HozoTabs } = load('tabs.native.tsx')
  const tree = HozoTabs({
    className: 'p-4',
    tabClassName: `px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50 ${states}`,
    tabs: [
      { label: 'One', content: 'first' },
      { label: 'Two', content: 'second', disabled: true },
      { label: 'Three', content: 'third' },
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
  const [first, second, third] = found
  const at = (tab, pressed, extra = {}) =>
    flat(
      tab.props.style({ pressed, hovered: false, focused: false, focusVisible: false, ...extra }),
    )
  assert.equal(at(first, false).paddingStart, 12)
  assert.equal(at(first, false).backgroundColor, '#2b7fff', 'the selected tab')
  assert.equal(at(first, false).opacity, undefined)
  assert.equal(at(first, true).opacity, 0.8, 'pressed')
  assert.equal(at(second, false).backgroundColor, undefined, 'not selected')
  assert.equal(at(second, false).opacity, 0.5, 'disabled')
  // #897: the pattern's pressable reports more than `pressed`, so a pointer
  // over a tab and keyboard focus on one each have a look on Native too.
  assert.equal(at(third, false).backgroundColor, undefined, 'at rest')
  assert.equal(at(third, false, { hovered: true }).backgroundColor, '#fb2c36', 'hovered')
  assert.equal(at(third, false).borderTopWidth, undefined)
  assert.equal(at(third, false, { focused: true }).borderTopWidth, undefined, 'focused by a press')
  assert.equal(
    at(third, false, { focused: true, focusVisible: true }).borderTopWidth,
    2,
    'focused from the keyboard',
  )
})

// Runs `@hozo/patterns`' Native components from their own source, against
// stand-ins for React, React Native and the hooks they read, with a real
// candidate module scanned for `look` behind `@hozo/engine/project`.
async function patternHarness(cacheName, look) {
  const { readFileSync } = await import('node:fs')
  const cache = openCandidateCache(path.join(directory, cacheName))
  cache.scanFile('app.ts', `export const c = '${look}'`, 1)
  // A map that writes an inline edge both logically and physically reads
  // the layout direction from React Native (#2018).
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
    I18nManager: { isRTL: false },
  })
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const loaded = new Map()
  const load = (file) => {
    // These tree tests feed explicit interaction facts into the style/label
    // callbacks. The real shared tracker and host bridge are exercised by
    // native-control-indicators-*.test.mjs without launching a browser.
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
  const modules = (name) => {
    if (name.startsWith('./')) return load(name.slice(2))
    const resolved = {
      react: {
        // The real ones: they build elements and touch no renderer state.
        Children,
        createElement,
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
      // No transition table: these probes read resting looks, so every
      // control indicator part is the plain View it is without motion.
      '@hozo/engine/project': { hozoClasses, hozoClassTransitions: {} },
      '@hozo/engine/generated/animated': {
        HozoAnimated: 'HozoAnimated',
        PresenceContext: { Provider: 'PresenceContext.Provider' },
      },
      '@hozo/engine/generated/environment': { useHozoEnvironment: () => false },
      '@hozo/engine/generated/gap-styles': { hozoAuthoredStyle },
      // Use the real shared partition; this fixture only stands in for
      // hosts/hooks, not for the production style classification rules.
      '@hozo/engine': { hozoSplitTextStyle, createClassTransitions },
      '@hozo/behaviors': {
        hozoTextChildren: (children) => children,
        useHozoMessage: () => (key, _values, fallback) => fallback ?? key,
        useHozoI18n: () => ({ dir: 'ltr', locale: 'en' }),
      },
      // An accordion panel's exit, which these resting probes never start.
      '@hozo/behaviors/native': {
        usePresence: (show) => ({ mounted: show, state: show ? 'open' : 'closed', done: () => {} }),
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
      // An app without a `<SafeAreaProvider>`: Menu's sheet adds no inset.
      '@hozo/engine/generated/safe-area': {
        useHozoProvidedSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      },
    }[name]
    assert.ok(resolved, `Native pattern fixture has no module binding for ${name}`)
    return resolved
  }
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
// #1054: `@hozo/ui`'s Listbox, compiled from its real source, rendered by the
// real Native pattern. A caller's `style` reaches it through the wrapper's
// `...rest`, and used to replace the compiled box instead of following it.
test("a UI wrapper keeps its compiled look when a caller's Native style comes through its spread", async () => {
  const { load, flat } = await patternHarness('ui-spread-candidates.json', 'p-1')
  const source = readFileSync(
    new URL('../../../packages/ui/src/listbox.tsx', import.meta.url),
    'utf8',
  )
  const native = compiler.compileNative(source).find((part) => part.jsx.includes('HozoListbox'))
  // The wrapper's class is opaque, so the caller's style goes through the
  // edge-aware boundary, gap projection included (#2050).
  assert.ok(
    native.jsx.includes(
      '{...hozoEdgeSpreadStyles(I18nManager.isRTL, I18nManager.doLeftAndRightSwapInRTL, true)(',
    ),
    native.jsx,
  )
  const { HozoListbox } = load('listbox.native.tsx')
  const render = (rest) => {
    const element = evaluate(
      `const hozoStyles = ${native.styles};module.exports = (${native.jsx})`,
      {
        rest,
        className: undefined,
        // The module constant the compiled class residual still names.
        box: /const box =\s*'([^']+)'/.exec(source)[1],
        hozoClasses: () => undefined,
        hozoSpreadStyles,
        hozoGapSpreadStyles,
        hozoEdgeSpreadStyles,
        I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: true },
        HozoListbox,
      },
    )
    return element.type(element.props)
  }
  const options = [{ value: 'a', label: 'A' }]

  const bare = flat(render({ options }).props.style)
  assert.equal(bare.maxHeight, 240, 'without a caller style, the compiled bound')

  let reads = 0
  const rest = {
    options,
    get style() {
      reads += 1
      return { paddingTop: 19, marginTop: 7, gap: 16 }
    },
  }
  const styled = flat(render(rest).props.style)
  assert.equal(styled.maxHeight, 240, 'the compiled bound survives a caller style')
  assert.equal(styled.paddingTop, 19, "the caller's edge beats the compiled padding")
  assert.equal(styled.marginTop, 7, "and the caller's own property arrives")
  assert.equal(styled.rowGap, 16, 'the caller gap reaches both Native axes')
  assert.equal(styled.columnGap, 16)
  assert.equal(reads, 1, 'the spread is read once')
})

test("@hozo/patterns' Native controls apply their class props with each one's state", async () => {
  const look =
    'p-2 text-red-500 aria-expanded:bg-blue-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const menuLook = `${look} aria-disabled:opacity-50 disabled:mt-8`
  const { load, pressables, at } = await patternHarness(
    'controls-candidates.json',
    `${look} ${menuLook}`,
  )

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
    itemClassName: menuLook,
    trigger: 'More',
    items: [{ label: 'Delete', disabled: true }],
  })
  const [trigger, item] = pressables(menu)
  assert.equal(at(trigger, true).box.opacity, 0.8, 'menu: pressed trigger')
  assert.equal(at(trigger, false).text.color, '#fb2c36', 'menu: trigger label')
  assert.equal(at(item, false).box.opacity, 0.5, 'menu: disabled item')
  assert.equal(at(item, false).box.marginTop, undefined, 'menu: aria-disabled is not form disabled')
})

// #886, slice 3, second batch: Tabs' labels, Chip, Pagination, Tree,
// Combobox and Toolbar. Popover, Drawer, BottomSheet, Dialog and Tooltip
// resolve the same way but sit on Animated, a Portal or a positioner,
// which these stand-ins do not model.
test("@hozo/patterns' second batch of Native controls apply their class props", async () => {
  const look =
    'p-2 text-red-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 aria-expanded:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const chipLook =
    'p-2 text-red-500 aria-pressed:bg-blue-500 aria-checked:outline-4 active:opacity-80 disabled:opacity-50'
  const currentPageLook = 'p-2 bg-blue-500'
  const { load, pressables, at, flat } = await patternHarness(
    'batch-candidates.json',
    `${look} ${chipLook} ${currentPageLook}`,
  )

  const [tab] = pressables(
    load('tabs.native.tsx').HozoTabs({
      tabClassName: look,
      tabs: [{ label: 'One', content: 'x' }],
    }),
  )
  assert.equal(at(tab, false).text.color, '#fb2c36', 'tabs: a string label takes the text half')
  assert.equal(at(tab, false).box.color, undefined, 'tabs: and the box does not')

  const chip = load('chip.native.tsx').HozoChip({
    className: chipLook,
    defaultSelected: true,
    children: 'Filter',
  })
  assert.equal(at(chip, false).box.backgroundColor, '#2b7fff', 'chip: aria-pressed selection')
  assert.equal(
    at(chip, false).box.outlineWidth,
    undefined,
    'chip: RN checked is not CSS aria-checked',
  )
  assert.equal(at(chip, true).box.opacity, 0.8, 'chip: pressed')
  assert.equal(at(chip, false).text.color, '#fb2c36', 'chip: label')

  const pages = pressables(
    load('pagination.native.tsx').HozoPagination({
      itemClassName: look,
      currentItemClassName: currentPageLook,
      pageCount: 3,
      defaultPage: 1,
    }),
  )
  const [previous, first, second] = pages
  assert.equal(at(previous, false).box.opacity, 0.5, 'pagination: disabled previous')
  assert.equal(
    at(first, false).box.backgroundColor,
    '#2b7fff',
    'pagination: current-page class gate',
  )
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
