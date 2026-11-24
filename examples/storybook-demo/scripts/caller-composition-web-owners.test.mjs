// Real Web owner facts for UI/form controls, mixed ternaries, and inline edge precedence.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { createClassResolver, cx } from '@hozo/engine'
import { Chip } from '@hozo/patterns'
import { tailwindPackageDir } from '@hozo/tailwind'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import Yoga from 'yoga-layout'
import {
  hozoAuthoredEdges,
  hozoEdgeSpreadStyles,
} from '../../../packages/engine/src/authored-edges.ts'
import { hozoAuthoredStyle } from '../../../packages/engine/src/authored-gap.ts'
import { hozoSpreadStyles } from '../../../packages/engine/src/spread-styles.ts'
import {
  buildOracleCss,
  caller,
  createBaseCandidates,
  createTempDirectory,
  createUiCompositionHarness,
  evaluate,
  executablePath,
  launchCallerBrowser,
  own,
  radiusCandidates,
  removeTempDirectory,
  selectFocusClasses,
  sliderFocusClasses,
  textAreaFocusClasses,
} from './caller-composition-harness.mjs'

const directory = createTempDirectory()
const compiler = createCompiler()
const { candidates, hozoClasses } = createBaseCandidates(directory)
const { uiTheme, uiCompiler, uiCache, uiCases, uiCandidates } =
  await createUiCompositionHarness(directory)
let browser, oracleCss

before(async () => {
  oracleCss = await buildOracleCss()
  browser = await launchCallerBrowser()
})
after(async () => {
  await browser?.close()
  removeTempDirectory(directory)
})

