// Runtime candidate effects and component semantic-state browser regressions.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { createClassResolver } from '@hozo/engine'
import { hozoFilterStyles } from '@hozo/engine/generated/filter-slots'
import { NativeSelect } from '@hozo/form'
import { Button as ButtonFallback } from '@hozo/primitives'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { __unstable__loadDesignSystem, compile } from 'tailwindcss'
import {
  createCascadeContext,
  evaluate,
  executablePath,
  launchCandidateBrowser,
} from './candidate-cascade-harness.mjs'
import { chipAncestorFixture } from './chip-ancestor-fixture.mjs'

const { cache, compiler, cleanup } = createCascadeContext()
let browser

before(async () => {
  browser = await launchCandidateBrowser()
})
after(async () => {
  await browser?.close()
  cleanup()
})

test('runtime candidate transforms compose and stay local through updates against real Tailwind', {
  skip: !executablePath,
}, async () => {
  const names = [
    'translate-x-2',
    'translate-y-3',
    'translate-y-1',
    'scale-50',
    'scale-x-75',
    'skew-x-3',
    'skew-y-6',
  ]
  const input = '@theme { --spacing: .25rem; } @tailwind utilities;'
  const design = await __unstable__loadDesignSystem(input)
  const order = design.getClassOrder(names)
  assert.ok(order.every(([, rank]) => rank !== null))
  order.sort((a, b) => Number(a[1] - b[1]))
  const candidates = openCandidateCache()
  candidates.scanFile('runtime-transform.ts', JSON.stringify(names.join(' ')), 1)
  const actualSheet = candidates.renderCss(
    undefined,
    order.map(([name]) => name),
  )
  const oracleSheet = (await compile(input)).build(names)
  // Independent documents prevent either sheet rescuing the other's result.
  const pages = await Promise.all([browser.newPage(), browser.newPage()])
  try {
    for (const [index, page] of pages.entries())
      await page.setContent(`<!doctype html><style id="sheet">${index ? actualSheet : oracleSheet}</style>
        <div id="parent" style="width:80px;height:40px"><div id="child" class="translate-y-1"></div></div>`)
    const update = async (page, classes) =>
      page.evaluate((value) => {
        const parent = document.querySelector('#parent')
        window.firstParent ??= parent
        parent.className = value
        const read = (element) => {
          const style = getComputedStyle(element)
          return { translate: style.translate, scale: style.scale, transform: style.transform }
        }
        return {
          parent: read(parent),
          child: read(document.querySelector('#child')),
          stable: parent === window.firstParent,
        }
      }, classes)
    const full = names.filter((name) => name !== 'translate-y-1')
    for (const classes of [full, full.toReversed(), ['translate-y-3'], [], full]) {
      const [expected, actual] = await Promise.all(
        pages.map((page) => update(page, classes.join(' '))),
      )
      assert.deepEqual(actual, expected, classes.join(' '))
      assert.equal(actual.stable, true)
    }
    const before = await update(pages[1], full.join(' '))
    await pages[1].evaluate(() => {
      document.querySelector('#sheet').textContent = ''
    })
    assert.notDeepEqual((await update(pages[1], full.join(' '))).parent, before.parent)
    await pages[1].evaluate((sheet) => {
      document.querySelector('#sheet').textContent = sheet
    }, actualSheet)
    assert.deepEqual(await update(pages[1], full.join(' ')), before)
  } finally {
    for (const page of pages) await page.close()
  }
})

test('runtime filter candidates agree with Tailwind and Native through class and owner-state updates', {
  skip: !executablePath,
}, async () => {
  const names = [
    'blur-[8px]',
    'brightness-50',
    'contrast-125',
    'grayscale',
    'hue-rotate-30',
    'invert',
    'saturate-150',
    'sepia',
    'hover:blur-[16px]',
    'focus:sepia-50',
    'blur-[2px]',
  ]
  const input = '@tailwind utilities;'
  const design = await __unstable__loadDesignSystem(input)
  const order = design.getClassOrder(names)
  assert.ok(order.every(([, rank]) => rank !== null))
  order.sort((a, b) => Number(a[1] - b[1]))
  const candidates = openCandidateCache()
  candidates.scanFile('runtime-filter.ts', JSON.stringify(names.join(' ')), 1)
  const actualSheet = candidates.renderCss(
    undefined,
    order.map(([name]) => name),
  )
  const nativeModule = candidates.renderNativeModule()
  const native = runInNewContext(
    `${nativeModule.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoFilterStyles },
  )
  const oracleSheet = (await compile(input)).build(names)
  const pages = await Promise.all([browser.newPage(), browser.newPage()])
  try {
    for (const [index, page] of pages.entries())
      await page.setContent(`<!doctype html><style id="sheet">${index ? actualSheet : oracleSheet}</style>
        <button id="parent" style="width:80px;height:40px;margin:40px"><span id="child" class="blur-[2px]">child</span></button>
        <div id="native"></div>`)
    const update = async (page, classes, state) => {
      await page.locator('#parent').evaluate((element, value) => {
        element.className = value
      }, classes)
      if (state.hovered) await page.locator('#parent').hover()
      else await page.mouse.move(0, 0)
      if (state.focused) await page.locator('#parent').focus()
      else await page.locator('#parent').evaluate((element) => element.blur())
      return page.evaluate(() => {
        const parent = document.querySelector('#parent')
        window.firstParent ??= parent
        return {
          parent: getComputedStyle(parent).filter,
          child: getComputedStyle(document.querySelector('#child')).filter,
          stable: parent === window.firstParent,
        }
      })
    }
    const full = names.filter((name) => name !== 'blur-[2px]')
    for (const classes of [
      full,
      full.toReversed(),
      ['brightness-50', 'hover:blur-[16px]'],
      [],
      full,
    ]) {
      for (const state of [
        { hovered: false, focused: false },
        { hovered: true, focused: false },
        { hovered: true, focused: true },
        { hovered: false, focused: true },
        { hovered: false, focused: false },
      ]) {
        const list = classes.join(' ')
        const expected = await update(pages[0], list, state)
        const actual = await update(pages[1], list, state)
        assert.deepEqual(actual, expected, JSON.stringify({ list, state }))
        assert.equal(actual.stable, true)
        const filter = Object.assign({}, ...native(list, state).flat(Infinity)).filter ?? ''
        const normalized = await pages[1].evaluate((value) => {
          const element = document.querySelector('#native')
          element.style.filter = value
          return getComputedStyle(element).filter
        }, filter)
        assert.equal(
          normalized,
          expected.parent,
          `Native declaration ${JSON.stringify({ list, state })}`,
        )
      }
    }
    const rest = { hovered: false, focused: false }
    const before = await update(pages[1], full.join(' '), rest)
    assert.notEqual(before.parent, 'none')
    await pages[1].evaluate(() => {
      document.querySelector('#sheet').textContent = ''
    })
    assert.notDeepEqual(await update(pages[1], full.join(' '), rest), before)
    await pages[1].evaluate((sheet) => {
      document.querySelector('#sheet').textContent = sheet
    }, actualSheet)
    assert.deepEqual(await update(pages[1], full.join(' '), rest), before)
  } finally {
    for (const page of pages) await page.close()
  }
})

test('runtime gradient candidates agree with independent Tailwind through updates and owner states', {
  skip: !executablePath,
}, async () => {
  const names = [
    'bg-linear-to-r',
    'from-[#f00]',
    'to-[#00f]',
    'from-25%',
    'to-80%',
    'via-[#0f0]',
    'via-55%',
    'hover:bg-linear-to-b',
    'focus:from-[#fff]',
    'hover:focus:via-none',
    'bg-linear-to-b',
    'from-[#aaa]',
  ]
  const input = '@tailwind utilities;'
  const design = await __unstable__loadDesignSystem(input)
  const order = design.getClassOrder(names)
  assert.ok(order.every(([, rank]) => rank !== null))
  order.sort((a, b) => Number(a[1] - b[1]))
  const candidates = openCandidateCache()
  candidates.scanFile('runtime-gradient.ts', JSON.stringify(names.join(' ')), 1)
  const actualSheet = candidates.renderCss(
    undefined,
    order.map(([name]) => name),
  )
  const oracleSheet = (await compile(input)).build(names)
  const pages = await Promise.all([browser.newPage(), browser.newPage()])
  try {
    for (const [index, page] of pages.entries())
      await page.setContent(`<!doctype html><style id="sheet">${index ? actualSheet : oracleSheet}</style>
        <button id="parent" style="width:80px;height:40px;margin:40px"><span id="child" class="bg-linear-to-b from-[#aaa]">child</span></button>`)
    const update = async (page, classes, state) => {
      await page.locator('#parent').evaluate((element, value) => {
        element.className = value
      }, classes)
      if (state.hovered) await page.locator('#parent').hover()
      else await page.mouse.move(0, 0)
      if (state.focused) await page.locator('#parent').focus()
      else await page.locator('#parent').evaluate((element) => element.blur())
      return page.evaluate(() => {
        const parent = document.querySelector('#parent')
        window.firstParent ??= parent
        return {
          parent: getComputedStyle(parent).backgroundImage,
          child: getComputedStyle(document.querySelector('#child')).backgroundImage,
          stable: parent === window.firstParent,
        }
      })
    }
    const full = names.slice(0, -2)
    for (const owner of ['', 'hozo-candidate-owner'])
      for (const classes of [full, full.toReversed(), ['bg-linear-to-r', 'from-[#f00]'], [], full])
        for (const state of [
          { hovered: false, focused: false },
          { hovered: true, focused: false },
          { hovered: true, focused: true },
          { hovered: false, focused: true },
          { hovered: false, focused: false },
        ]) {
          const list = [...classes, owner].filter(Boolean).join(' ')
          const expected = await update(pages[0], list, state)
          const actual = await update(pages[1], list, state)
          assert.deepEqual(actual, expected, JSON.stringify({ list, state }))
          assert.equal(actual.stable, true)
        }
    const rest = { hovered: false, focused: false }
    const before = await update(pages[1], full.join(' '), rest)
    assert.notEqual(before.parent, 'none')
    await pages[1].evaluate(() => {
      document.querySelector('#sheet').textContent = ''
    })
    assert.notDeepEqual(await update(pages[1], full.join(' '), rest), before)
    await pages[1].evaluate((sheet) => {
      document.querySelector('#sheet').textContent = sheet
    }, actualSheet)
    assert.deepEqual(await update(pages[1], full.join(' '), rest), before)
  } finally {
    for (const page of pages) await page.close()
  }
})

async function compareRuntimeEffect({
  names,
  active,
  childClass,
  property,
  normalize = (x) => x,
  input = '@tailwind utilities;',
}) {
  const design = await __unstable__loadDesignSystem(input)
  const order = design.getClassOrder(names)
  assert.ok(order.every(([, rank]) => rank !== null))
  order.sort((a, b) => Number(a[1] - b[1]))
  const candidates = openCandidateCache()
  candidates.scanFile('runtime-effect.ts', JSON.stringify(names.join(' ')), 1)
  const actualSheet = candidates.renderCss(
    undefined,
    order.map(([name]) => name),
  )
  const oracleSheet = (await compile(input)).build(names)
  const pages = await Promise.all([browser.newPage(), browser.newPage()])
  try {
    for (const [index, page] of pages.entries())
      await page.setContent(`<!doctype html><style id="sheet">${index ? actualSheet : oracleSheet}</style>
        <button id="effect" style="width:80px;height:40px;margin:40px"><span class="${childClass}">child</span></button>`)
    async function read(page, classes, hovered, focused) {
      const effect = page.locator('#effect')
      await effect.evaluate((element, value) => {
        element.className = value
      }, classes)
      if (hovered) await effect.hover()
      else await page.mouse.move(0, 0)
      if (focused) await effect.focus()
      else await effect.evaluate((element) => element.blur())
      return (
        await effect.evaluate(
          (element, prop) => [
            getComputedStyle(element).getPropertyValue(prop),
            getComputedStyle(element.firstElementChild).getPropertyValue(prop),
          ],
          property,
        )
      ).map(normalize)
    }
    for (const owner of ['', 'hozo-candidate-owner'])
      for (const classes of [active, active.toReversed(), [], active])
        for (const [hovered, focused] of [
          [false, false],
          [true, false],
          [true, true],
          [false, true],
        ]) {
          const value = [...classes, owner].join(' ')
          assert.deepEqual(
            await read(pages[1], value, hovered, focused),
            await read(pages[0], value, hovered, focused),
            JSON.stringify({ property, value, hovered, focused }),
          )
        }
    const before = await read(pages[1], active.join(' '), true, true)
    assert.notEqual(before[0], 'none')
    await pages[1].locator('#sheet').evaluate((element) => {
      element.textContent = ''
    })
    assert.notDeepEqual(await read(pages[1], active.join(' '), true, true), before)
    await pages[1].locator('#sheet').evaluate((element, sheet) => {
      element.textContent = sheet
    }, actualSheet)
    assert.deepEqual(await read(pages[1], active.join(' '), true, true), before)
  } finally {
    for (const page of pages) await page.close()
  }
}

test('runtime backdrop functions agree with Tailwind through candidate and owner updates', {
  skip: !executablePath,
}, async () => {
  const active = [
    'backdrop-blur-[8px]',
    'backdrop-saturate-150',
    'hover:backdrop-opacity-50',
    'focus:backdrop-blur-[16px]',
    'hover:focus:backdrop-sepia',
  ]
  const childClass = 'backdrop-invert'
  await compareRuntimeEffect({
    names: [...active, childClass],
    active,
    childClass,
    property: 'backdrop-filter',
  })
})

test('runtime shadow and ring layers agree with Tailwind across independent conditions', {
  skip: !executablePath,
}, async () => {
  const active = [
    'shadow-sm',
    'inset-shadow-sm',
    'hover:shadow-none',
    'focus:ring-2',
    'ring-offset-2',
    'ring-offset-black',
    'ring-[#0f0]',
    'hover:focus:ring-inset',
  ]
  const childClass = 'ring-1'
  const input = `@theme {
    --color-black: #000;
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --inset-shadow-sm: inset 0 2px 4px rgb(0 0 0 / 0.05);
  } @tailwind utilities;`
  await compareRuntimeEffect({
    names: [...active, childClass],
    active,
    childClass,
    input,
    property: 'box-shadow',
    // A zero transparent placeholder is equivalent to an absent layer;
    // don't drop other geometry or normalize visible colours.
    normalize: (value) =>
      value
        .split(/,(?![^()]*\))/)
        .map((layer) => layer.trim())
        .filter((layer) => !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?: inset)?$/.test(layer))
        .join(', ') || 'none',
  })
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
  const reference = await browser.newPage()
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
        await reference.setViewportSize({ width, height: 700 })
        await page.setContent(`<style>${web.css}</style><div id="compiled">${html}</div>`)
        await reference.setContent(
          `<style>${css}</style><p class="${classes}">One<br/>Two<br/>Three</p>`,
        )
        const measure = (locator) =>
          locator.evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.fontSize, style.lineHeight, element.getBoundingClientRect().height]
          })
        const actual = await measure(page.locator('#compiled > p'))
        assert.deepEqual(actual, await measure(reference.locator('p')), `${classes} at ${width}px`)
        if (classes === cases[0] && width === 1280)
          assert.deepEqual(actual, ['20px', '32.5px', 97.5])
      }
    }
  } finally {
    await page.close()
    await reference.close()
  }
})

test('Pagination semantic classes distinguish disabled buttons from disabled links at either boundary', {
  skip: !executablePath,
}, async () => {
  const classes =
    'p-0 border-0 opacity-100 enabled:px-2 disabled:opacity-25 aria-disabled:border-4 aria-selected:opacity-50'
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build([
    ...classes.split(' '),
    'border-2',
  ])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination} from '@hozo/patterns';
        window.paginationSelections = [];
        createRoot(document.getElementById('root')).render(<>{[false, true].map(link =>
          <section key={String(link)} id={link ? 'links' : 'buttons'}><Pagination pageCount={3}
            getPageHref={link ? page => '#page-' + page : undefined}
            onPageChange={page => window.paginationSelections.push([link, page])}
            itemClassName=${JSON.stringify(classes)} currentItemClassName="border-2"
            disabledItemClassName="disabled:opacity-25 aria-disabled:border-4"/></section>
        )}</>);`,
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
  try {
    await page.setContent(
      `<style>${css}</style><div id="aria-control" aria-selected="true" class="${classes}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(
      () => document.querySelectorAll('#root button, #root a').length === 10,
    )
    assert.equal(
      await page.locator('#aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.5',
    )
    for (const link of [false, true]) {
      const controls = page.locator(link ? '#links a' : '#buttons button')
      const check = async (boundary, current) => {
        const styles = await controls.evaluateAll((nodes) =>
          nodes.map((e) => {
            const css = getComputedStyle(e)
            return {
              border: css.borderTopWidth,
              opacity: css.opacity,
              padding: css.paddingLeft,
              selected: e.getAttribute('aria-selected'),
              current: e.getAttribute('aria-current'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
            }
          }),
        )
        for (const [index, facts] of styles.entries())
          assert.deepEqual(facts, {
            border: link && index === boundary ? '4px' : index === current ? '2px' : '0px',
            opacity: !link && index === boundary ? '0.25' : '1',
            padding: !link && index !== boundary ? '8px' : '0px',
            selected: null,
            current: index === current ? 'page' : null,
            ariaDisabled: link && index === boundary ? 'true' : null,
            disabled: !link && index === boundary,
            enabled: !link && index !== boundary,
          })
      }
      await check(0, 1)
      if (link) {
        await controls.first().focus()
        await page.keyboard.press('Enter')
        assert.deepEqual(await page.evaluate(() => window.paginationSelections), [[false, 3]])
      }
      await controls.nth(3).click()
      await check(4, 3)
    }
    assert.deepEqual(await page.evaluate(() => window.paginationSelections), [
      [false, 3],
      [true, 3],
    ])
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Chip semantic classes observe the Web class owner across standalone and composite shapes', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-0 opacity-100 aria-pressed:border-2 disabled:opacity-25 aria-checked:opacity-50 aria-disabled:border-4'
  const css = (await compile('@tailwind utilities;')).build(classes.split(' '))
  assert.ok(css.includes('[aria-pressed="true"]'))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip} from '@hozo/patterns';
        window.chipSelections = []; window.chipRemovals = [];
        const shapes = [];
        for (const selectable of [false, true]) for (const removable of [false, true])
          for (const disabled of [false, true]) shapes.push({selectable, removable, disabled});
        createRoot(document.getElementById('root')).render(<>{shapes.map((s, index) =>
          <div key={index} id={'chip-' + index}><Chip disabled={s.disabled}
            {...(s.selectable ? {defaultSelected: true, onSelectedChange: on => window.chipSelections.push([index, on])} : {})}
            {...(s.removable ? {onRemove: () => window.chipRemovals.push(index)} : {})}
            className=${JSON.stringify(classes)} removeClassName=${JSON.stringify(classes)}>Remote</Chip></div>
        )}</>);`,
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
  try {
    await page.setContent(
      `<style>${css}</style><div id="aria-control" aria-checked="true" class="${classes}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root > div').length === 8)
    assert.equal(
      await page.locator('#aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.5',
      'the checked selector must have real CSS',
    )
    let index = 0
    const changes = []
    const removals = []
    for (const selectable of [false, true])
      for (const removable of [false, true])
        for (const disabled of [false, true]) {
          const owner = page.locator(`#chip-${index} > :first-child`)
          const buttons = page.locator(`#chip-${index} button`)
          const read = (locator) =>
            locator.evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                border: css.borderTopWidth,
                opacity: css.opacity,
                checked: e.getAttribute('aria-checked'),
                ariaDisabled: e.getAttribute('aria-disabled'),
              }
            })
          const check = async (selected) => {
            assert.deepEqual(await read(owner), {
              border: selectable && !removable && selected ? '2px' : '0px',
              opacity: selectable && !removable && disabled ? '0.25' : '1',
              checked: null,
              ariaDisabled: null,
            })
            if (removable)
              assert.deepEqual(await read(buttons.last()), {
                border: '0px',
                opacity: disabled ? '0.25' : '1',
                checked: null,
                ariaDisabled: null,
              })
          }
          await check(selectable)
          if (selectable) {
            assert.equal(await buttons.first().getAttribute('aria-pressed'), 'true')
            assert.equal(await buttons.first().isDisabled(), disabled)
            if (!disabled) {
              await buttons.first().click()
              changes.push([index, false])
              assert.equal(await buttons.first().getAttribute('aria-pressed'), 'false')
              await check(false)
            }
          }
          if (removable) {
            assert.equal(await buttons.last().isDisabled(), disabled)
            if (!disabled) {
              await buttons.last().click()
              removals.push(index)
            }
          }
          index++
        }
    assert.deepEqual(await page.evaluate(() => window.chipSelections), changes)
    assert.deepEqual(await page.evaluate(() => window.chipRemovals), removals)
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
  } finally {
    await page.close()
  }
})