test('real Web Chip and Tailwind preserve row and removal typography at their actual owners', {
  skip: !executablePath,
}, async (t) => {
  const classes =
    'p-4 text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold'
  const removalClasses = 'p-2 focus:text-[#eecc00] active:font-bold'
  const css = (
    await compile(
      '@theme { --spacing: .25rem; --font-weight-semibold: 600; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build(`${classes} ${removalClasses}`.split(' '))
  // Actual Web pattern plus Tailwind, not Hozo lowering or the inheritance
  // reference. Browser UA button resets are an explicit preflight assumption.
  const fixture = await build({
    stdin: {
      contents: `import {createElement as h,memo,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {HozoChip} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/patterns/src/chip.tsx', import.meta.url)))};
      const root=createRoot(document.getElementById('root'));let next=0;
      const Leaf=memo(({id,own})=>{const [token]=useState(()=>++next);return h('span',{id,style:own,'data-token':token},id)});
      window.removed=[];window.changed=[];const remove=()=>window.removed.push(true),change=(value)=>window.changed.push(value);
      window.renderChip=({selectable,removable,host,childOwn,disabled})=>{
        flushSync(()=>root.render(h('main',{style:{...host,lineHeight:host.lineHeight+'px'}},h('div',{id:'chip'},h(HozoChip,{defaultSelected:selectable?false:undefined,onSelectedChange:selectable?change:undefined,onRemove:removable?remove:undefined,disabled,accessibilityLabel:'Filter',className:${JSON.stringify(classes)},removeClassName:${JSON.stringify(removalClasses)},removeIcon:h(Leaf,{id:'icon',own:childOwn})},h(Leaf,{id:'label'}))))));
        const owner=document.getElementById('chip').firstElementChild;owner.id='owner';
        const removal=owner.querySelector('button[aria-label="Remove Filter"]');if(removal)removal.id='remove';
      };`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  assert.ok(
    Object.keys(fixture.metafile.inputs).some((file) => file.endsWith('patterns/src/chip.tsx')),
  )
  const rest = {
    color: '#112233',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: 1,
    textAlign: 'left',
    textTransform: 'uppercase',
  }
  for (const selectable of [false, true]) {
    for (const removable of [false, true]) {
      const page = await browser.newPage()
      let host = rest,
        rowOwn,
        removeOwn,
        childOwn,
        stages = 0
      try {
        await page.setContent(`<!doctype html><style>
          button { font:inherit; color:inherit; letter-spacing:inherit; text-align:inherit; text-transform:inherit; }
          ${css}</style><div id="root"></div>`)
        await page.addScriptTag({ content: fixture.outputFiles[0].text })
        await page.mouse.move(600, 400)
        const update = async () => {
          await page.evaluate(
            ({ selectable, removable, host, childOwn }) => {
              window.renderChip({ selectable, removable, host, childOwn })
            },
            { selectable, removable, host, childOwn },
          )
        }
        const setOwn = async (selector, style) => {
          await page.locator(selector).evaluate((node, own) => {
            node.removeAttribute('style')
            for (const [key, value] of Object.entries(own ?? {}))
              node.style[key] = typeof value === 'number' ? `${value}px` : value
          }, style)
        }
        const read = (selector) =>
          page.locator(selector).evaluate((node) => {
            const style = getComputedStyle(node)
            return {
              color:
                '#' +
                style.color
                  .match(/\d+/g)
                  .map((part) => Number(part).toString(16).padStart(2, '0'))
                  .join(''),
              fontSize: parseFloat(style.fontSize),
              fontWeight: style.fontWeight,
              lineHeight: parseFloat(style.lineHeight),
              letterSpacing: parseFloat(style.letterSpacing),
              textAlign: style.textAlign,
              textTransform: style.textTransform,
            }
          })
        const check = async (rowState = {}, removeState = {}) => {
          const frame = { ...host, color: '#1355bb', fontSize: 18, ...rowState, ...rowOwn }
          assert.deepEqual(await read('#label'), frame)
          if (removable) {
            assert.deepEqual(await read('#icon'), {
              ...frame,
              ...removeState,
              ...removeOwn,
              ...childOwn,
            })
            assert.equal(
              await page
                .locator('#icon')
                .evaluate((node) => node.closest('[aria-hidden]')?.getAttribute('aria-hidden')),
              'true',
            )
          }
          assert.equal(
            await page.locator('#chip button').count(),
            Number(selectable) + Number(removable),
          )
          assert.equal(
            await page.locator('#label').evaluate((node) => node === window.firstLabel),
            true,
          )
          if (removable)
            assert.equal(
              await page.locator('#icon').evaluate((node) => node === window.firstIcon),
              true,
            )
          stages++
        }
        await update()
        await page.evaluate(() => {
          window.firstLabel = document.getElementById('label')
          window.firstIcon = document.getElementById('icon')
        })
        await check()
        if (removable) {
          await page.locator('#remove').focus()
          await check({}, { color: '#eecc00' })
          await page.locator('#remove').hover()
          await check({ color: '#00aa00' }, { color: '#eecc00' })
          await page.mouse.down()
          await check({ color: '#cc0000' }, { color: '#eecc00', fontWeight: '700' })
          await page.mouse.up()
          await check({ color: '#00aa00' }, { color: '#eecc00' })
          assert.deepEqual(await page.evaluate(() => window.removed), [true])
          assert.deepEqual(await page.evaluate(() => window.changed), [])
          await page.mouse.move(600, 400)
          await page.locator('#remove').evaluate((node) => node.blur())
          await check()
        }
        if (selectable) {
          const toggle = page.locator('#chip button[aria-pressed]')
          await toggle.focus()
          // A composite row is not focused merely because its toggle is.
          const focused = removable ? {} : { fontWeight: '600' }
          await check(focused)
          await page.keyboard.press('Space')
          assert.deepEqual(await page.evaluate(() => window.changed), [true])
          assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
          assert.deepEqual(await page.evaluate(() => window.removed), removable ? [true] : [])
          await check(focused)
          await toggle.evaluate((node) => node.blur())
          await check()
        }
        host = { ...rest, color: '#334455', fontSize: 28, lineHeight: 40 }
        await update()
        await check()
        rowOwn = { color: '#abcdef', fontSize: 30 }
        await setOwn('#owner', rowOwn)
        if (removable) {
          removeOwn = { color: '#ff00aa', fontSize: 12 }
          await setOwn('#remove', removeOwn)
        }
        await check()
        childOwn = { color: '#222222', fontSize: 10 }
        await update()
        await check()
        childOwn = undefined
        rowOwn = undefined
        removeOwn = undefined
        await setOwn('#owner')
        if (removable) await setOwn('#remove')
        await update()
        await check()
        assert.equal(stages, 5 + Number(selectable) * 3 + Number(removable) * 5)
        t.diagnostic(
          `Chip selectable=${selectable}, removable=${removable}: ${stages} browser stages`,
        )
      } finally {
        await page.close()
      }
    }
  }
})

test('Skeleton resting corners survive outside a caller breakpoint and lose inside it', {
  skip: !executablePath,
}, async () => {
  const { source } = uiCases.find((entry) => entry.name === 'Skeleton')
  const web = lowerModule(source, 'skeleton.tsx', 'skeleton.tsx', uiCompiler, '')
  assert.ok(web)
  const { HozoSkeleton } = evaluate(web.code.replace(/^import .*$/gm, ''), {
    cx,
    h: (_type, props) => props,
    Skeleton: 'Skeleton',
    View: 'View',
  })
  // Force the default's candidate rule after the callers: leaking it back
  // into that tier must visibly break the full/desktop radii below.
  const css = uiCache.renderCss(uiTheme, radiusCandidates)
  const page = await browser.newPage()
  const read = () =>
    page
      .locator('div')
      .evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))
  try {
    for (const className of [
      undefined,
      'size-10 rounded-full',
      'h-4 md:rounded-none',
      'h-4 md:rounded-full',
    ]) {
      const props = HozoSkeleton({ className })
      for (const width of [375, 1024]) {
        await page.setViewportSize({ width, height: 400 })
        const round =
          className?.includes('rounded-full') && (!className.includes('md:') || width >= 768)
        const expected = width >= 768 && className?.includes('md:rounded-none') ? 0 : 8
        for (const sheets of [
          [web.css, css],
          [css, web.css],
        ]) {
          await page.setContent(
            `${sheets.map((value) => `<style>${value}</style>`).join('')}<div class="${props.className}">Loading</div>`,
          )
          const actual = await read()
          if (round) assert.ok(actual >= 20, `${className} at ${width}: full radius`)
          else assert.equal(actual, expected, `${className} at ${width}: resting/responsive radius`)
          if (round || expected === 0) {
            await page
              .locator('div')
              .evaluate((element) => element.classList.add('rounded-hozo-control'))
            assert.equal(
              await read(),
              8,
              'reintroducing the default candidate must expose the original leak',
            )
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('the real Web portal inherits destination typography instead of the React opener', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement as h,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {Portal,PortalProvider} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/behaviors/src/portal.tsx', import.meta.url)))};
      const root=createRoot(document.getElementById('root'));let next=0;
      function Label({own}){const [token]=useState(()=>++next);return h('span',{id:'label',style:own,'data-token':token},'Label',h('span',{id:'small',style:{fontSize:(5/6)+'em'}},'Small'))}
      window.renderPortal=({opener,own,disabled,custom})=>flushSync(()=>root.render(h('div',{id:'opener',style:{...opener,lineHeight:String(opener.lineHeight)+'px'}},h(PortalProvider,{container:custom?document.getElementById('destination'):null},h(Portal,{disabled},h(Label,{own}))))));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const rest = {
    color: '#112233',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: 1,
    textAlign: 'left',
    textTransform: 'uppercase',
  }
  const next = { ...rest, color: '#334455', fontSize: 28, lineHeight: 40 }
  for (const [custom, disabled] of [
    [true, false],
    [false, false],
    [true, true],
  ]) {
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><div id="root"></div><div id="destination"></div>')
      await page.addScriptTag({ content: fixture.outputFiles[0].text })
      let host = rest,
        opener = { ...rest, color: '#abcdef', fontSize: 30 },
        own
      const update = async () => {
        await page.evaluate(
          ({ host, opener, own, custom, disabled }) => {
            for (const element of [document.body, document.getElementById('destination')]) {
              for (const [key, value] of Object.entries(host))
                element.style[key] = typeof value === 'number' ? `${value}px` : value
            }
            window.renderPortal({ opener, own, custom, disabled })
          },
          { host, opener, own, custom, disabled },
        )
        await page.locator('#label').waitFor()
      }
      const check = async () => {
        const expected = { ...(disabled ? opener : host), ...own }
        const actual = await page.locator('#label').evaluate((node) => {
          const style = getComputedStyle(node)
          const color =
            '#' +
            style.color
              .match(/\d+/g)
              .map((part) => Number(part).toString(16).padStart(2, '0'))
              .join('')
          return {
            color,
            fontSize: parseFloat(style.fontSize),
            fontWeight: style.fontWeight,
            lineHeight: parseFloat(style.lineHeight),
            letterSpacing: parseFloat(style.letterSpacing),
            textAlign: style.textAlign,
            textTransform: style.textTransform,
          }
        })
        assert.deepEqual(actual, expected)
        const identity = await page
          .locator('#label')
          .evaluate((node) => [node === window.firstLabel, node.dataset.token])
        assert.equal(identity[0], true)
        assert.equal(identity[1], '1')
        assert.equal(
          await page
            .locator('#small')
            .evaluate((node) => Math.round(parseFloat(getComputedStyle(node).fontSize))),
          Math.round((expected.fontSize * 5) / 6),
        )
        assert.equal(
          await page.locator('#label').evaluate((node) => Boolean(node.closest('#opener'))),
          disabled,
        )
        assert.equal(
          await page.locator('#label').evaluate((node) => Boolean(node.closest('#destination'))),
          custom && !disabled,
        )
      }
      await update()
      await page.evaluate(() => {
        window.firstLabel = document.getElementById('label')
      })
      await check()
      opener = { ...opener, color: '#eecc00', fontSize: 42 }
      await update()
      await check()
      host = next
      await update()
      await check()
      own = { color: '#abcdef', fontSize: 30 }
      await update()
      await check()
      own = undefined
      await update()
      await check()
    } finally {
      await page.close()
    }
  }
})

test('the real Web slider keeps focus when aria-disabled changes, until its host blurs', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoSlider} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/patterns/src/slider.tsx', import.meta.url)))};
      const root = createRoot(document.getElementById('root'));
      window.renderSlider = (disabled) => flushSync(() => root.render(createElement(HozoSlider, {disabled, defaultValue:50, thumbClassName:${JSON.stringify(sliderFocusClasses)}})));
      window.renderSlider(false);`,
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
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const thumb = page.locator('[role="slider"]')
    await thumb.focus()
    await page.evaluate(() => window.renderSlider(true))
    assert.equal(await thumb.getAttribute('tabindex'), '-1')
    assert.equal(await thumb.getAttribute('aria-disabled'), 'true')
    assert.deepEqual(
      await thumb.evaluate((element) => {
        const style = getComputedStyle(element)
        return [
          document.activeElement === element,
          style.opacity,
          style.outlineWidth,
          style.borderTopWidth,
          style.marginTop,
        ]
      }),
      [true, '0.75', '2px', '4px', '0px'],
    )
    await thumb.press('ArrowRight')
    assert.equal(await thumb.getAttribute('aria-valuenow'), '50')
    await thumb.evaluate((element) => element.blur())
    await page.evaluate(() => window.renderSlider(false))
    assert.equal(await thumb.evaluate((element) => document.activeElement === element), false)
    assert.equal(await thumb.evaluate((element) => getComputedStyle(element).opacity), '1')
  } finally {
    await page.close()
  }
})

test('the real Web TextArea owns editable focus and form predicates, not its wrapper or count', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoTextArea} from ${JSON.stringify(source('packages/form/src/text-area.tsx'))};
      const root = createRoot(document.getElementById('root'));
      window.renderTextArea = (props = {}) => flushSync(() => root.render(createElement(HozoTextArea, {maxLength:20, className:'disabled:opacity-25', countClassName:'disabled:opacity-25', fieldClassName:${JSON.stringify(textAreaFocusClasses)}, ...props})));
      window.renderTextArea();`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'web-form-behaviors',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: 'web-form-behaviors',
            namespace: 'form-probe',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'form-probe' }, () => ({
            contents: `export {useAnnounce} from ${JSON.stringify(source('packages/behaviors/src/live-region.tsx'))}; export {useHozoMessage} from ${JSON.stringify(source('packages/behaviors/src/i18n.ts'))};`,
            loader: 'ts',
            resolveDir: source(''),
          }))
        },
      },
    ],
  })
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const field = page.locator('textarea')
    const read = () =>
      field.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          focused: element.matches(':focus'),
          readOnly: element.matches(':read-only'),
          opacity: style.opacity,
          border: style.borderTopWidth,
          outline: style.outlineWidth,
          wrapperOpacity: getComputedStyle(element.parentElement).opacity,
          countOpacity: getComputedStyle(element.parentElement.querySelector('span')).opacity,
        }
      })
    await field.focus()
    assert.equal((await read()).opacity, '0.75')
    assert.equal((await read()).wrapperOpacity, '1')
    assert.equal((await read()).countOpacity, '1')
    await page.evaluate(() => window.renderTextArea({ readOnly: true }))
    assert.equal((await read()).focused, true)
    assert.equal((await read()).readOnly, true)
    assert.equal((await read()).border, '4px')
    await page.evaluate(() => window.renderTextArea({ disabled: true }))
    await page.waitForFunction(
      () => {
        const textarea = document.querySelector('textarea')
        return textarea?.matches(':disabled') && !textarea.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
    assert.equal((await read()).focused, false)
    assert.equal((await read()).readOnly, true)
    assert.equal((await read()).opacity, '0.25')
    await page.evaluate(() =>
      window.renderTextArea({ 'aria-invalid': true, 'aria-required': true }),
    )
    assert.equal((await read()).focused, false)
    assert.equal((await read()).opacity, '1')
    assert.equal((await read()).border, '4px')
    assert.equal((await read()).outline, '4px')
  } finally {
    await page.close()
  }
})