test('AOT Chip root disabled predicates ask the actual Web owner, as Tailwind does, in every shape', {
  skip: !executablePath,
}, async () => {
  // #993: AOT `disabled:` on the root compiled to `[data-hozo-disabled]`,
  // which the retained Chip never puts on its class owner. The owner is a
  // button for a standalone toggle and a span otherwise; a span is neither
  // :disabled nor :enabled, which negation has to keep.
  const classes =
    'outline-offset-0 opacity-100 mt-0 mb-0 disabled:outline-offset-4 enabled:opacity-50 not-disabled:mt-1 not-enabled:mb-1'
  const oracle = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const shapes = []
  for (const selectable of [false, true])
    for (const removable of [false, true]) shapes.push({ selectable, removable })
  const compiled = shapes.map(({ selectable, removable }) => {
    const [web] = compiler.compile(
      `import { Chip } from '@hozo/core'
      export function C({ disabled }) {
        return <Chip disabled={disabled}${selectable ? ' defaultSelected' : ''}${removable ? ' onRemove={() => {}}' : ''} className="${classes}">Token</Chip>
      }`,
    )
    assert.deepEqual(web.diagnostics, [])
    assert.doesNotMatch(web.css, /data-hozo-disabled/, 'no marker the owner never receives')
    return web
  })
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip as HozoChip} from '@hozo/patterns';
        const raw = window.hozoRawChip === true;
        const Compiled = [${compiled.map((web) => `({ disabled }) => ${web.jsx}`).join(', ')}];
        const shapes = ${JSON.stringify(shapes)};
        createRoot(document.getElementById('root')).render(<>{shapes.flatMap((s, index) =>
          [false, true].map(disabled => {
            const C = Compiled[index];
            return <div key={index + '-' + disabled} id={'chip-' + index + '-' + disabled}>
              {raw ? <HozoChip disabled={disabled}
                {...(s.selectable ? {defaultSelected: true} : {})}
                {...(s.removable ? {onRemove: () => {}} : {})}
                className=${JSON.stringify(classes)}>Token</HozoChip> : <C disabled={disabled}/>}
            </div>
          }))}</>);`,
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
  const readAll = async (raw) => {
    const sheets = raw ? [oracle] : compiled.map((web) => web.css)
    await page.setContent(
      `<style>html {font-size:16px}</style>${sheets.map((css) => `<style>${css}</style>`).join('')}<div id="root"></div><script>window.hozoRawChip = ${raw}</script>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root > div').length === 8)
    return page.locator('#root > div > :first-child').evaluateAll((owners) =>
      owners.map((e) => {
        const css = getComputedStyle(e)
        return {
          tag: e.tagName,
          offset: css.outlineOffset,
          opacity: css.opacity,
          margins: [css.marginTop, css.marginBottom],
        }
      }),
    )
  }
  try {
    const actual = await readAll(false)
    assert.deepEqual(actual, await readAll(true), 'compiled Chip against Tailwind on the same Chip')
    // And the facts themselves, so a shared mistake cannot pass both sides.
    let index = 0
    for (const { selectable, removable } of shapes)
      for (const disabled of [false, true]) {
        const button = selectable && !removable
        assert.deepEqual(
          actual[index++],
          {
            tag: button ? 'BUTTON' : 'SPAN',
            offset: button && disabled ? '4px' : '0px',
            opacity: button && !disabled ? '0.5' : '1',
            margins: [button && disabled ? '0px' : '4px', button && !disabled ? '0px' : '4px'],
          },
          `selectable=${selectable} removable=${removable} disabled=${disabled}`,
        )
      }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('ColorPicker semantic classes read each radio checked and disabled state without invented ARIA', {
  skip: !executablePath,
}, async () => {
  const classes =
    'size-8 border-0 border-solid outline-0 rounded-none opacity-100 disabled:opacity-25 enabled:rounded-lg not-disabled:mt-1 not-enabled:mb-1 aria-checked:border-2 not-aria-checked:border-4 aria-disabled:outline-8 aria-selected:opacity-50 not-aria-disabled:pt-1 not-aria-selected:pb-1'
  const selectedClasses =
    'aria-checked:mt-2 not-aria-checked:mb-2 disabled:opacity-50 enabled:outline-2 not-enabled:outline-4'
  const css = (
    await compile('@theme { --spacing: 0.25rem; --radius-lg: 8px; } @tailwind utilities;')
  ).build([...classes.split(' '), ...selectedClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ColorPicker} from '@hozo/patterns';
        window.colorPickerSemanticChanges = [];
        const root = createRoot(document.getElementById('root'));
        window.renderColorPickerSemantics = value => root.render(<>{[false, true].map(disabled =>
          <section key={String(disabled)} id={'colors-' + disabled}>
            <ColorPicker accessibilityLabel="Theme colour" presets={['#ef4444','#3b82f6']}
              value={value} defaultValue="#3b82f6" disabled={disabled}
              onChange={hex => window.colorPickerSemanticChanges.push([disabled, hex])}
              swatchClassName=${JSON.stringify(classes)}
              selectedSwatchClassName=${JSON.stringify(selectedClasses)}/>
          </section>)}<section id="equivalent-colors"><ColorPicker accessibilityLabel="Equivalent colours"
            presets={['#f00','#ff0000','not-a-colour','#000000']} value={value ?? '#ff0000'}
            swatchClassName=${JSON.stringify(classes)} selectedSwatchClassName=${JSON.stringify(selectedClasses)}/>
          </section></>);
        window.renderColorPickerSemantics();`,
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
  try {
    await page.setContent(`<style>${css}</style><div id="color-aria-control"
      aria-disabled="true" aria-selected="true" class="${classes}"></div><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(
      () => document.querySelectorAll('#root button[role="radio"]').length === 8,
    )
    const control = await page.locator('#color-aria-control').evaluate((e) => {
      const css = getComputedStyle(e)
      return [css.outlineWidth, css.opacity]
    })
    assert.deepEqual(control, ['8px', '0.5'], 'absent-attribute selectors must have real CSS')
    const radios = (disabled) => page.locator(`#colors-${disabled} button[role="radio"]`)
    const check = async (disabled, selected) => {
      for (let index = 0; index < 2; index++) {
        const checked = index === selected
        assert.deepEqual(
          await radios(disabled)
            .nth(index)
            .evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                checked: e.getAttribute('aria-checked'),
                disabled: e.matches(':disabled'),
                enabled: e.matches(':enabled'),
                ariaDisabled: e.getAttribute('aria-disabled'),
                selected: e.getAttribute('aria-selected'),
                border: css.borderTopWidth,
                radius: css.borderTopLeftRadius,
                opacity: css.opacity,
                outline: css.outlineWidth,
                margins: [css.marginTop, css.marginBottom],
                padding: [css.paddingTop, css.paddingBottom],
                background: css.backgroundColor,
              }
            }),
          {
            checked: String(checked),
            disabled,
            enabled: !disabled,
            ariaDisabled: null,
            selected: null,
            border: checked ? '2px' : '4px',
            radius: disabled ? '0px' : '8px',
            opacity: disabled ? (checked ? '0.5' : '0.25') : '1',
            outline: checked ? (disabled ? '4px' : '2px') : '0px',
            margins: [checked ? '8px' : disabled ? '0px' : '4px', disabled ? '4px' : '0px'],
            padding: ['4px', '4px'],
            background: index === 0 ? 'rgb(239, 68, 68)' : 'rgb(59, 130, 246)',
          },
          `${disabled}/${selected}/${index}`,
        )
      }
    }
    await check(false, 1)
    await check(true, 1)
    const equivalent = page.locator('#equivalent-colors button[role="radio"]')
    const readEquivalent = () =>
      equivalent.evaluateAll((nodes) =>
        nodes.map((e) => ({
          checked: e.getAttribute('aria-checked') === 'true',
          border: getComputedStyle(e).borderTopWidth,
        })),
      )
    assert.deepEqual(
      await readEquivalent(),
      [true, false, false, false].map((checked) => ({
        checked,
        border: checked ? '2px' : '4px',
      })),
    )
    await radios(false).nth(0).click()
    await check(false, 0)
    await check(true, 1)
    assert.deepEqual(await page.evaluate(() => window.colorPickerSemanticChanges), [
      [false, '#ef4444'],
    ])
    for (const radio of await radios(true).all()) assert.equal(await radio.isDisabled(), true)
    await page.evaluate(() => window.renderColorPickerSemantics('#ef4444'))
    await page.waitForFunction(
      () =>
        document.querySelector('#colors-true button[role="radio"]').getAttribute('aria-checked') ===
        'true',
    )
    await check(true, 0)
    await check(false, 0)
    await page.evaluate(() => window.renderColorPickerSemantics('#000000'))
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('#equivalent-colors button[role="radio"]')[3]
          .getAttribute('aria-checked') === 'true',
    )
    assert.deepEqual(
      await readEquivalent(),
      [false, false, false, true].map((checked) => ({
        checked,
        border: checked ? '2px' : '4px',
      })),
      'invalid preset fallback is not a checked colour',
    )
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Stepper semantic classes distinguish button disabled state from descriptive rows and announcements', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-0 border-solid p-0 opacity-100 disabled:opacity-25 enabled:px-2 not-disabled:py-1 not-enabled:border-4 aria-selected:opacity-50 aria-disabled:px-4'
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Stepper} from '@hozo/patterns';
        window.stepperSemanticSelections = [];
        createRoot(document.getElementById('root')).render(<>{[false, true].flatMap(clickable =>
          [false, true].map(disabled => <section key={clickable + '-' + disabled}
            id={'steps-' + clickable + '-' + disabled}><Stepper activeStep={1}
              steps={['completed','current','error','upcoming'].map(status => ({label:status,status,disabled,description:'Details'}))}
              {...(clickable ? {onStepPress: index => window.stepperSemanticSelections.push(index)} : {})}
              stepClassName=${JSON.stringify(classes)}
              completedStepClassName=${JSON.stringify(classes)}
              currentStepClassName=${JSON.stringify(classes)}
              errorStepClassName=${JSON.stringify(classes)}
              indicatorClassName=${JSON.stringify(classes)}
              completedIndicatorClassName=${JSON.stringify(classes)}
              currentIndicatorClassName=${JSON.stringify(classes)}
              errorIndicatorClassName=${JSON.stringify(classes)}
              descriptionClassName=${JSON.stringify(classes)} /></section>)
        )}</>);`,
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
  try {
    await page.setContent(`<style>${css}</style><div id="step-aria-control" aria-selected="true"
      aria-disabled="true" class="${classes}"></div><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root li').length === 16)
    const read = (locator) =>
      locator.evaluate((e) => {
        const style = getComputedStyle(e)
        return {
          disabled: e.matches(':disabled'),
          enabled: e.matches(':enabled'),
          selected: e.getAttribute('aria-selected'),
          ariaDisabled: e.getAttribute('aria-disabled'),
          opacity: style.opacity,
          border: style.borderTopWidth,
          padding: [style.paddingTop, style.paddingLeft],
        }
      })
    assert.equal((await read(page.locator('#step-aria-control'))).opacity, '0.5')
    assert.equal((await read(page.locator('#step-aria-control'))).padding[1], '16px')
    for (const clickable of [false, true])
      for (const disabled of [false, true]) {
        const rows = page.locator(`#steps-${clickable}-${disabled} li`)
        for (let index = 0; index < 4; index++) {
          const row = rows.nth(index)
          const owner = clickable ? row.locator('button') : row
          assert.deepEqual(
            await read(owner),
            {
              disabled: clickable && disabled,
              enabled: clickable && !disabled,
              selected: null,
              ariaDisabled: null,
              opacity: clickable && disabled ? '0.25' : '1',
              border: clickable && !disabled ? '0px' : '4px',
              padding: [
                clickable && disabled ? '0px' : '4px',
                clickable && !disabled ? '8px' : '0px',
              ],
            },
            `${clickable}/${disabled}/${index}`,
          )
          assert.equal(await row.getAttribute('aria-current'), index === 1 ? 'step' : null)
          // Decorations are spans: they match neither positive pseudo-class,
          // even when their enclosing button is disabled or current.
          for (const position of [0, 2]) {
            assert.deepEqual(await read(owner.locator('span[aria-hidden="true"]').nth(position)), {
              disabled: false,
              enabled: false,
              selected: null,
              ariaDisabled: null,
              opacity: '1',
              border: '4px',
              padding: ['4px', '0px'],
            })
          }
          if (clickable && !disabled) await owner.click()
        }
      }
    assert.deepEqual(await page.evaluate(() => window.stepperSemanticSelections), [0, 1, 2, 3])
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Stepper focus stays on each button while decorative slots inherit only its typography', {
  skip: !executablePath,
}, async () => {
  const decorationClasses =
    'border-2 focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const buttonClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...decorationClasses.split(' '), ...buttonClasses.split(' '), 'font-normal'])
  assert.ok(css.includes('font-weight: var(--font-weight-bold)'))
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {Stepper} from '@hozo/patterns';
        window.stepperSelections = [];
        const steps = ['completed', 'current', 'error', 'upcoming'].map(status => ({
          label: status, status, description: 'Details for ' + status,
        })).concat({label: 'Disabled', disabled: true});
        const inherited = ${JSON.stringify(decorationClasses)};
        createRoot(document.getElementById('root')).render(<>
          {['inherit', 'own'].map(mode => {
            const classes = mode === 'own' ? 'font-normal ' + inherited : inherited;
            return <section key={mode} id={mode}><Stepper steps={steps} activeStep={1}
              onStepPress={index => window.stepperSelections.push([mode, index])}
              stepClassName=${JSON.stringify(buttonClasses)}
              indicatorClassName={classes} completedIndicatorClassName={classes}
              currentIndicatorClassName={classes} errorIndicatorClassName={classes}
              descriptionClassName={classes}/></section>;
          })}
        </>);
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><button id="before">Before</button><div id="root"></div><button id="after">After</button>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root button').length === 10)
    await page.locator('#before').focus()
    for (const mode of ['inherit', 'own']) {
      for (let index = 0; index < 4; index++) {
        await page.keyboard.press('Tab')
        const button = page.locator(`#${mode} button`).nth(index)
        assert.equal(await button.evaluate((e) => e === document.activeElement), true)
        assert.equal(await button.evaluate((e) => getComputedStyle(e).outlineWidth), '4px')
        assert.equal(await button.evaluate((e) => getComputedStyle(e).fontWeight), '700')
        const spans = button.locator('span[aria-hidden="true"]')
        assert.equal(await spans.count(), 3, 'mark, label and description')
        for (const position of [0, 2]) {
          const decoration = spans.nth(position)
          const facts = await decoration.evaluate((e) => {
            e.focus()
            const style = getComputedStyle(e)
            return {
              focused: e.matches(':focus'),
              visible: e.matches(':focus-visible'),
              outline: style.outlineWidth,
              weight: style.fontWeight,
              border: style.borderTopWidth,
            }
          })
          assert.equal(facts.focused, false)
          assert.equal(facts.visible, false)
          assert.notEqual(facts.outline, '4px')
          assert.equal(facts.border, '2px')
          assert.equal(facts.weight, mode === 'inherit' ? '700' : '400')
        }
        assert.equal(await button.evaluate((e) => e === document.activeElement), true)
        await page.keyboard.press('Enter')
      }
      assert.equal(await page.locator(`#${mode} button`).nth(4).isDisabled(), true)
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.locator('#after').evaluate((e) => e === document.activeElement), true)
    await page.keyboard.press('Shift+Tab')
    assert.equal(
      await page
        .locator('#own button')
        .nth(3)
        .evaluate((e) => e === document.activeElement),
      true,
    )
    assert.deepEqual(
      await page.evaluate(() => window.stepperSelections),
      ['inherit', 'own'].flatMap((mode) => [0, 1, 2, 3].map((index) => [mode, index])),
    )
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
  } finally {
    await page.close()
  }
})

test('CommandPalette semantic classes follow option attributes while shortcuts only inherit typography', {
  skip: !executablePath,
}, async () => {
  const classes =
    'm-0 border-0 border-solid outline-0 opacity-100 font-normal text-black disabled:ml-8 enabled:mr-8 not-disabled:mt-1 not-enabled:mb-1 aria-selected:font-bold aria-selected:text-blue-500 not-aria-selected:border-2 aria-disabled:opacity-50 not-aria-disabled:rounded-lg aria-checked:outline-8 not-aria-checked:pt-1'
  const activeClasses = 'aria-selected:border-4 not-aria-selected:outline-8'
  const shortcutClasses =
    'border-0 border-solid aria-selected:border-4 aria-disabled:opacity-25 disabled:ml-8 enabled:mr-8'
  const css = (
    await compile(
      '@theme { --spacing: 0.25rem; --radius-lg: 8px; --font-weight-normal: 400; --font-weight-bold: 700; --color-black: #000; --color-blue-500: #2b7fff; } @tailwind utilities;',
    )
  ).build([...classes.split(' '), ...activeClasses.split(' '), ...shortcutClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {CommandPalette} from '@hozo/patterns';
        window.paletteSemanticSelections = []; window.paletteSemanticClosures = [];
        const root = createRoot(document.getElementById('root'));
        window.renderPaletteSemantics = (disabledNames = ['Blocked'], open = true) =>
          root.render(<CommandPalette open={open} portal={false}
            commands={['Blocked','Alpha','Beta'].map(label => ({id:label,label,shortcut:label[0],
              disabled:disabledNames.includes(label),onSelect:()=>window.paletteSemanticSelections.push(label)}))}
            onOpenChange={open => window.paletteSemanticClosures.push(open)}
            itemClassName=${JSON.stringify(classes)} activeItemClassName=${JSON.stringify(activeClasses)}
            shortcutClassName=${JSON.stringify(shortcutClasses)}/>);
        window.renderPaletteSemantics();`,
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
  try {
    await page.setContent(
      `<style>${css}</style><button id="pseudo-control" disabled aria-checked="true" class="${classes}">Control</button><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.deepEqual(
      await page.locator('#pseudo-control').evaluate((e) => {
        const css = getComputedStyle(e)
        return [css.marginLeft, css.outlineWidth]
      }),
      ['32px', '8px'],
      'non-matching pseudo-class/ARIA rules must have real CSS',
    )
    const field = page.getByRole('combobox')
    const option = (label) => page.getByRole('option', { name: label, exact: true })
    const check = async (
      current,
      disabledNames = ['Blocked'],
      visible = ['Blocked', 'Alpha', 'Beta'],
    ) => {
      assert.equal(await page.getByRole('option').count(), visible.length)
      for (const label of visible) {
        const selected = label === current
        const disabled = disabledNames.includes(label)
        assert.deepEqual(
          await option(label).evaluate((e) => {
            const css = getComputedStyle(e)
            return {
              selected: e.getAttribute('aria-selected'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              checked: e.getAttribute('aria-checked'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
              margins: [css.marginTop, css.marginRight, css.marginBottom, css.marginLeft],
              border: css.borderTopWidth,
              outline: css.outlineWidth,
              opacity: css.opacity,
              padding: css.paddingTop,
              weight: css.fontWeight,
              color: css.color,
            }
          }),
          {
            selected: String(selected),
            ariaDisabled: disabled ? 'true' : null,
            checked: null,
            disabled: false,
            enabled: false,
            margins: ['4px', '0px', '4px', '0px'],
            border: selected ? '4px' : '2px',
            outline: '0px',
            opacity: disabled ? '0.5' : '1',
            padding: '4px',
            weight: selected ? '700' : '400',
            color: selected ? 'rgb(43, 127, 255)' : 'rgb(0, 0, 0)',
          },
          label,
        )
        const shortcut = option(label).locator('span[aria-hidden]')
        assert.deepEqual(
          await shortcut.evaluate((e) => {
            e.focus()
            const css = getComputedStyle(e)
            return {
              selected: e.getAttribute('aria-selected'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
              focused: e.matches(':focus'),
              border: css.borderTopWidth,
              opacity: css.opacity,
              weight: css.fontWeight,
              color: css.color,
              margins: [css.marginLeft, css.marginRight],
            }
          }),
          {
            selected: null,
            ariaDisabled: null,
            disabled: false,
            enabled: false,
            focused: false,
            border: '0px',
            opacity: '1',
            weight: selected ? '700' : '400',
            color: selected ? 'rgb(43, 127, 255)' : 'rgb(0, 0, 0)',
            margins: ['0px', '0px'],
          },
          `${label} shortcut`,
        )
      }
      assert.equal(
        await field.getAttribute('aria-activedescendant'),
        current === null ? null : await option(current).getAttribute('id'),
      )
      assert.equal(
        await field.evaluate((e) => e === document.activeElement),
        true,
        'input keeps physical focus',
      )
    }
    await check('Alpha')
    // aria-disabled divs still receive DOM clicks. Bypass Playwright's own
    // ARIA actionability refusal to test the component's real run guard.
    await option('Blocked').click({ force: true })
    await check('Alpha')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), [])
    await option('Beta').hover()
    await check('Beta')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), ['Beta'])
    await field.fill('Alpha')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
    await check('Alpha', ['Blocked'], ['Alpha'])
    await field.fill('')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 3)
    await page.evaluate(() => window.renderPaletteSemantics(['Blocked', 'Alpha', 'Beta']))
    await page.waitForFunction(
      () => !document.querySelector('[role="combobox"]').hasAttribute('aria-activedescendant'),
    )
    await check(null, ['Blocked', 'Alpha', 'Beta'])
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), ['Beta'])
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticClosures), [false])
    await page.evaluate(() => window.renderPaletteSemantics(['Blocked'], false))
    await page.waitForFunction(() => !document.querySelector('[role="combobox"]'))
    await page.evaluate(() => window.renderPaletteSemantics())
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.equal(await field.inputValue(), '')
    await check('Alpha')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('CommandPalette shortcuts remain decorative while the real input keeps DOM focus', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-2 font-normal focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const inputClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...classes.split(' '), ...inputClasses.split(' ')])
  assert.ok(css.includes('font-weight: var(--font-weight-bold)'))
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {CommandPalette} from '@hozo/patterns';
        window.paletteSelections = []; window.paletteClosures = [];
        const commands = ['Alpha', 'Beta'].map(label => ({id: label, label,
          shortcut: label[0], onSelect: () => window.paletteSelections.push(label)}));
        createRoot(document.getElementById('root')).render(<CommandPalette open portal={false}
          commands={commands} onOpenChange={open => window.paletteClosures.push(open)}
          itemClassName=${JSON.stringify(classes)} activeItemClassName="focus:outline-4"
          shortcutClassName=${JSON.stringify(classes)} inputClassName=${JSON.stringify(inputClasses)}/>);
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>${css}</style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const field = page.getByRole('combobox')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).outlineWidth), '4px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '700')
    const shortcuts = page.getByRole('option').locator('span[aria-hidden]')
    assert.equal(await shortcuts.count(), 2)
    const assertShortcuts = async () => {
      const options = await page.getByRole('option').evaluateAll((nodes) =>
        nodes.map((e) => {
          e.focus()
          return {
            focused: e.matches(':focus'),
            visible: e.matches(':focus-visible'),
            outline: getComputedStyle(e).outlineWidth,
            weight: getComputedStyle(e).fontWeight,
          }
        }),
      )
      for (const option of options) {
        assert.equal(option.focused, false)
        assert.equal(option.visible, false)
        assert.notEqual(option.outline, '4px')
        assert.equal(option.weight, '400')
      }
      const results = await shortcuts.evaluateAll((nodes) =>
        nodes.map((e) => {
          // A decorative shortcut cannot take focus, even via a programmatic request.
          e.focus()
          const style = getComputedStyle(e)
          return {
            focused: e.matches(':focus'),
            visible: e.matches(':focus-visible'),
            outline: style.outlineWidth,
            weight: style.fontWeight,
            border: style.borderTopWidth,
          }
        }),
      )
      for (const result of results) {
        assert.equal(result.focused, false)
        assert.equal(result.visible, false)
        assert.notEqual(result.outline, '4px')
        assert.equal(result.weight, '400')
        assert.equal(result.border, '2px')
      }
      assert.equal(await field.evaluate((e) => e === document.activeElement), true)
    }
    await assertShortcuts()
    await page.keyboard.press('ArrowDown')
    assert.equal(
      await field.getAttribute('aria-activedescendant'),
      await page.getByRole('option').nth(1).getAttribute('id'),
    )
    await assertShortcuts()
    await shortcuts.nth(1).click()
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
    assert.deepEqual(await page.evaluate(() => window.paletteSelections), ['Beta'])
    assert.equal(await field.evaluate((e) => e === document.activeElement), true)
    await field.fill('Alpha')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
    await assertShortcuts()
    await page.keyboard.press('Enter')
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
    assert.deepEqual(await page.evaluate(() => window.paletteSelections), ['Beta', 'Alpha'])
    assert.deepEqual(await page.evaluate(() => window.paletteClosures), [false, false])
  } finally {
    await page.close()
  }
})