test('the real Web NativeSelect is read-only, blurs when disabled and has no authored expanded fact', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoNativeSelect} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/form/src/native-select.tsx', import.meta.url)))};
      const root = createRoot(document.getElementById('root'));
      window.renderSelect = (props = {}) => flushSync(() => root.render(createElement(HozoNativeSelect, {options:[{value:'slow', label:'Standard'},{value:'fast',label:'Express'},{value:'closed',label:'Unavailable',disabled:true}], defaultValue:'slow', className:${JSON.stringify(selectFocusClasses)}, ...props})));
      window.renderSelect();`,
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
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const control = page.locator('select')
    const read = () =>
      control.evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':focus'),
          element.matches(':read-only'),
          s.opacity,
          s.borderTopWidth,
          s.marginTop,
          element.value,
        ]
      })
    await control.focus()
    assert.deepEqual(await read(), [true, true, '0.75', '4px', '0px', 'slow'])
    assert.equal(await control.getAttribute('aria-expanded'), null)
    await page.evaluate(() => window.renderSelect({ disabled: true }))
    await page.waitForFunction(
      () => {
        const select = document.querySelector('select')
        return select?.matches(':disabled') && !select.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
    assert.deepEqual(await read(), [false, true, '0.25', '4px', '0px', 'slow'])
    await page.evaluate(() => window.renderSelect({ 'aria-invalid': true, 'aria-required': true }))
    assert.deepEqual(await read(), [false, true, '1', '4px', '0px', 'slow'])
    assert.equal(await control.evaluate((element) => getComputedStyle(element).outlineWidth), '4px')
    await control.selectOption('fast')
    assert.equal(await control.inputValue(), 'fast')
    assert.equal(await page.locator('option[value="closed"]').isDisabled(), true)
  } finally {
    await page.close()
  }
})

test('the real Web Calendar separates group, header and table typography without borrowing disabled', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const chrome = {
    className: 'p-2 text-[#123456] font-bold disabled:opacity-25',
    headerClassName: 'p-3 text-[14px] text-[#abcdef] disabled:opacity-25',
    gridClassName: 'p-4 text-[18px] disabled:opacity-25',
  }
  const monthClasses =
    'enabled:border-2 disabled:opacity-25 aria-selected:outline-4 aria-disabled:mt-8 hover:bg-[#dd1100] focus:opacity-75 focus-visible:font-bold active:opacity-50'
  const dayClasses =
    'p-2 aria-selected:border-2 aria-disabled:opacity-25 data-[hozo-range-start]:border-4 data-[hozo-range-end]:border-4 data-[hozo-in-range]:opacity-75 data-[hozo-outside]:opacity-50 disabled:mt-8 enabled:mb-8 focus:font-bold hover:underline data-[hozo-disabled]:hover:no-underline'
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoCalendar} from ${JSON.stringify(source('packages/form/src/calendar.tsx'))};
      const root = createRoot(document.getElementById('root'));
      window.calendarChanges = [];
      window.renderCalendar = (props = {}) => flushSync(() => root.render(createElement(HozoCalendar, {onChange:value => window.calendarChanges.push(value),defaultMonth:{year:2026,month:6},today:{year:2026,month:6,day:15},locale:'en-US',weeks:6,min:{year:2026,month:6,day:1},max:{year:2026,month:6,day:30},...${JSON.stringify(chrome)}, ...props})));
      window.renderCalendar();`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'calendar-web-i18n',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: source('packages/behaviors/src/i18n.ts'),
          }))
        },
      },
    ],
  })
  const css = (
    await compile('@theme { --spacing: .25rem; --font-weight-bold:700; } @tailwind utilities;')
  ).build([...Object.values(chrome), monthClasses, dayClasses].flatMap((value) => value.split(' ')))
  const page = await browser.newPage()
  try {
    // Actual Tailwind Preflight in standards mode, like the application.
    // Quirks mode gives tables legacy color behavior unrelated to Hozo.
    const preflight = readFileSync(
      fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
      'utf8',
    )
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="root"></div>`)
    assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const root = page.locator('[role="group"]')
    const header = root.locator(':scope > div')
    const grid = root.locator('table')
    for (const [owner, padding] of [
      [root, '8px'],
      [header, '12px'],
      [grid, '16px'],
    ]) {
      assert.deepEqual(
        await owner.evaluate((element) => {
          const s = getComputedStyle(element)
          return [
            element.matches(':disabled'),
            element.matches(':enabled'),
            element.matches(':read-only'),
            s.paddingTop,
            s.opacity,
          ]
        }),
        [false, false, true, padding, '1'],
      )
    }
    assert.equal(await header.locator('button:disabled').count(), 2)
    const read = (locator) =>
      locator.evaluate((element) => {
        const s = getComputedStyle(element)
        return [s.color, s.fontSize, s.fontWeight]
      })
    assert.deepEqual(await read(header.locator('[aria-live]')), [
      'rgb(171, 205, 239)',
      '14px',
      '700',
    ])
    assert.deepEqual(await read(grid.locator('th').first()), ['rgb(18, 52, 86)', '18px', '700'])
    assert.deepEqual(await read(grid.locator('td').first()), ['rgb(18, 52, 86)', '18px', '700'])
    assert.equal(await grid.locator('td').count(), 42)
    await page.evaluate(
      (classes) =>
        window.renderCalendar({
          max: { year: 2026, month: 8, day: 31 },
          monthButtonClassName: classes,
        }),
      monthClasses,
    )
    const back = header.locator('button').first()
    const next = header.locator('button').last()
    assert.equal(await back.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.deepEqual(
      await next.evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':disabled'),
          element.matches(':enabled'),
          element.matches(':read-only'),
          element.hasAttribute('aria-selected'),
          element.hasAttribute('aria-disabled'),
          s.borderTopWidth,
          s.outlineWidth === '4px',
          s.marginTop,
        ]
      }),
      [false, true, true, false, false, '2px', false, '0px'],
    )
    await next.hover()
    assert.equal(
      await next.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(221, 17, 0)',
    )
    assert.notEqual(
      await back.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await next.focus()
    assert.equal(await next.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await next.evaluate((element) => element.matches(':focus-visible')), true)
    await page.mouse.down()
    assert.equal(await next.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await page.mouse.up()
    await page.evaluate(() => window.renderCalendar({ max: { year: 2026, month: 7, day: 31 } }))
    assert.equal(await next.isDisabled(), true)
    // Blink clears focus from a newly disabled control on a post-layout task,
    // not synchronously when `disabled` is set.
    await page.waitForFunction(
      () => {
        const buttons = document.querySelectorAll('[role="group"] > div button')
        const last = buttons[buttons.length - 1]
        return last?.matches(':disabled') && !last.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
    assert.equal(await next.evaluate((element) => element.matches(':focus')), false)
    const dayProps = {
      month: { year: 2026, month: 6 },
      min: { year: 2026, month: 6, day: 10 },
      max: { year: 2026, month: 6, day: 20 },
      range: true,
      value: { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
      dayClassName: dayClasses,
    }
    await page.evaluate((props) => window.renderCalendar(props), dayProps)
    const day = (n) => grid.locator(`td[aria-label*="June ${n},"]`)
    for (const end of [12, 15])
      assert.equal(
        await day(end).evaluate((element) => getComputedStyle(element).borderTopWidth),
        '4px',
      )
    assert.equal(await day(12).getAttribute('data-hozo-range-start'), '')
    assert.equal(await day(15).getAttribute('data-hozo-range-end'), '')
    assert.equal(await day(13).getAttribute('data-hozo-in-range'), '')
    assert.equal(await day(13).evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await day(13).getAttribute('aria-selected'), 'true')
    assert.deepEqual(
      await day(9).evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':disabled'),
          element.matches(':enabled'),
          element.matches(':read-only'),
          s.marginTop,
          s.marginBottom,
          s.opacity,
        ]
      }),
      [false, false, true, '0px', '0px', '0.25'],
    )
    assert.equal(await day(9).getAttribute('data-hozo-disabled'), '')
    const outside = grid.locator('td[data-hozo-outside]').first()
    assert.equal(await outside.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await day(12).focus()
    await page.evaluate(
      (props) => window.renderCalendar({ ...props, min: { year: 2026, month: 6, day: 14 } }),
      dayProps,
    )
    assert.equal(await day(12).getAttribute('aria-disabled'), 'true')
    assert.equal(
      await day(12).evaluate((element) => document.activeElement === element),
      true,
      'aria-disabled td retains actual focus',
    )
    await day(12).dispatchEvent('click')
    assert.deepEqual(await page.evaluate(() => window.calendarChanges), [])
    await page.evaluate(
      (props) =>
        window.renderCalendar({ ...props, range: false, value: { year: 2026, month: 6, day: 12 } }),
      dayProps,
    )
    assert.equal(await day(12).getAttribute('data-hozo-range-start'), null)
    assert.equal(await day(12).getAttribute('data-hozo-range-end'), null)
    assert.equal(
      await day(12).evaluate((element) => getComputedStyle(element).borderTopWidth),
      '2px',
    )
  } finally {
    await page.close()
  }
})

for (const [name, file, value] of [
  ['DatePicker', 'date-picker', { year: 2026, month: 6, day: 12 }],
  [
    'DateRangePicker',
    'date-range-picker',
    { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
  ],
  ['DateTimePicker', 'date-time-picker', { year: 2026, month: 6, day: 12, hour: 9, minute: 10 }],
]) {
  test(`the real Web ${name} trigger owns form, expansion and interaction facts`, {
    skip: !executablePath,
  }, async () => {
    const source = (relative) =>
      fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
    const classes =
      'p-4 hover:bg-[#dd1100] focus:opacity-75 active:opacity-50 aria-expanded:border-2 disabled:opacity-25 aria-disabled:mt-8'
    const frameClasses = 'p-6 text-[#dd1100] text-[#0011dd] text-[#118800] text-lg font-bold'
    const fixture = await build({
      stdin: {
        contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {Hozo${name}} from ${JSON.stringify(source(`packages/form/src/${file}.tsx`))};
        const root = createRoot(document.getElementById('picker'));
        window.pickerChanges = []; window.pickerOpens = [];
        window.renderPicker = (disabled = false, extra = {}) => flushSync(() => root.render(createElement(Hozo${name}, {disabled, value:${JSON.stringify(value)}, defaultMonth:{year:2026,month:6},today:{year:2026,month:6,day:15},locale:'en-US',accessibilityLabel:'Departure',formatValue:()=>'Chosen 2026',className:'disabled:opacity-25',triggerClassName:${JSON.stringify(classes)},doneClassName:${JSON.stringify(classes)},onChange: value => window.pickerChanges.push(value),onOpenChange: open => window.pickerOpens.push(open),...extra}, () => null)));
        window.renderPicker();`,
        resolveDir: source('examples/storybook-demo'),
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'picker-web-behaviors',
          setup(builder) {
            builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
              path: 'web-picker-behaviors',
              namespace: 'picker-probe',
            }))
            builder.onLoad({ filter: /.*/, namespace: 'picker-probe' }, () => ({
              contents: [
                `export {useHozoI18n,useHozoMessage} from ${JSON.stringify(source('packages/behaviors/src/i18n.ts'))};`,
                ...['FloatingPositioner', 'FocusScope', 'DismissableLayer'].map(
                  (entry, i) =>
                    `export {${entry}} from ${JSON.stringify(source(`packages/behaviors/src/${['floating-positioner', 'focus-scope', 'dismissable-layer'][i]}.tsx`))};`,
                ),
              ].join('\n'),
              loader: 'ts',
              resolveDir: source(''),
            }))
          },
        },
      ],
    })
    const css = (
      await compile(
        '@theme { --spacing:.25rem; --text-lg:1.125rem; --font-weight-bold:700; } @tailwind utilities;',
      )
    ).build(`${classes} ${frameClasses}`.split(' '))
    const page = await browser.newPage()
    try {
      const preflight = readFileSync(
        fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
        'utf8',
      )
      await page.setContent(
        `<!doctype html><style>${preflight}\n${css}</style><div id="picker"></div>`,
      )
      await page.addScriptTag({ content: fixture.outputFiles[0].text })
      const trigger = page.locator('#picker > div > button')
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
      assert.equal(await trigger.getAttribute('aria-disabled'), null)
      assert.equal(await trigger.getAttribute('aria-selected'), null)
      assert.deepEqual(
        await trigger.evaluate((element) => [
          element.matches(':read-only'),
          element.matches(':enabled'),
        ]),
        [true, true],
      )
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).paddingTop),
        '16px',
      )
      await trigger.hover()
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgb(221, 17, 0)',
      )
      await trigger.focus()
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.75')
      await page.mouse.down()
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.5')
      await page.mouse.up()
      await page.locator('[role="dialog"]').waitFor({ state: 'visible' })
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).borderTopWidth),
        '2px',
      )
      if (name === 'DateTimePicker') {
        // This button is inside the dialog, but is not its expansion trigger.
        // Even disabling the already-open field must leave its exit operable.
        await page.evaluate(() => window.renderPicker(true))
        const done = page.getByRole('button', { name: 'Done', exact: true })
        assert.equal(await done.isEnabled(), true)
        assert.equal(await done.getAttribute('aria-expanded'), null)
        assert.equal(await done.getAttribute('aria-disabled'), null)
        assert.deepEqual(
          await done.evaluate((element) => [
            element.matches(':enabled'),
            element.matches(':read-only'),
          ]),
          [true, true],
        )
        assert.equal(await done.evaluate((element) => getComputedStyle(element).paddingTop), '16px')
        assert.equal(
          await done.evaluate((element) => getComputedStyle(element).borderTopWidth),
          '0px',
        )
        assert.equal(await done.evaluate((element) => getComputedStyle(element).marginTop), '0px')
        await done.hover()
        assert.equal(
          await done.evaluate((element) => getComputedStyle(element).backgroundColor),
          'rgb(221, 17, 0)',
        )
        await done.focus()
        assert.equal(await done.evaluate((element) => getComputedStyle(element).opacity), '0.75')
        await done.press('Enter')
        await page.locator('[role="dialog"]').waitFor({ state: 'detached' })
        assert.deepEqual(await page.evaluate(() => window.pickerChanges), [])
        assert.deepEqual(await page.evaluate(() => window.pickerOpens), [true, false])
        await page.evaluate(() => window.renderPicker(false))
        await trigger.click()
        await page.locator('[role="dialog"]').waitFor({ state: 'visible' })
      }
      await page.keyboard.press('Escape')
      await page.locator('[role="dialog"]').waitFor({ state: 'detached' })
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
      // Dialog removal is not a browser focus-settled signal. Establish
      // this next case's focus explicitly, then observe the result of the
      // one disabled update rather than sampling a transient focus pseudo.
      await trigger.focus()
      assert.equal(await trigger.evaluate((element) => element.matches(':focus')), true)
      await page.evaluate(() => window.renderPicker(true))
      assert.equal(await trigger.isDisabled(), true)
      await page.waitForFunction(
        () => {
          const button = document.querySelector('#picker > div > button')
          return button?.matches(':disabled') && !button.matches(':focus')
        },
        null,
        { timeout: 2000 },
      )
      assert.equal(await trigger.evaluate((element) => element.matches(':focus')), false)
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.25')
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).marginTop), '0px')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element.parentElement).opacity),
        '1',
      )
      assert.equal(await trigger.locator('[hidden]').innerText(), 'Departure')
      assert.equal(await trigger.locator('span').last().innerText(), 'Chosen 2026')
      const frame = {
        className: 'p-4 text-[#dd1100] font-bold',
        dialogClassName: 'p-6 text-[#0011dd] text-lg',
        triggerClassName: '',
        doneClassName: '',
      }
      await page.evaluate((frame) => window.renderPicker(false, frame), frame)
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).color),
        'rgb(221, 17, 0)',
      )
      await trigger.click()
      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).paddingTop), '24px')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element.parentElement).paddingTop),
        '16px',
      )
      const heading = dialog.locator('[aria-live="polite"]')
      for (const label of [heading, dialog.locator('td').first()]) {
        assert.deepEqual(
          await label.evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.color, style.fontSize, style.fontWeight]
          }),
          ['rgb(0, 17, 221)', '18px', '700'],
        )
      }
      await page.evaluate(
        (frame) =>
          window.renderPicker(false, {
            ...frame,
            calendarClassName: 'text-[#118800]',
            triggerClassName: 'text-[#118800]',
            doneClassName: 'text-[#118800]',
          }),
        frame,
      )
      assert.equal(
        await heading.evaluate((element) => getComputedStyle(element).color),
        'rgb(17, 136, 0)',
      )
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).color),
        'rgb(17, 136, 0)',
      )
      if (name === 'DateTimePicker')
        assert.equal(
          await page
            .getByRole('button', { name: 'Done', exact: true })
            .evaluate((element) => getComputedStyle(element).color),
          'rgb(17, 136, 0)',
        )
      await page.evaluate(() =>
        window.renderPicker(false, { triggerClassName: '', doneClassName: '' }),
      )
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).paddingTop), '0px')
      assert.equal(await heading.evaluate((element) => getComputedStyle(element).fontWeight), '400')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
    } finally {
      await page.close()
    }
  })
}