test('OTP semantic classes separate real input mutability from decorative spans', {
  skip: !executablePath,
}, async () => {
  const inputClasses =
    'outline-0 rounded-none enabled:rounded-lg disabled:outline-offset-4 not-disabled:outline-offset-2 read-only:outline-2 not-read-only:outline-4 read-only:focus:outline-6 aria-disabled:opacity-25'
  const decorationClasses =
    'size-8 outline-0 read-only:outline-2 disabled:outline-offset-8 enabled:opacity-25 aria-disabled:rounded-lg'
  const css = (
    await compile('@theme {--spacing:0.25rem; --radius-lg:8px;} @tailwind utilities;')
  ).build([...inputClasses.split(' '), ...decorationClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {OtpInput} from '@hozo/patterns';
      const cases = []; for(const mask of [false,true]) for(const disabled of [false,true])
        for(const readOnly of [false,true]) cases.push({mask,disabled,readOnly});
      createRoot(document.getElementById('root')).render(<>{cases.map((props,index)=><section key={index} id={'otp-sem-'+index}>
        <OtpInput {...props} accessibilityLabel={'Code '+index} value="1" length={2} showCaret={false}
          inputClassName=${JSON.stringify(inputClasses)} className=${JSON.stringify(decorationClasses)}
          cellClassName=${JSON.stringify(decorationClasses)} filledCellClassName=${JSON.stringify(decorationClasses)}
          activeCellClassName=${JSON.stringify(decorationClasses)} /></section>)}</>);`,
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
  try {
    await page.setContent(
      `<style>${css}</style><div id="otp-aria-control" aria-disabled="true" class="${inputClasses}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root input').length === 8)
    assert.equal(
      await page.locator('#otp-aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.25',
    )
    let index = 0
    for (const mask of [false, true])
      for (const disabled of [false, true])
        for (const readOnly of [false, true]) {
          const wrapper = page.locator(`#otp-sem-${index} > div`)
          const input = wrapper.locator('input')
          assert.deepEqual(
            await input.evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                disabled: e.matches(':disabled'),
                enabled: e.matches(':enabled'),
                readOnly: e.matches(':read-only'),
                ariaDisabled: e.getAttribute('aria-disabled'),
                outline: css.outlineWidth,
                offset: css.outlineOffset,
                radius: css.borderTopLeftRadius,
                opacity: css.opacity,
                type: e.getAttribute('type'),
              }
            }),
            {
              disabled,
              enabled: !disabled,
              readOnly: disabled || readOnly,
              ariaDisabled: null,
              outline: disabled || readOnly ? '2px' : '4px',
              offset: disabled ? '4px' : '2px',
              radius: disabled ? '0px' : '8px',
              opacity: '1',
              type: mask ? 'password' : 'text',
            },
          )
          if (!disabled) {
            await input.focus()
            assert.equal(await input.evaluate((e) => e === document.activeElement), true)
            assert.equal(
              await input.evaluate((e) => getComputedStyle(e).outlineWidth),
              readOnly ? '6px' : '4px',
            )
          }
          for (const decoration of [
            wrapper,
            ...(await wrapper.locator('span[aria-hidden="true"]').all()),
          ]) {
            assert.deepEqual(
              await decoration.evaluate((e) => {
                const css = getComputedStyle(e)
                return {
                  disabled: e.matches(':disabled'),
                  enabled: e.matches(':enabled'),
                  readOnly: e.matches(':read-only'),
                  focused: e.matches(':focus'),
                  ariaDisabled: e.getAttribute('aria-disabled'),
                  outline: css.outlineWidth,
                  opacity: css.opacity,
                }
              }),
              {
                disabled: false,
                enabled: false,
                readOnly: true,
                focused: false,
                ariaDisabled: null,
                outline: '2px',
                opacity: '1',
              },
            )
          }
          index++
        }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('OTP cells and gaps forward mouse and touch input to the single field', {
  skip: !executablePath,
}, async () => {
  const cases = [
    { name: 'empty' },
    { name: 'filled', defaultValue: '12' },
    { name: 'masked', defaultValue: '12', mask: true },
    { name: 'disabled', defaultValue: '12', disabled: true },
    { name: 'readonly', defaultValue: '12', readOnly: true },
  ]
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {OtpInput} from '../../packages/patterns/src/otp-input.tsx';
        createRoot(document.getElementById('root')).render(<>
          <button id="before">Before</button>
          {${JSON.stringify(cases)}.map(({name,...props}) => <section key={name}>
            <OtpInput {...props} testID={name} accessibilityLabel={name}
              className="otp-row" cellClassName="otp-cell"/>
          </section>)}
          <button id="after">After</button>
        </>);`,
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
  const page = await browser.newPage({ hasTouch: true, viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>
      .otp-row { gap: 8px; margin: 4px; }
      .otp-cell { display: flex; width: 44px; height: 44px; align-items: center;
        justify-content: center; background: white; border: 1px solid black; }
      </style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.getByTestId('empty').waitFor()
    for (const method of ['mouse', 'touch']) {
      for (const { name, defaultValue = '', disabled, readOnly } of cases) {
        const row = page.getByTestId(name)
        const field = row.locator('input')
        const cells = row.locator(':scope > span[aria-hidden]')
        assert.equal(await field.count(), 1)
        assert.equal(await cells.count(), 6)
        const boxes = await cells.evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect()
            return { x, y, width, height }
          }),
        )
        const points = [
          {
            label: 'gap',
            x: (boxes[0].x + boxes[0].width + boxes[1].x) / 2,
            y: boxes[0].y + boxes[0].height / 2,
          },
          ...boxes.map((box, index) => ({
            label: `cell ${index}`,
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          })),
        ]
        for (const { label, x, y } of points) {
          await page.locator('#before').click()
          if (method === 'mouse') await page.mouse.click(x, y)
          else await page.touchscreen.tap(x, y)
          assert.equal(
            await field.evaluate((node) => node === document.activeElement),
            !disabled,
            `${method} ${name} ${label}: focus reaches only an enabled field`,
          )
          await page.keyboard.press('End')
          await page.keyboard.type('7')
          assert.equal(
            await field.inputValue(),
            disabled || readOnly ? defaultValue : `${defaultValue}7`,
            `${method} ${name} ${label}: typing respects field mutability`,
          )
          if (!disabled && !readOnly) await field.fill(defaultValue)
        }
      }
    }
    await page.locator('#before').focus()
    for (const { name, disabled } of cases) {
      if (disabled) continue
      await page.keyboard.press('Tab')
      assert.equal(
        await page
          .getByTestId(name)
          .locator('input')
          .evaluate((node) => node === document.activeElement),
        true,
        `${name}: decorative cells add no tab stops`,
      )
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('OTP focus belongs to the one input, not active or filled decorative cells', {
  skip: !executablePath,
}, async () => {
  const cellClasses =
    'border-2 opacity-50 font-normal focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const inputClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...cellClasses.split(' '), ...inputClasses.split(' ')])
  assert.ok(
    css.includes('font-weight: var(--font-weight-bold)'),
    'the focus typography rule must exist',
  )
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {OtpInput} from '@hozo/patterns';
        const slots = ['cellClassName', 'activeCellClassName', 'filledCellClassName'];
        createRoot(document.getElementById('root')).render(<>
          <button id="before">Before</button>
          {slots.map(slot => <OtpInput key={slot} testID={slot} accessibilityLabel={slot}
            length={3} defaultValue="1" inputClassName=${JSON.stringify(inputClasses)}
            {...{[slot]: ${JSON.stringify(cellClasses)}}}/>) }
          <button id="after">After</button>
        </>);
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
    await page.setContent(`<style>${css}</style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.locator('#before').focus()
    for (const slot of ['cellClassName', 'activeCellClassName', 'filledCellClassName']) {
      const root = page.getByTestId(slot)
      const field = root.locator('input')
      const cells = root.locator(':scope > span[aria-hidden]')
      assert.equal(await field.count(), 1)
      assert.equal(await cells.count(), 3)
      // Real Tab navigation: the virtual cells must not insert extra stops.
      await page.keyboard.press('Tab')
      assert.equal(await field.evaluate((e) => e === document.activeElement), true, slot)
      await page.keyboard.press('End')
      assert.equal(await field.evaluate((e) => getComputedStyle(e).outlineWidth), '4px', slot)
      assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '700', slot)
      assert.equal(await root.evaluate((e) => e.matches(':focus')), false, slot)
      const assertCells = async () => {
        const styles = await cells.evaluateAll((nodes) =>
          nodes.map((e) => {
            const style = getComputedStyle(e)
            return {
              focused: e.matches(':focus'),
              visible: e.matches(':focus-visible'),
              outline: style.outlineWidth,
              weight: style.fontWeight,
            }
          }),
        )
        for (const style of styles) {
          assert.equal(style.focused, false, slot)
          assert.equal(style.visible, false, slot)
          assert.notEqual(style.outline, '4px', slot)
          assert.notEqual(style.weight, '700', slot)
        }
      }
      await assertCells()
      const target = slot === 'activeCellClassName' ? 1 : 0
      assert.deepEqual(
        await cells.nth(target).evaluate((e) => {
          const style = getComputedStyle(e)
          return [style.opacity, style.borderTopWidth, style.fontWeight]
        }),
        ['0.5', '2px', '400'],
        `${slot}: unconditional decoration still applies`,
      )
      await field.press('Home')
      await page.waitForFunction((slot) => {
        const root = document.querySelector(`[data-testid="${slot}"]`)
        return (
          root.querySelector('[data-hozo-otp-caret]')?.parentElement ===
          root.querySelector('span[aria-hidden]')
        )
      }, slot)
      await assertCells()
      assert.equal(await root.locator('[data-hozo-otp-caret]').getAttribute('aria-hidden'), 'true')
      assert.equal(
        await root
          .locator('[data-hozo-otp-caret]')
          .evaluate((e) => getComputedStyle(e).pointerEvents),
        'none',
      )
      await field.press('Shift+ArrowRight')
      assert.equal(
        await root.locator('[data-hozo-otp-caret]').count(),
        0,
        'a selection range hides the caret',
      )
      // Blur independently of Tab, then restore the field so the next Tab
      // continues the real browser's order rather than a simulated iterator.
      await field.evaluate((e) => e.blur())
      await page.waitForFunction(
        (slot) => !document.querySelector(`[data-testid="${slot}"] [data-hozo-otp-caret]`),
        slot,
      )
      await assertCells()
      if (slot === 'activeCellClassName')
        assert.equal(await cells.nth(0).evaluate((e) => getComputedStyle(e).opacity), '1')
      await field.focus()
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
    await page.keyboard.press('Shift+Tab')
    assert.equal(
      await page.getByLabel('filledCellClassName').evaluate((e) => e === document.activeElement),
      true,
    )
  } finally {
    await page.close()
  }
})

test('standalone NativeSelect SSR shares the pointer policy without hydration', {
  skip: !executablePath,
}, async () => {
  const utilities = ['cursor-default', 'cursor-auto', 'cursor-wait', 'cursor-not-allowed']
  cache.scanFile('picker-cursors.ts', `export const classes = '${utilities.join(' ')}'`, 1)
  const cssVariants = [
    ['Hozo candidates', cache.renderCss(undefined, utilities)],
    ['Tailwind', (await compile('@tailwind utilities;')).build(utilities)],
  ]
  for (const [name, css] of cssVariants) {
    for (const utility of utilities) assert.ok(css.includes(`.${utility}`), `${name}: ${utility}`)
  }
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