test('the real Web FileDropzone keeps drag-active separate from focus, press and disabled', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const props = {
    accessibilityLabel: 'Upload photo',
    className: 'p-4 hover:bg-[#dd1100] focus:opacity-75 disabled:opacity-25',
    activeClassName: 'border-4',
  }
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoFileDropzone} from ${JSON.stringify(source('packages/form/src/file-dropzone.tsx'))};
      const root=createRoot(document.getElementById('zone')); window.zonePicks=0;
      window.renderZone=props=>flushSync(()=>root.render(createElement(HozoFileDropzone,props,'Choose a file')));
      window.renderZone(${JSON.stringify(props)});
      document.querySelector('input[type=file]').addEventListener('click',event=>{event.preventDefault();window.zonePicks++});`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const css = (await compile('@theme {--spacing:.25rem;} @tailwind utilities;')).build(
    `${props.className} ${props.activeClassName}`.split(' '),
  )
  const preflight = readFileSync(
    fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
    'utf8',
  )
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="zone"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const zone = page.getByRole('button', { name: 'Upload photo', exact: true })
    const border = () => zone.evaluate((element) => getComputedStyle(element).borderTopWidth)
    const drag = async (type, expected) => {
      // Delivery is not the concurrent React root's continuous-event commit.
      // Dispatch once, cross render turns (including for negative assertions),
      // then observe the actual marker AND pixels. Never retry the action.
      await zone.dispatchEvent(type)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await page.waitForFunction(
        (expected) => {
          const button = document.querySelector('#zone button')
          return (
            button?.getAttribute('data-hozo-drag-active') === expected.active &&
            getComputedStyle(button).borderTopWidth === expected.border
          )
        },
        expected,
        { timeout: 5000 },
      )
      return zone.evaluate((button) => ({
        active: button.getAttribute('data-hozo-drag-active'),
        border: getComputedStyle(button).borderTopWidth,
      }))
    }
    const active = { active: '', border: '4px' }
    const inactive = { active: null, border: '0px' }
    assert.equal(await border(), '0px')
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).paddingTop), '16px')
    await zone.focus()
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await border(), '0px', 'focus is not drag-active')
    await zone.press('Enter')
    await zone.press('Space')
    await zone.click()
    assert.equal(await page.evaluate(() => window.zonePicks), 3)
    assert.equal(await border(), '0px', 'activation is not drag-active')
    assert.deepEqual(await drag('dragenter', active), active)
    assert.deepEqual(await drag('dragenter', active), active)
    assert.deepEqual(
      await drag('dragleave', active),
      active,
      'one nested leave is not leaving the zone',
    )
    assert.deepEqual(await drag('dragleave', inactive), inactive)
    await page.evaluate((props) => window.renderZone({ ...props, disabled: true }), props)
    assert.equal(await zone.isDisabled(), true)
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.deepEqual(await drag('dragenter', inactive), inactive)
    await page.evaluate((props) => window.renderZone({ ...props, className: undefined }), props)
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).paddingTop), '0px')
  } finally {
    await page.close()
  }
})

test('the real Web TimePicker keeps owner form, text and interaction facts distinct', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const frame = {
    className: 'p-4 text-[#dd1100] font-bold disabled:opacity-25 aria-disabled:mt-8',
    fieldClassName: 'p-3 text-[#0011dd] text-lg disabled:opacity-25 aria-disabled:mt-8',
  }
  const valueClasses =
    'p-5 hover:bg-[#dd1100] focus:opacity-75 focus-visible:font-bold aria-disabled:border-4 disabled:opacity-25 data-[hozo-disabled]:mt-8'
  const periodClasses =
    'p-4 hover:bg-[#dd1100] focus:opacity-75 disabled:opacity-25 aria-disabled:border-4 data-[hozo-disabled]:mt-8'
  const stepClasses =
    'absolute end-0 size-6 data-[hozo-step=increase]:top-0 data-[hozo-step=decrease]:bottom-0 data-[hozo-step=increase]:hover:opacity-50 data-[hozo-step=decrease]:hover:opacity-75 disabled:opacity-25'
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoTimePicker} from ${JSON.stringify(source('packages/form/src/time-picker.tsx'))};
      const root=createRoot(document.getElementById('time')); window.timeChanges=[];
      window.renderTime = props => flushSync(() => root.render(createElement(HozoTimePicker,{defaultValue:{hour:9,minute:10},hour12:true,locale:'en-US',onChange:next=>window.timeChanges.push(next),...props})));
      window.renderTime(${JSON.stringify({ ...frame, disabled: true })});`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'time-i18n',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: source('packages/behaviors/src/i18n.ts'),
          }))
        },
      },
    ],
  })
  const css = (
    await compile(
      '@theme { --spacing:.25rem; --text-lg:1.125rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(
    `${frame.className} ${frame.fieldClassName} ${valueClasses} ${periodClasses} ${stepClasses} relative min-h-12 pe-6`.split(
      ' ',
    ),
  )
  const page = await browser.newPage()
  try {
    const preflight = readFileSync(
      fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
      'utf8',
    )
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="time"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const root = page.locator('#time > div')
    const field = page.locator('[data-hozo-field="hour"]')
    for (const box of [root, field]) {
      assert.deepEqual(
        await box.evaluate((e) => [
          e.matches(':disabled'),
          e.matches(':enabled'),
          e.matches(':read-only'),
        ]),
        [false, false, true],
      )
      assert.equal(await box.evaluate((e) => getComputedStyle(e).opacity), '1')
      assert.equal(await box.evaluate((e) => getComputedStyle(e).marginTop), '0px')
    }
    assert.equal(await root.evaluate((e) => getComputedStyle(e).paddingTop), '16px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).paddingTop), '12px')
    for (const label of [field.getByRole('spinbutton'), field.getByRole('button').first()])
      assert.deepEqual(
        await label.evaluate((e) => {
          const s = getComputedStyle(e)
          return [s.color, s.fontSize, s.fontWeight]
        }),
        ['rgb(0, 17, 221)', '18px', '700'],
      )
    const period = page.getByRole('button', { name: 'AM or PM', exact: true })
    assert.equal(await period.evaluate((e) => getComputedStyle(e).color), 'rgb(221, 17, 0)')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).fontSize), '16px')
    await page.evaluate(() => window.renderTime({ disabled: true }))
    assert.equal(await field.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await root.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '400')
    const owned = {
      valueClassName: valueClasses,
      periodClassName: periodClasses,
      fieldClassName: 'relative min-h-12 pe-6',
      stepClassName: stepClasses,
    }
    await page.evaluate((props) => window.renderTime(props), owned)
    const up = field.getByRole('button', { name: 'Increase Hour', exact: true })
    const down = field.getByRole('button', { name: 'Decrease Hour', exact: true })
    const geometry = () =>
      field.evaluate((element) => {
        const field = element.getBoundingClientRect()
        const buttons = [...element.querySelectorAll('button')].map((button) => {
          const r = button.getBoundingClientRect()
          return {
            top: r.top - field.top,
            bottom: field.bottom - r.bottom,
            width: r.width,
            height: r.height,
            left: r.left - field.left,
            right: field.right - r.right,
          }
        })
        return buttons
      })
    let arrows = await geometry()
    assert.equal(arrows[0].top, 0)
    assert.equal(arrows[1].bottom, 0)
    for (const arrow of arrows)
      assert.deepEqual([arrow.width, arrow.height, arrow.right], [24, 24, 0])
    await page.locator('html').evaluate((element) => {
      element.dir = 'rtl'
    })
    arrows = await geometry()
    for (const arrow of arrows) assert.equal(arrow.left, 0, 'end follows actual direction')
    await page.locator('html').evaluate((element) => {
      element.dir = 'ltr'
    })
    await up.hover()
    assert.equal(await up.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await down.hover()
    assert.equal(await down.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    const value = field.getByRole('spinbutton')
    assert.deepEqual(
      await value.evaluate((e) => [
        e.matches(':disabled'),
        e.matches(':enabled'),
        e.matches(':read-only'),
      ]),
      [false, false, true],
    )
    assert.equal(await value.evaluate((e) => getComputedStyle(e).paddingTop), '20px')
    await value.hover()
    assert.equal(
      await value.evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await page.keyboard.press('Tab')
    await value.focus()
    assert.equal(await value.evaluate((e) => e.matches(':focus-visible')), true)
    assert.equal(await value.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).fontWeight), '700')
    await page.evaluate((props) => window.renderTime({ ...props, disabled: true }), owned)
    assert.equal(
      await value.evaluate((e) => e.matches(':focus')),
      true,
      'aria-disabled div retains focus',
    )
    assert.equal(await value.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).borderTopWidth), '4px')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).marginTop), '32px')
    assert.equal(await period.isDisabled(), true)
    assert.equal(await up.isDisabled(), true)
    assert.equal(await down.isDisabled(), true)
    assert.equal(await up.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.equal(await down.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.equal(await period.getAttribute('aria-disabled'), null)
    assert.equal(await period.evaluate((e) => getComputedStyle(e).borderTopWidth), '0px')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).opacity), '0.25')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).marginTop), '32px')
    await value.press('ArrowUp')
    assert.deepEqual(await page.evaluate(() => window.timeChanges), [])
    await page.evaluate((props) => window.renderTime(props), owned)
    await period.hover()
    assert.equal(
      await period.evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await period.focus()
    assert.equal(await period.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    await period.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.timeChanges), [{ hour: 21, minute: 10 }])
    assert.equal(await period.innerText(), 'PM')
    await page.evaluate(() => window.renderTime({ hour12: false }))
    assert.equal(await period.count(), 0)
    assert.equal(await value.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await up.evaluate((element) => getComputedStyle(element).position), 'static')
  } finally {
    await page.close()
  }
})

for (const host of ['View', 'Text', 'Chip root', 'Chip remove']) {
  test(`a mixed ternary keeps own classes below caller classes on ${host}`, {
    skip: !executablePath,
  }, async () => {
    const secondary = host === 'Chip remove'
    const tag = host.startsWith('Chip') ? 'Chip' : host
    const input = 'selected ? `${own} ${caller}` : own'
    const usage = secondary
      ? `<Chip onRemove={remove} removeClassName={${input}}>Label</Chip>`
      : `<${tag} className={${input}}>Label</${tag}>`
    const source = `import {${tag}} from '@hozo/core'; const own=${JSON.stringify(own)}; const el=${usage}`
    const web = compiler.compile(source)[0]
    const native = compiler.compileNative(source)[0]
    const page = await browser.newPage()
    const oracle = await browser.newPage()
    const select = secondary ? 'button' : tag === 'View' ? 'div' : 'span'
    const read = (p) =>
      p
        .locator(select)
        .first()
        .evaluate((e) => {
          const s = getComputedStyle(e)
          return {
            padding: s.paddingTop,
            radius: s.borderTopLeftRadius,
            color: s.color,
            weight: s.fontWeight,
            size: s.fontSize,
            leading: s.lineHeight,
          }
        })
    try {
      for (const selected of [false, true]) {
        const nativeProps = evaluate(
          `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
          {
            selected,
            own,
            caller,
            remove() {},
            hozoClasses,
            StyleSheet: { create: (s) => s },
            View: 'View',
            Text: 'Text',
            HozoChip: 'Chip',
            h: (_type, props) => props,
          },
        )
        const style = secondary
          ? nativeProps.hozoRemoveStyle
          : tag === 'Chip'
            ? nativeProps.hozoStyle
            : nativeProps.style
        const nativeStyle = Object.assign(
          {},
          ...[typeof style === 'function' ? style({}) : style].flat(Infinity).filter(Boolean),
        )
        assert.equal(nativeStyle.paddingTop, selected ? 32 : 8)
        assert.equal(nativeStyle.borderRadius, selected ? 48 : 6)
        // A Native View cannot draw typography; descendant propagation is
        // RFC 006's separate integration gate, not certified by a box style.
        if (tag !== 'View') {
          assert.equal(nativeStyle.color, selected ? '#0011dd' : '#dd1100')
          assert.equal(String(nativeStyle.fontWeight), selected ? '400' : '600')
          assert.equal(nativeStyle.fontSize, selected ? 28 : 20)
          assert.equal(nativeStyle.lineHeight, selected ? 36 : 24)
        }
        const html = renderToStaticMarkup(
          evaluate(`module.exports=(${web.jsx})`, {
            selected,
            own,
            caller,
            remove() {},
            HozoChip: Chip,
            h: createElement,
          }),
        )
        // The oracle has only the independently expected winning class set,
        // not the same conflicting expression or Hozo's generated CSS.
        await oracle.setContent(
          `<style>${oracleCss}</style><${secondary ? 'button' : tag === 'View' ? 'div' : 'span'} class="${selected ? caller : own}">Label</${secondary ? 'button' : tag === 'View' ? 'div' : 'span'}>`,
        )
        const expected = await read(oracle)
        for (const sheets of [
          [web.css, candidates],
          [candidates, web.css],
        ]) {
          await page.setContent(`${sheets.map((css) => `<style>${css}</style>`).join('')}${html}`)
          assert.deepEqual(await read(page), expected)
          if (selected) {
            // Reintroduce precisely #1152's leak. The same candidate sheet
            // must expose it, or this fixture could pass before the fix too.
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.add(...classes.split(' '))
              }, own)
            assert.notDeepEqual(
              await read(page),
              expected,
              'leaked own candidates must fail the oracle',
            )
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.remove(...classes.split(' '))
              }, own)
            assert.deepEqual(await read(page), expected)
            await page.evaluate(() => {
              for (const style of document.querySelectorAll('style'))
                if (style.textContent.includes(':not(hozo-none)')) style.remove()
            })
            assert.notDeepEqual(
              await read(page),
              expected,
              'the caller candidate sheet must actually contribute',
            )
          }
        }
      }
    } finally {
      await page.close()
      await oracle.close()
    }
  })
}

test('Chromium and Yoga agree on logical and physical inline edges across directions, orders, states and the RTL swap (#2018, #2050)', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const cases = [
    {
      id: 'px-pl',
      classes: 'px-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ps-pl',
      classes: 'ps-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'pe-pl',
      classes: 'pe-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'p-ps-pl',
      classes: 'p-8 ps-4 pl-1',
      props: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      family: 'padding',
    },
    {
      id: 'p-px',
      classes: 'p-8 px-2',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ps-pe-mirrored',
      classes: 'ps-4 pe-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'hover-pl-over-px',
      classes: 'px-8 hover:pl-1',
      hovered: true,
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'hover-ps-over-pl',
      classes: 'hover:ps-8 pl-1',
      hovered: true,
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'mx-ml',
      classes: 'mx-8 ml-1',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'ms-ml',
      classes: 'ms-8 ml-1',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'border-x-l',
      classes: 'border-x-4 border-l-2',
      props: ['borderLeftWidth', 'borderRightWidth'],
      family: 'border',
    },
    // #2050: a physical utility on its own keeps its side in RTL, as in
    // Tailwind, rather than following the swap.
    {
      id: 'pl-alone',
      classes: 'pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'p-pr',
      classes: 'p-4 pr-2',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ml-alone',
      classes: 'ml-2',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'border-l-alone',
      classes: 'border-l-2',
      props: ['borderLeftWidth', 'borderRightWidth'],
      family: 'border',
    },
  ]
  const allNames = [...new Set(cases.flatMap((c) => c.classes.split(' ')))]
  const compiled = await compile(css, { base: process.cwd() })
  const referenceCss = compiled.build(allNames)
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('edge-matrix.ts', JSON.stringify(allNames.join(' ')), 1)
  const nativeModuleCode = cache.renderNativeModule()

  // React Native's `swapLeftAndRightInRTL`, on by default on Android and
  // iOS: in an RTL layout, left overwrites start and right overwrites end
  // before Yoga sees them (`YogaLayoutableShadowNode::swapStyleLeftAndRight`).
  const swapped = (styleObj) => {
    const out = {}
    const physical = []
    for (const [k, v] of Object.entries(styleObj)) {
      const to = k
        .replace(/^left$/, 'start')
        .replace(/^right$/, 'end')
        .replace(/Left(?=Width$|Color$|$)/, 'Start')
        .replace(/Right(?=Width$|Color$|$)/, 'End')
      if (to === k) out[k] = v
      else physical.push([to, v])
    }
    for (const [k, v] of physical) out[k] = v
    return out
  }
  const yogaEdge = (input, family, dir, swap) => {
    const styleObj = swap && dir === 'rtl' ? swapped(input) : input
    const root = Yoga.Node.create()
    root.setWidth(200)
    root.setHeight(100)
    const node = Yoga.Node.create()
    const apply = (k, v) => {
      if (typeof v !== 'number') return
      const map = {
        paddingLeft: [Yoga.EDGE_LEFT, 'setPadding'],
        paddingRight: [Yoga.EDGE_RIGHT, 'setPadding'],
        paddingTop: [Yoga.EDGE_TOP, 'setPadding'],
        paddingBottom: [Yoga.EDGE_BOTTOM, 'setPadding'],
        paddingStart: [Yoga.EDGE_START, 'setPadding'],
        paddingEnd: [Yoga.EDGE_END, 'setPadding'],
        marginLeft: [Yoga.EDGE_LEFT, 'setMargin'],
        marginRight: [Yoga.EDGE_RIGHT, 'setMargin'],
        marginStart: [Yoga.EDGE_START, 'setMargin'],
        marginEnd: [Yoga.EDGE_END, 'setMargin'],
        borderLeftWidth: [Yoga.EDGE_LEFT, 'setBorder'],
        borderRightWidth: [Yoga.EDGE_RIGHT, 'setBorder'],
        borderStartWidth: [Yoga.EDGE_START, 'setBorder'],
        borderEndWidth: [Yoga.EDGE_END, 'setBorder'],
      }[k]
      if (map) node[map[1]](map[0], v)
    }
    for (const [k, v] of Object.entries(styleObj)) apply(k, v)
    root.insertChild(node, 0)
    root.calculateLayout(200, 100, dir === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const out =
      family === 'padding'
        ? {
            paddingLeft: `${node.getComputedPadding(Yoga.EDGE_LEFT)}px`,
            paddingRight: `${node.getComputedPadding(Yoga.EDGE_RIGHT)}px`,
            paddingTop: `${node.getComputedPadding(Yoga.EDGE_TOP)}px`,
            paddingBottom: `${node.getComputedPadding(Yoga.EDGE_BOTTOM)}px`,
          }
        : family === 'margin'
          ? {
              marginLeft: `${node.getComputedMargin(Yoga.EDGE_LEFT)}px`,
              marginRight: `${node.getComputedMargin(Yoga.EDGE_RIGHT)}px`,
            }
          : {
              borderLeftWidth: `${node.getComputedBorder(Yoga.EDGE_LEFT)}px`,
              borderRightWidth: `${node.getComputedBorder(Yoga.EDGE_RIGHT)}px`,
            }
    root.freeRecursive()
    return out
  }

  const page = await browser.newPage()
  try {
    for (const entry of cases) {
      const tokens = entry.classes.split(' ')
      const permutations = [tokens.join(' '), tokens.toReversed().join(' ')]
      for (const dir of ['ltr', 'rtl']) {
        const resolve = evaluate(nativeModuleCode.replace(/^import .*$/gm, ''), {
          createClassResolver,
          I18nManager: { isRTL: dir === 'rtl' },
        }).hozoClasses
        for (const classes of permutations) {
          await page.setContent(
            `<html dir="${dir}"><style>${referenceCss}</style><div class="${classes}" style="width:100px;height:40px">x</div></html>`,
          )
          if (entry.hovered) await page.locator('div').hover()
          const expected = await page.locator('div').evaluate((el, props) => {
            const s = getComputedStyle(el)
            return Object.fromEntries(props.map((p) => [p, s[p]]))
          }, entry.props)

          // Ordinary static Native route
          const host = entry.hovered ? 'Pressable' : 'View'
          const [native] = compiler.compileNative(
            `import { ${host} } from '@hozo/core'; export const C = () => <${host} className="${classes}" />`,
          )
          const rendered = evaluate(
            `const hozoStyles=${native.styles};${native.prelude.join('\n')};module.exports=(${native.jsx})`,
            {
              View: 'View',
              Pressable: 'Pressable',
              HozoPressable: 'HozoPressable',
              h: (_type, props) => props,
              useHozoEnvironment: (q) => q === dir,
            },
          )
          const facts = {
            hovered: Boolean(entry.hovered),
            pressed: false,
            focused: false,
            focusVisible: false,
          }
          const rawStatic =
            typeof rendered.style === 'function' ? rendered.style(facts) : rendered.style
          const staticFlat = Object.assign({}, ...[rawStatic].flat(Infinity).filter(Boolean))
          for (const swap of [false, true]) {
            const staticYoga = yogaEdge(staticFlat, entry.family, dir, swap)
            for (const prop of entry.props) {
              assert.equal(
                staticYoga[prop],
                expected[prop],
                `static ${entry.id}/${dir}/swap=${swap}/${classes}/${prop}`,
              )
            }
          }

          // Generated Native candidate map route
          const dynFlat = Object.assign(
            {},
            ...[resolve(classes, facts)].flat(Infinity).filter(Boolean),
          )
          for (const swap of [false, true]) {
            const dynYoga = yogaEdge(dynFlat, entry.family, dir, swap)
            for (const prop of entry.props) {
              assert.equal(
                dynYoga[prop],
                expected[prop],
                `candidate ${entry.id}/${dir}/swap=${swap}/${classes}/${prop}`,
              )
            }
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test("an author's style edge beats a class's edge on the side React Native gives it, named or spread, static and candidate (#2050)", {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  // `style` is React Native's own: with the swap, RTL moves a physical key to
  // the logical side, so the reference there is the logical CSS property.
  const cases = [
    { classes: 'px-8', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'ps-8', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'pe-8', style: { paddingLeft: 99 }, family: 'padding' },
    { classes: 'pl-1', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'pl-1', style: { paddingLeft: 99 }, family: 'padding' },
    { classes: 'p-4', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'px-8', style: { paddingEnd: 99 }, family: 'padding' },
    { classes: 'mx-8', style: { marginLeft: 9 }, family: 'margin' },
  ]
  const cssProperty = (key, logical) =>
    ({
      paddingLeft: logical ? 'padding-inline-start' : 'padding-left',
      paddingRight: logical ? 'padding-inline-end' : 'padding-right',
      paddingStart: 'padding-inline-start',
      paddingEnd: 'padding-inline-end',
      marginLeft: logical ? 'margin-inline-start' : 'margin-left',
    })[key]
  const props = { padding: ['paddingLeft', 'paddingRight'], margin: ['marginLeft', 'marginRight'] }
  const allNames = [...new Set(cases.flatMap((c) => c.classes.split(' ')))]
  const compiled = await compile(css, { base: process.cwd() })
  const referenceCss = compiled.build(allNames)
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('authored-edge-matrix.ts', JSON.stringify(allNames.join(' ')), 1)
  const nativeModuleCode = cache.renderNativeModule()
  const yoga = (styleObj, family, dir) => {
    const root = Yoga.Node.create()
    root.setWidth(400)
    root.setHeight(100)
    const node = Yoga.Node.create()
    const edges = {
      Left: Yoga.EDGE_LEFT,
      Right: Yoga.EDGE_RIGHT,
      Start: Yoga.EDGE_START,
      End: Yoga.EDGE_END,
    }
    for (const [k, v] of Object.entries(styleObj)) {
      const match = /^(padding|margin)(Left|Right|Start|End)$/.exec(k)
      if (match && typeof v === 'number')
        node[match[1] === 'padding' ? 'setPadding' : 'setMargin'](edges[match[2]], v)
    }
    root.insertChild(node, 0)
    root.calculateLayout(400, 100, dir === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const get = family === 'padding' ? 'getComputedPadding' : 'getComputedMargin'
    const out = {
      [`${family}Left`]: `${node[get](Yoga.EDGE_LEFT)}px`,
      [`${family}Right`]: `${node[get](Yoga.EDGE_RIGHT)}px`,
    }
    root.freeRecursive()
    return out
  }
  // `swapLeftAndRightInRTL`, as in the matrix above.
  const swapped = (styleObj) => {
    const out = {}
    const physical = []
    for (const [k, v] of Object.entries(styleObj)) {
      const to = k.replace(/Left$/, 'Start').replace(/Right$/, 'End')
      if (to === k) out[k] = v
      else physical.push([to, v])
    }
    for (const [k, v] of physical) out[k] = v
    return out
  }
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const literal = (style) =>
    `{ ${Object.entries(style)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')} }`

  const page = await browser.newPage()
  try {
    for (const entry of cases) {
      const id = `${entry.classes} + ${JSON.stringify(entry.style)}`
      const [staticNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = () => <View className="${entry.classes}" style={${literal(entry.style)}} />`,
      )
      const [opaqueNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = ({ cls }) => <View className={cls} style={${literal(entry.style)}} />`,
      )
      // The caller's style handed on through a spread, as a UI wrapper does.
      const [spreadNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = (rest) => <View className="${entry.classes}" {...rest} />`,
      )
      const [opaqueSpreadNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = ({ cls, ...rest }) => <View {...rest} className={cls} />`,
      )
      assert.ok(staticNative.jsx.includes('hozoAuthoredEdges(') || entry.classes === 'p-4', id)
      for (const dir of ['ltr', 'rtl']) {
        for (const swap of [false, true]) {
          const logical = dir === 'rtl' && swap
          const inline = Object.entries(entry.style)
            .map(([k, v]) => `${cssProperty(k, logical)}:${v}px`)
            .join(';')
          await page.setContent(
            `<html dir="${dir}"><style>${referenceCss}</style><div class="${entry.classes}" style="width:100px;height:40px;${inline}">x</div></html>`,
          )
          const expected = await page.locator('div').evaluate((el, names) => {
            const s = getComputedStyle(el)
            return Object.fromEntries(names.map((p) => [p, s[p]]))
          }, props[entry.family])
          const I18nManager = { isRTL: dir === 'rtl', doLeftAndRightSwapInRTL: swap }
          const hozoClasses = evaluate(nativeModuleCode.replace(/^import .*$/gm, ''), {
            createClassResolver,
            I18nManager,
          }).hozoClasses
          const scope = {
            View: 'View',
            h: (_type, elementProps) => elementProps,
            useHozoEnvironment: (q) => q === dir,
            hozoAuthoredEdges,
            hozoAuthoredStyle,
            hozoEdgeSpreadStyles,
            hozoSpreadStyles,
            hozoClasses,
            I18nManager,
            cls: entry.classes,
            rest: { style: entry.style },
          }
          for (const [route, native] of [
            ['static', staticNative],
            ['candidate', opaqueNative],
            ['spread', spreadNative],
            ['candidate spread', opaqueSpreadNative],
          ]) {
            const rendered = evaluate(
              `const hozoStyles=${native.styles};${native.prelude.join('\n')};module.exports=(${native.jsx})`,
              scope,
            )
            const style = flat(rendered.style)
            const actual = yoga(logical ? swapped(style) : style, entry.family, dir)
            assert.deepEqual(actual, expected, `${route} ${id}/${dir}/swap=${swap}`)
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})
