// Shared compiler/candidate ordering, UI slot composition, and authored owner runs.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createCompiler,
  openCandidateCache,
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch, TailwindProjectSession } from '@hozo/compiler/project'
import { createClassResolver, cx } from '@hozo/engine'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import { hozoTextMetricStyles } from '../../../packages/engine/src/class-resolver.ts'
import { hozoSpreadStyles } from '../../../packages/engine/src/spread-styles.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import {
  gapGeometry,
  gapLayouts,
  prepareGapAliasSubjects,
  yogaGapGeometry,
} from '../../../packages/tailwind-conformance/src/gap-alias-reference.ts'
import {
  prepareOrderSubjects,
  projectOrderNative,
  summarizeOrderCells,
} from '../../../packages/tailwind-conformance/src/tailwind-order-baseline.ts'
import { orderCases } from '../../../packages/tailwind-conformance/src/tailwind-order-corpus.ts'
import { prepareOrderReference } from '../../../packages/tailwind-conformance/src/tailwind-order-reference.ts'
import {
  authoredOwnerContext,
  caller,
  canonicalAlignment,
  assertRepeatedOwnerRegisters as checkRepeatedOwnerRegisters,
  createTempDirectory,
  createUiCompositionHarness,
  evaluate,
  executablePath,
  launchCallerBrowser,
  removeTempDirectory,
} from './caller-composition-harness.mjs'

const directory = createTempDirectory()
const compiler = createCompiler()
const { uiTheme, uiCompiler, uiCases, uiCandidates, resolveUiClasses } =
  await createUiCompositionHarness(directory)
let browser

const assertRepeatedOwnerRegisters = (opts) => checkRepeatedOwnerRegisters(browser, compiler, opts)

before(async () => {
  browser = await launchCallerBrowser()
})
after(async () => {
  await browser?.close()
  removeTempDirectory(directory)
})

for (const { file, name, slots, source, variants, classes } of uiCases) {
  test(`shipped ${name} compiles its own classes separately on every slot`, {
    skip: !executablePath,
  }, async () => {
    const web = lowerModule(source, `${file}.tsx`, `${file}.tsx`, uiCompiler, '')
    const native = transformHozoSource(source, `${file}.tsx`, directory, uiCompiler)
    assert.ok(web)
    assert.ok(native)
    const calls = []
    const context = {
      cx,
      h: (_type, props) => props,
      [name]: name,
      [`Hozo${name}`]: name,
      View: 'View',
      Animated: { View: 'AnimatedView' },
      // Scheduling/motion delivery are not measured by this style probe.
      useHozoAnimation: () => undefined,
      useHozoEnvironment: () => false,
      StyleSheet: { create: (styles) => styles },
      useHozoDark: () => false,
      hozoSpreadStyles,
      // Observe the residual without dropping the generated resolver's
      // identity tables or the mixed boundary's selective deferral argument.
      hozoClasses: Object.assign((...args) => {
        calls.push(args[0])
        return resolveUiClasses(...args)
      }, resolveUiClasses),
    }
    const moduleFrom = (code) => {
      const exported = evaluate(code.replace(/^import .*$/gm, ''), context)
      return exported[name] ?? exported[`Hozo${name}`]
    }
    const webComponent = moduleFrom(web.code)
    const nativeComponent = moduleFrom(native)
    const authoredComponent = moduleFrom(source)
    const opaqueSource = `${source.replaceAll('cx(', 'joinOpaque(')}
      const joinOpaque = (...classes) => classes.filter(Boolean).join(' ')`
    const opaque = lowerModule(opaqueSource, `${file}.tsx`, `${file}.tsx`, uiCompiler, '')
    assert.ok(opaque)
    const opaqueProps = moduleFrom(opaque.code)(
      Object.fromEntries(slots.map((slot) => [slot, caller])),
    )
    for (const slot of slots) {
      assert.notEqual(
        opaqueProps[slot]
          .split(/\s+/)
          .filter((value) => !value.startsWith('hozo-'))
          .join(' '),
        caller,
        `${name}.${slot}: the old opaque helper must expose own classes in the residual`,
      )
    }
    const page = await browser.newPage()
    try {
      for (const variant of variants) {
        for (const extra of [undefined, '', classes]) {
          const input = { ...variant, ...Object.fromEntries(slots.map((slot) => [slot, extra])) }
          const webProps = webComponent(input)
          calls.length = 0
          const nativeProps = nativeComponent(input)
          const authoredProps = authoredComponent(input)
          for (const slot of slots) {
            const residual = webProps[slot]
              .split(/\s+/)
              .filter((value) => value && !value.startsWith('hozo-'))
            assert.equal(
              residual.join(' '),
              extra ?? '',
              `${name}.${slot}: caller-only Web residual`,
            )
            assert.ok(authoredProps[slot], `${name}.${slot}: original resting classes exist`)
            if (extra) {
              // All compiler-generated owners are ordinary spans here: this
              // measures the composition boundary, not pattern DOM/event code.
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<span class="${webProps[slot]}">Label</span>`,
                )
                assert.deepEqual(
                  await page.locator('span').evaluate((element) => {
                    const style = getComputedStyle(element)
                    return [
                      style.paddingTop,
                      style.borderTopLeftRadius,
                      style.color,
                      style.fontSize,
                      style.fontWeight,
                      style.lineHeight,
                    ]
                  }),
                  ['32px', '48px', 'rgb(0, 17, 221)', '28px', '400', '36px'],
                  `${name}.${slot}: caller wins in either stylesheet order`,
                )
              }
            }
            const stem = slot === 'className' ? '' : slot.replace(/ClassName$/, '')
            const capital = stem ? stem[0].toUpperCase() + stem.slice(1) : ''
            const style =
              nativeProps[`hozo${capital}Style`] ?? nativeProps[stem ? `${stem}Style` : 'style']
            assert.ok(style, `${name}.${slot}: compiled Native style exists`)
            const flat = Object.assign(
              {},
              ...[typeof style === 'function' ? style({}) : style].flat(Infinity).filter(Boolean),
            )
            if (name === 'ColorPicker' && slot === 'thumbClassName') {
              assert.equal(flat.outlineWidth, undefined)
              const focused = Object.assign(
                {},
                ...style({ focused: true, focusVisible: true, 'aria-disabled': false })
                  .flat(Infinity)
                  .filter(Boolean),
              )
              assert.equal(focused.outlineWidth, 2)
              assert.equal(focused.outlineOffset, 2)
              assert.equal(
                focused.outlineColor,
                uiTheme.colors.find((entry) => entry.token === 'hozo-focus')?.hex,
              )
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<div role="slider" tabindex="0" class="${webProps[slot]}">Thumb</div>`,
                )
                await page.locator('div').focus()
                assert.deepEqual(
                  await page.locator('div').evaluate((element) => {
                    const css = getComputedStyle(element)
                    return [css.outlineWidth, css.outlineOffset, css.outlineStyle]
                  }),
                  ['2px', '2px', 'solid'],
                  'the shipped thumb look has the same focused outline geometry on Web',
                )
              }
            }
            if (name === 'Card') {
              assert.equal(authoredProps.className.includes('shadow-hozo-surface'), !variant.flat)
              // Theme loading currently exports colours/radii/animations,
              // not custom shadow scales. Compare the old resolver path
              // rather than claiming that this composition fix adds them.
              const previous = Object.assign(
                {},
                ...resolveUiClasses(authoredProps.className).flat(Infinity).filter(Boolean),
              )
              if (name === 'Avatar') {
                if (slot === 'className') {
                  const size = { sm: 32, md: 40, lg: 56 }[variant.size ?? 'md']
                  assert.equal(flat.width, size)
                  assert.equal(flat.height, size)
                  assert.equal(
                    flat.fontSize,
                    extra ? 28 : { sm: 12, md: 14, lg: 18 }[variant.size ?? 'md'],
                  )
                }
                if (slot === 'statusClassName') {
                  const token =
                    variant.status === 'online'
                      ? 'hozo-presence'
                      : variant.status === 'busy'
                        ? 'hozo-danger'
                        : 'hozo-border-strong'
                  const color = uiTheme.colors.find((entry) => entry.token === token)?.hex
                  assert.ok(color)
                  assert.equal(flat.backgroundColor, color)
                  assert.equal(flat.width, 12)
                  assert.equal(flat.height, 12)
                }
                if (slot === 'imageClassName') {
                  assert.equal(flat.width, '100%')
                  assert.equal(flat.height, '100%')
                }
              }
              assert.deepEqual(flat.boxShadow, previous.boxShadow)
              if (!extra) {
                assert.equal(flat.paddingTop, 24)
                assert.equal(flat.borderRadius, 16)
              }
            }
            if (name === 'Stack') {
              const direction = extra ? 'column' : (variant.direction ?? 'column')
              const gap = extra
                ? 32
                : { none: 0, tight: 8, normal: 16, loose: 24 }[variant.gap ?? 'normal']
              const align = extra
                ? 'flex-start'
                : { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }[
                    variant.align ?? 'stretch'
                  ]
              assert.equal(flat.flexDirection, direction)
              assert.deepEqual([flat.rowGap, flat.columnGap], [gap, gap])
              assert.equal(flat.alignItems, align)
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<div class="${webProps.className}">Label</div>`,
                )
                const layout = await page.locator('div').evaluate((element) => {
                  const style = getComputedStyle(element)
                  return [style.display, style.flexDirection, style.gap, style.alignItems]
                })
                layout[3] = canonicalAlignment(layout[3])
                assert.deepEqual(
                  layout,
                  ['flex', direction, `${gap}px`, canonicalAlignment(align)],
                  `Stack ${JSON.stringify(variant)} preserves its layout choices and caller overrides`,
                )
              }
            }
            if (extra) {
              assert.equal(flat.paddingTop, 32, `${name}.${slot}: Native caller padding`)
              assert.equal(flat.borderRadius, 48, `${name}.${slot}: Native caller radius`)
            } else {
              assert.ok(
                Object.keys(flat).length,
                `${name}.${slot}: resting style survives without a caller`,
              )
            }
          }
          assert.equal(calls.length, slots.length + (name === 'ColorPicker' ? 1 : 0))
          assert.ok(
            calls.every((classes) => classes === extra),
            `${name}: only caller strings reach the Native resolver`,
          )
        }
      }
    } finally {
      await page.close()
    }
  })
}

test('gap alias boundary compares actual Tailwind and compiled browser geometry with real Yoga', {
  skip: !executablePath,
}, async () => {
  const subjects = await prepareGapAliasSubjects()
  const names = [...new Set(subjects.flatMap((subject) => subject.classes.split(' ')))]
  const sheet = (await compile('@tailwind utilities;')).build(names)
  const page = await browser.newPage()
  let browserObservations = 0
  let knownMismatches = 0
  try {
    for (const subject of subjects) {
      for (const layout of gapLayouts) {
        const element = (id, className, style) =>
          renderToStaticMarkup(
            createElement(
              'div',
              {
                id,
                className,
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignContent: 'flex-start',
                  alignItems: 'flex-start',
                  width: 140,
                  height: 140,
                  ...layout,
                  ...style,
                },
              },
              ...[0, 1, 2].map((key) =>
                createElement('div', {
                  key,
                  style: { flex: 'none', width: 50, height: 50 },
                }),
              ),
            ),
          )
        await page.setContent(
          `<!doctype html><style>${sheet}\n${subject.css}</style>${element('raw-reference', subject.classes, subject.inline)}${element('reference', subject.classes, subject.referenceInline)}${element('compiled', subject.webProps.className, subject.webProps.style)}`,
        )
        for (const id of ['raw-reference', 'reference', 'compiled']) {
          const positions = await page.locator(`#${id}`).evaluate((owner) => {
            const box = owner.getBoundingClientRect()
            return [...owner.children].map((child) => {
              const childBox = child.getBoundingClientRect()
              return [childBox.left - box.left, childBox.top - box.top]
            })
          })
          const measured = gapGeometry(positions, layout.flexDirection)
          assert.deepEqual(
            measured,
            id === 'raw-reference' ? subject.rawWeb : subject.web,
            `${subject.id}/${id}/${JSON.stringify(layout)}`,
          )
          browserObservations++
          if (id === 'reference') {
            for (const style of [
              subject.selected,
              subject.dynamic,
              subject.spread,
              subject.dynamicSpread,
            ]) {
              const native = yogaGapGeometry(style, layout)
              assert.deepEqual(native, subject.native)
              if (JSON.stringify(native) !== JSON.stringify(measured)) knownMismatches++
            }
          }
        }
      }
    }
    assert.equal(browserObservations, 480)
    assert.equal(knownMismatches, 0, 'class/inline gap composition matches on both compiler paths')
  } finally {
    await page.close()
  }
})

test('shared assessed rule priorities predict independent Tailwind browser winners', {
  skip: !executablePath,
}, async () => {
  const definitions = [
    ['', '#112233'],
    ['focus:', '#223344'],
    ['active:', '#334455'],
    ['hover:focus:', '#445566'],
    ['', '#556677', '!'],
    ['hover:', '#667788', '!'],
  ].map(([prefix, color, suffix = '']) => ({ candidate: `${prefix}bg-[${color}]${suffix}`, color }))
  const css = '@tailwind utilities;'
  const names = definitions.map(({ candidate }) => candidate)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const priorities = prepareTailwindContext(JSON.stringify(prepared.snapshot)).rulePriorities()
  const entries = definitions.map((entry) => {
    const priority = priorities.rules.find(
      ({ candidateId }) => candidateId === prepared.lookup(entry.candidate).id,
    )
    assert.equal(typeof priority?.rank, 'number', entry.candidate)
    return { ...entry, rank: priority.rank }
  })
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    // Measurement control: bare :hover is deliberately different in quirks
    // mode. Do not mistake that selector quirk for absent pointer delivery.
    await page.setContent('<button id="subject" style="width:80px;height:40px">Probe</button>')
    await page.mouse.move(200, 200)
    await page.locator('#subject').hover()
    await page.waitForFunction(
      () => document.querySelector('#subject').matches('button:hover'),
      null,
      { timeout: 2000 },
    )
    assert.deepEqual(
      await page.locator('#subject').evaluate((element) => ({
        mode: document.compatMode,
        bare: element.matches(':hover'),
        qualified: element.matches('button:hover'),
      })),
      { mode: 'BackCompat', bare: false, qualified: true },
    )
    for (const indices of [
      [0, 1, 2],
      [0, 2, 3],
      [2, 3, 4],
      [3, 4, 5],
    ]) {
      const members = indices.map((index) => entries[index])
      const predicted = members.reduce((a, b) => (a.rank > b.rank ? a : b))
      const expectedColor = [1, 3, 5].map((start) =>
        Number.parseInt(predicted.color.slice(start, start + 2), 16),
      )
      for (const ordered of [members, [...members].reverse()]) {
        await page.setContent(
          `<!doctype html><style>${sheet}</style><button id="subject" style="width:80px;height:40px" class="${ordered.map(({ candidate }) => candidate).join(' ')}">Target</button>`,
        )
        assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
        // Enter each fresh document with a real pointer movement and verify
        // state before comparing its color. No pseudo-class is forced in JS.
        await page.mouse.move(200, 200)
        const target = page.locator('#subject')
        await target.focus()
        await target.hover()
        await page
          .waitForFunction(
            () => {
              const target = document.querySelector('#subject')
              return target.matches(':focus') && target.matches(':hover')
            },
            null,
            { timeout: 2000 },
          )
          .catch(async (error) => {
            console.error(
              JSON.stringify({
                stage: 'priority-oracle-hover',
                classes: ordered.map(({ candidate }) => candidate),
                document: await target.evaluate((element) => {
                  const rect = element.getBoundingClientRect()
                  const x = rect.x + rect.width / 2,
                    y = rect.y + rect.height / 2
                  return {
                    focus: element.matches(':focus'),
                    mode: document.compatMode,
                    qualifiedHover: element.matches('button:hover'),
                    hover: element.matches(':hover'),
                    active: element.matches(':active'),
                    rect: rect.toJSON(),
                    hit: document.elementFromPoint(x, y)?.outerHTML,
                    hovered: [...document.querySelectorAll(':hover')].map((entry) =>
                      entry.outerHTML.slice(0, 200),
                    ),
                    viewport: [innerWidth, innerHeight],
                    hoverMedia: matchMedia('(hover: hover)').matches,
                  }
                }),
              }),
            )
            throw error
          })
        await page.mouse.down()
        try {
          await page.waitForFunction(
            () => document.querySelector('#subject').matches(':active'),
            null,
            { timeout: 2000 },
          )
          const actual = await target.evaluate((element) => ({
            states: [':focus', ':hover', ':active'].map((selector) => element.matches(selector)),
            color: getComputedStyle(element).backgroundColor,
          }))
          assert.deepEqual(actual.states, [true, true, true])
          assert.equal(
            actual.color,
            `rgb(${expectedColor.join(', ')})`,
            ordered.map(({ candidate }) => candidate).join(' '),
          )
        } finally {
          await page.mouse.up()
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('the common scalar IR plan reaches both actual lowerers and matches independent browser winners', {
  skip: !executablePath,
}, async () => {
  const result = JSON.parse(
    execFileSync(
      'cargo',
      ['run', '--quiet', '-p', 'hozo_napi', '--example', 'tailwind-scalar-plan'],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, CARGO_BUILD_JOBS: '1' },
        timeout: 120_000,
      },
    ),
  )
  assert.equal(result.rows.length, 8)
  const names = [...new Set(result.rows.flatMap((row) => row.classes.split(' ')))]
  const theme = readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')
  const sheet = (await compile(`${theme}\n@tailwind utilities;`)).build(names)
  const page = await browser.newPage()
  let legacyMismatches = 0
  try {
    for (const row of result.rows) {
      assert.deepEqual(row.native.prelude, [])
      const props = evaluate(
        `const hozoStyles=${row.native.styles};module.exports=(${row.native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      await page.setContent(
        `<!doctype html><style>${sheet}\n${row.webCss}\n${row.legacyCss.replaceAll('.hozo-0', '.legacy-0')}</style><button id="oracle" class="${row.classes}">Target</button><button id="planned" class="hozo-0">Target</button><button id="legacy" class="legacy-0">Target</button>`,
      )
      const read = async (id, stage) => {
        await page.mouse.move(600, 600)
        await page.evaluate(() => document.activeElement?.blur())
        const target = page.locator(`#${id}`)
        if (stage > 0) await target.focus()
        if (stage > 1) await target.hover()
        if (stage > 2) await page.mouse.down()
        try {
          return await target.evaluate(
            (element, keys) => ({
              facts: {
                focused: element.matches(':focus'),
                hovered: element.matches(':hover'),
                pressed: element.matches(':active'),
              },
              values: Object.fromEntries(
                ['backgroundColor', ...keys].map((key) => [key, getComputedStyle(element)[key]]),
              ),
            }),
            row.keys,
          )
        } finally {
          if (stage > 2) await page.mouse.up()
        }
      }
      for (let stage = 0; stage < 4; stage++) {
        const oracle = await read('oracle', stage)
        const planned = await read('planned', stage)
        assert.deepEqual(planned.facts, {
          focused: stage > 0,
          hovered: stage > 1,
          pressed: stage > 2,
        })
        assert.deepEqual(planned, oracle, row.classes)
        const selected =
          typeof props.style === 'function' ? props.style(planned.facts) : props.style
        const native = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
        for (const key of row.keys)
          assert.equal(`${native[key]}px`, oracle.values[key], `${row.classes}: ${key}`)
        const legacy = await read('legacy', stage)
        if (JSON.stringify(legacy.values) !== JSON.stringify(oracle.values)) legacyMismatches++
      }
    }
    assert.ok(legacyMismatches > 0, 'the independent oracle must detect old static winners')
  } finally {
    await page.close()
  }
})

test('the generated common-plan resolver agrees with real Tailwind across state changes and reversed classes', {
  skip: !executablePath,
}, async () => {
  const names = [
    'p-2',
    'p-4',
    'bg-[#112233]',
    'focus:bg-[#223344]',
    'active:bg-[#334455]',
    'hover:focus:bg-[#445566]',
  ]
  const css = '@theme { --spacing: .25rem; } @tailwind utilities;'
  const candidates = openCandidateCache()
  candidates.scanFile('probe.ts', `export const classes=${JSON.stringify(names.join(' '))}`, 1)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), candidates.candidates())
  const plan = candidates.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  const localContext = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const expanded = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...names,
    ...Array.from({ length: 128 }, (_, index) => `m-${index + 1}`),
    'sm:p-8',
    'first:m-4',
    'aria-selected:w-8',
  ])
  const localResolve = evaluate(
    candidates.renderNativeModulePlan(localContext).code.replace(/^import .*$/gm, ''),
    { createClassResolver },
  ).hozoClasses
  const defaultResolve = evaluate(candidates.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  assert.ok(plan.ordering)
  const generated = evaluate(plan.code.replace(/^import .*$/gm, ''), {
    createClassResolver: (styles, unsupported, compose, states, ambient) =>
      styles.schema === 1 ? styles : { styles, unsupported, compose, states, ambient },
  }).hozoClasses
  const legacy = createClassResolver(
    generated.styles,
    generated.unsupported,
    generated.compose,
    generated.states,
    generated.ambient,
  )
  const resolve = createClassResolver({ schema: 1, ...generated, ordering: plan.ordering })
  const lists = [
    'p-4 p-2 bg-[#112233] focus:bg-[#223344] active:bg-[#334455] hover:focus:bg-[#445566]',
    'hover:focus:bg-[#445566] active:bg-[#334455] focus:bg-[#223344] bg-[#112233] p-2 p-4',
  ]
  const collected = lists.flatMap((classes, index) => {
    const source = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
    return [
      { id: `w${index}`, revision: 'one', module: compiler.prepareWebModule(source) },
      { id: `n${index}`, revision: 'one', module: compiler.prepareNativeModule(source) },
    ]
  })
  const receipt = { id: 'probe.ts', revision: 'one', record: candidates.exportFile('probe.ts') }
  const final = await emitFinalTailwindBatch({
    expected: collected,
    collected,
    runtime: { expected: [receipt], contributions: [receipt] },
    prepare: async () => JSON.stringify(expanded.snapshot),
  })
  assert.notEqual(final.fingerprint, plan.fingerprint)
  assert.notEqual(final.fingerprint, localContext.fingerprint)
  assert.notEqual(final.native.ordering.ranks['p-4'][0], plan.ordering.ranks['p-4'][0])
  const emittedResolve = evaluate(final.native.code.replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  const sheet = (await compile(css)).build(names)
  const session = new TailwindProjectSession(compiler, async (observed) =>
    JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), observed)).snapshot),
  )
  const page = await browser.newPage()
  let legacyMismatches = 0
  try {
    for (const [index, classes] of lists.entries()) {
      const web = final.modules.find(({ id }) => id === `w${index}`).output[0]
      const native = final.modules.find(({ id }) => id === `n${index}`).output.components[0]
      const localSource = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
      const [defaultWeb, defaultNative] = await session.emit(`default-${index}`, [
        (compiler) => compiler.prepareWebModule(localSource),
        (compiler) => compiler.prepareNativeModule(localSource),
      ])
      assert.deepEqual(defaultWeb[0], web, 'the default adapter session uses the common winner')
      assert.deepEqual(defaultNative.components[0], native)
      assert.deepEqual(compiler.prepareWebModule(localSource).emit(localContext)[0], web)
      assert.deepEqual(
        compiler.prepareNativeModule(localSource).emit(localContext).components[0],
        native,
      )
      const nativeProps = evaluate(
        `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      const runtimeSource = `import {Pressable} from '@hozo/core';export const Target=({classes})=> <Pressable className={classes}/>`
      const [runtimeOutput] = await session.emit(`dynamic-${index}`, [
        (compiler) => compiler.prepareNativeModule(runtimeSource),
      ])
      const runtimeComponent = runtimeOutput.components[0]
      const runtimeProps = evaluate(`module.exports=(${runtimeComponent.jsx})`, {
        classes,
        hozoClasses: localResolve,
        HozoPressable: 'owner',
        h: (_type, props) => props,
      })
      const [mixedOutput] = await session.emit(`mixed-${index}`, [
        (compiler) =>
          compiler.prepareNativeModule(
            runtimeSource.replace(
              'className={classes}',
              'className={classes} style={{paddingTop:99}}',
            ),
          ),
      ])
      const mixedProps = evaluate(`module.exports=(${mixedOutput.components[0].jsx})`, {
        classes,
        hozoClasses: localResolve,
        HozoPressable: 'owner',
        h: (_type, props) => props,
      })
      await page.setContent(
        `<!doctype html><style>${sheet}\n${web.css}</style><button id="subject" style="width:80px;height:40px" class="${classes}">Target</button><button id="planned" style="width:80px;height:40px" class="hozo-0">Target</button>`,
      )
      assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
      await page.mouse.move(200, 200)
      const target = page.locator('#subject')
      const check = async (expected) => {
        const actual = await target.evaluate((element) => ({
          state: {
            focused: element.matches(':focus'),
            hovered: element.matches(':hover'),
            pressed: element.matches(':active'),
          },
          color: getComputedStyle(element).backgroundColor,
          padding: Number.parseFloat(getComputedStyle(element).paddingTop),
        }))
        assert.deepEqual(actual.state, expected)
        const read = (resolver) => {
          const value = Object.assign({}, ...resolver(classes, actual.state))
          assert.match(value.backgroundColor, /^#[\da-f]{6}$/i)
          return {
            color: `rgb(${[1, 3, 5].map((start) => Number.parseInt(value.backgroundColor.slice(start, start + 2), 16)).join(', ')})`,
            padding: value.paddingTop,
          }
        }
        const oracle = { color: actual.color, padding: actual.padding }
        const dynamicSelected = runtimeProps.style(actual.state)
        const dynamicStyle = Object.assign({}, ...[dynamicSelected].flat(Infinity).filter(Boolean))
        assert.deepEqual(
          read(() => [dynamicStyle]),
          oracle,
          'actual dynamically compiled Native owner',
        )
        const mixedStyle = Object.assign(
          {},
          ...[mixedProps.style(actual.state)].flat(Infinity).filter(Boolean),
        )
        assert.deepEqual(
          read(() => [mixedStyle]),
          { ...oracle, padding: 99 },
          'authored styles retain their input tier above the generated dynamic plan',
        )
        assert.deepEqual(read(resolve), oracle)
        assert.deepEqual(read(defaultResolve), oracle, 'the ordinary built-in runtime map')
        assert.deepEqual(read(emittedResolve), oracle, 'the actual generated object factory call')
        assert.deepEqual(
          read(localResolve),
          oracle,
          'the actual factory in the smaller, separately numbered namespace',
        )
        const selected =
          typeof nativeProps.style === 'function'
            ? nativeProps.style(actual.state)
            : nativeProps.style
        const staticStyle = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
        assert.deepEqual(
          read(() => [staticStyle]),
          oracle,
          'actual final Native module',
        )
        if (JSON.stringify(read(legacy)) !== JSON.stringify(oracle)) legacyMismatches++
      }
      await check({ focused: false, hovered: false, pressed: false })
      await target.focus()
      await check({ focused: true, hovered: false, pressed: false })
      await target.hover()
      await page.waitForFunction(() => document.querySelector('#subject').matches(':hover'), null, {
        timeout: 2000,
      })
      await check({ focused: true, hovered: true, pressed: false })
      await page.mouse.down()
      try {
        await page.waitForFunction(
          () => document.querySelector('#subject').matches(':active'),
          null,
          { timeout: 2000 },
        )
        await check({ focused: true, hovered: true, pressed: true })
      } finally {
        await page.mouse.up()
      }
      // Exercise the other owner separately: its real predicates must match,
      // not a synthetic dispatchEvent that never sets CSS :hover/:active.
      for (let stage = 0; stage < 4; stage++) {
        await page.mouse.move(600, 600)
        await page.evaluate(() => document.activeElement?.blur())
        const planned = page.locator('#planned')
        if (stage > 0) await planned.focus()
        if (stage > 1) await planned.hover()
        if (stage > 2) await page.mouse.down()
        try {
          const value = await planned.evaluate((element) => ({
            state: {
              focused: element.matches(':focus'),
              hovered: element.matches(':hover'),
              pressed: element.matches(':active'),
            },
            color: getComputedStyle(element).backgroundColor,
            padding: Number.parseFloat(getComputedStyle(element).paddingTop),
          }))
          assert.deepEqual(value.state, {
            focused: stage > 0,
            hovered: stage > 1,
            pressed: stage > 2,
          })
          const resolved = Object.assign({}, ...emittedResolve(classes, value.state))
          assert.equal(value.padding, resolved.paddingTop)
          assert.equal(
            value.color,
            `rgb(${[1, 3, 5].map((start) => Number.parseInt(resolved.backgroundColor.slice(start, start + 2), 16)).join(', ')})`,
          )
        } finally {
          if (stage > 2) await page.mouse.up()
        }
      }
    }
    assert.ok(
      legacyMismatches > 0,
      'the same oracle must expose the old string-order padding winner',
    )
  } finally {
    session.invalidate()
    await page.close()
  }
})

test('CSSOM alignment aliases preserve geometry and keep logical start distinct', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    for (const direction of ['ltr', 'rtl']) {
      const measure = async (value) => {
        await page.setContent(
          `<div id="owner" style="display:flex;flex-direction:row-reverse;direction:${direction};width:120px;height:60px;justify-content:${value}"><i style="width:20px;height:10px;flex:none"></i></div>`,
        )
        return page.locator('#owner').evaluate((element) => {
          const parent = element.getBoundingClientRect()
          const child = element.firstElementChild.getBoundingClientRect()
          return {
            value: getComputedStyle(element).justifyContent,
            offset: [child.x - parent.x, child.y - parent.y, child.width, child.height],
          }
        })
      }
      for (const [legacy, alias] of [
        ['flex-start', 'flow-start'],
        ['flex-end', 'flow-end'],
      ]) {
        const previous = await measure(legacy)
        assert.equal(canonicalAlignment(previous.value), alias)
        if (await page.evaluate((value) => CSS.supports('justify-content', value), alias)) {
          const current = await measure(alias)
          assert.equal(canonicalAlignment(current.value), alias)
          assert.deepEqual(current.offset, previous.offset)
        }
      }
      const flex = await measure('flex-start')
      const logical = await measure('start')
      assert.notDeepEqual(flex.offset, logical.offset)
      assert.notEqual(canonicalAlignment(flex.value), canonicalAlignment(logical.value))
    }
    for (const value of ['start', 'end', 'self-start', 'self-end', 'safe flex-start', 'center']) {
      assert.equal(canonicalAlignment(value), value)
    }
  } finally {
    await page.close()
  }
})

test('simple projected properties use upstream winners in actual static and generated Native output', {
  skip: !executablePath,
}, async () => {
  const fixtures = [
    ['opacity-75 opacity-50', 'opacity', 'opacity', true],
    ['z-20 z-10', 'z-index', 'zIndex', true],
    ['flex-row flex-col', 'flex-direction', 'flexDirection'],
    ['grow grow-0', 'flex-grow', 'flexGrow', true],
    ['shrink shrink-0', 'flex-shrink', 'flexShrink', true],
    ['items-center items-start', 'align-items', 'alignItems'],
    ['self-center self-start', 'align-self', 'alignSelf'],
    ['content-center content-end', 'align-content', 'alignContent'],
    ['justify-center justify-end', 'justify-content', 'justifyContent'],
    ['text-left text-right', 'text-align', 'textAlign'],
    ['uppercase lowercase', 'text-transform', 'textTransform'],
    ['italic not-italic', 'font-style', 'fontStyle'],
    ['flex hidden', 'display', 'display'],
    ['absolute relative', 'position', 'position'],
    ['overflow-hidden overflow-visible', 'overflow', 'overflow'],
    ['basis-8 basis-4', 'flex-basis', 'flexBasis', 'px'],
    ['flex-wrap flex-nowrap', 'flex-wrap', 'flexWrap'],
    ['backface-hidden backface-visible', 'backface-visibility', 'backfaceVisibility'],
    ['box-border box-content', 'box-sizing', 'boxSizing'],
    ['isolate isolation-auto', 'isolation', 'isolation'],
    ['pointer-events-none pointer-events-auto', 'pointer-events', 'pointerEvents'],
    ['static relative', 'position', 'position'],
    ['select-none select-text', 'user-select', 'userSelect'],
    ['align-top align-middle', 'vertical-align', 'verticalAlign'],
    ['underline no-underline', 'text-decoration-line', 'textDecorationLine'],
    ['decoration-solid decoration-dashed', 'text-decoration-style', 'textDecorationStyle'],
    [
      'decoration-[#ff0000] decoration-[#0000ff]',
      'text-decoration-color',
      'textDecorationColor',
      'color',
    ],
    [
      'focus:opacity-50 active:opacity-75 hover:focus:opacity-25 opacity-100',
      'opacity',
      'opacity',
      true,
    ],
  ]
  const names = [...new Set(['p-2', 'p-4', ...fixtures.flatMap(([classes]) => classes.split(' '))])]
  const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('simple.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context).code.replace(/^import .*$/gm, ''),
    { createClassResolver },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const [pair, property, nativeKey, numeric] of fixtures) {
      for (const classes of [`p-4 p-2 ${pair}`, `${pair.split(' ').reverse().join(' ')} p-2 p-4`]) {
        // Observe font style on a real Text owner, not an empty layout host.
        // This ordering probe does not certify parent text inheritance.
        const primitive =
          nativeKey === 'fontStyle' ||
          nativeKey === 'verticalAlign' ||
          nativeKey.startsWith('textDecoration')
            ? 'Text'
            : 'Pressable'
        const input = `import {${primitive}} from '@hozo/core';export const Target=()=> <${primitive} className="${classes}"/>`
        const web = compiler.prepareWebModule(input).emit(context)[0]
        const native = compiler.prepareNativeModule(input).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          Pressable: 'owner',
          Text: 'text',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        })
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Upstream</button><button id="compiled" class="hozo-0">Compiled</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          await page.mouse.move(600, 600)
          await page.evaluate(() => document.activeElement?.blur())
          const owner = page.locator(`#${id}`)
          const stages = pair.includes(':') ? 4 : 1
          for (let stage = 0; stage < stages; stage++) {
            if (stage === 1) await owner.focus()
            if (stage === 2) await owner.hover()
            if (stage === 3) await page.mouse.down()
            try {
              const actual = await owner.evaluate(
                (element, property) => ({
                  value: getComputedStyle(element).getPropertyValue(property),
                  padding: getComputedStyle(element).paddingTop,
                  state: {
                    focused: element.matches(':focus'),
                    hovered: element.matches(':hover'),
                    pressed: element.matches(':active'),
                  },
                }),
                property,
              )
              const selected =
                typeof props.style === 'function' ? props.style(actual.state) : props.style
              // Text properties belong to the generated label frame, not
              // the Pressable host. Read the prop actually wired to it.
              const label =
                typeof props.hozoTextStyle === 'function'
                  ? props.hozoTextStyle(actual.state)
                  : props.hozoTextStyle
              const hostStyle = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
              const staticStyle =
                nativeKey === 'textAlign' || nativeKey === 'textTransform'
                  ? Object.assign({}, ...[label].flat(Infinity).filter(Boolean))
                  : hostStyle
              const dynamic = Object.assign({}, ...resolve(classes, actual.state))
              const expected =
                numeric === 'px'
                  ? Number.parseFloat(actual.value)
                  : numeric === 'color'
                    ? `#${actual.value
                        .match(/\d+/g)
                        .map((n) => Number(n).toString(16).padStart(2, '0'))
                        .join('')}`
                    : numeric
                      ? Number(actual.value)
                      : actual.value
              const comparable = [
                'alignItems',
                'alignSelf',
                'alignContent',
                'justifyContent',
              ].includes(nativeKey)
                ? canonicalAlignment
                : (value) => value
              assert.equal(
                comparable(staticStyle[nativeKey]),
                comparable(expected),
                `${id}/${classes}/${stage}/static`,
              )
              assert.equal(
                comparable(dynamic[nativeKey]),
                comparable(expected),
                `${id}/${classes}/${stage}/dynamic`,
              )
              assert.equal(actual.padding, '16px')
              assert.equal(hostStyle.paddingTop, 16)
              assert.equal(dynamic.paddingTop, 16)
              observations++
            } finally {
              if (stage === 3) await page.mouse.up()
            }
          }
        }
      }
    }
    assert.equal(observations, 124)
  } finally {
    await page.close()
  }
})

test(
  'positive ARIA owner ordering matches real Tailwind with independent disabled sources and hover facts',
  {
    skip: !executablePath,
  },
  () => checkAriaOwnerOrdering(false),
)

test(
  'negated ARIA owner ordering matches real Tailwind without replacing missing drivers with false',
  {
    skip: !executablePath,
  },
  () => checkAriaOwnerOrdering(true),
)

async function checkAriaOwnerOrdering(includeNegated) {
  const names = [
    'p-4',
    'p-2',
    'aria-busy:p-3',
    'aria-checked:p-5',
    'aria-expanded:p-7',
    'aria-selected:p-8',
    'aria-[invalid=true]:p-9',
    'disabled:p-10',
    'aria-disabled:p-11',
    'hover:aria-disabled:p-13',
    'disabled:aria-disabled:p-15',
    'hover:aria-selected:p-12',
    'aria-checked:aria-selected:p-14',
  ]
  if (includeNegated)
    names.push(
      'not-aria-busy:p-3',
      'not-aria-checked:p-5',
      'not-aria-expanded:p-7',
      'not-aria-selected:p-8',
      'not-aria-[invalid=true]:p-9',
      'not-aria-disabled:p-11',
      'hover:not-aria-selected:p-12',
      'aria-checked:not-aria-selected:p-14',
      'not-aria-checked:not-aria-selected:p-16',
      'disabled:not-aria-selected:p-17',
    )
  const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const legacy = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('aria.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context).code.replace(/^import .*$/gm, ''),
    {
      createClassResolver,
    },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  let oldMismatches = 0
  try {
    for (const classes of [names.join(' '), names.toReversed().join(' ')]) {
      const source = `import {Button} from '@hozo/core';export const A=({state,invalid,blocked})=><Button accessibilityState={state} aria-invalid={invalid} disabled={blocked} className="${classes}"/>`
      const web = compiler.prepareWebModule(source).emit(context)[0]
      const old = compiler.prepareWebModule(source).emit(legacy)[0]
      const native = compiler.prepareNativeModule(source).emit(context).components[0]
      const dynamicSource = source
        .replace('({state,invalid,blocked})', '({state,invalid,blocked,runtimeNames})')
        .replace(`className="${classes}"`, 'className={runtimeNames}')
      const dynamicNative = compiler.prepareNativeModule(dynamicSource).emit(context).components[0]
      assert.ok(
        dynamicNative.diagnostics.every((d) => d.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
      )
      assert.match(
        web.jsx,
        /^<button(?:\s|>)/,
        'probe the actual compiled host, not a fabricated tag',
      )
      assert.equal(native.diagnostics.length, 0)
      const webOwners = [web, old].map((output) =>
        evaluate(`module.exports=(state,invalid,blocked)=>(${output.jsx})`, {
          h: (_type, props) => props,
        }),
      )
      const render = evaluate(
        `const hozoStyles=${native.styles};module.exports=(state,invalid,blocked)=>(${native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      const renderDynamic = evaluate(
        `const hozoStyles=${dynamicNative.styles};module.exports=(state,invalid,blocked,runtimeNames)=>(${dynamicNative.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          hozoClasses: resolve,
          h: (_type, props) => props,
        },
      )
      await page.setContent(
        `<!doctype html><style>${sheet}\n${web.css}\n${old.css.replaceAll('hozo-0', 'legacy')}</style><button id="reference" class="${classes}">Reference</button><button id="compiled" class="hozo-0">Compiled</button><button id="old" class="legacy">Legacy</button>`,
      )
      for (let mask = 0; mask < (includeNegated ? 67 : 64); mask++) {
        const state =
          mask === 64
            ? undefined
            : mask === 65
              ? null
              : mask === 66
                ? { checked: 'mixed', selected: false, disabled: false }
                : Object.fromEntries(
                    ['busy', 'checked', 'expanded', 'selected', 'disabled'].map((key, bit) => [
                      key,
                      Boolean(mask & (1 << (key === 'disabled' ? 5 : bit))),
                    ]),
                  )
        const invalid = mask < 64 ? Boolean(mask & 16) : 'grammar'
        const blocked = mask < 64 && mask % 3 === 0
        const unavailable = blocked || state?.disabled === true
        const props = render(state, invalid, blocked)
        const dynamicProps = renderDynamic(state, invalid, blocked, classes)
        const projected = webOwners.map((render) => render(state, invalid, blocked))
        assert.equal(Boolean(projected[0]['aria-disabled']), unavailable)
        assert.equal(Boolean(projected[0].disabled), unavailable)
        assert.equal(Boolean(props.disabled), unavailable)
        await page.evaluate(
          ({ state, invalid, unavailable, projected }) => {
            for (const element of document.querySelectorAll('button')) {
              const attributes =
                element.id === 'reference'
                  ? {
                      ...Object.fromEntries(
                        Object.entries(state ?? {}).map(([key, value]) => [`aria-${key}`, value]),
                      ),
                      'aria-invalid': invalid,
                      'aria-disabled': unavailable,
                      disabled: unavailable,
                    }
                  : projected[element.id === 'compiled' ? 0 : 1]
              for (const name of [
                'aria-busy',
                'aria-checked',
                'aria-disabled',
                'aria-expanded',
                'aria-selected',
                'aria-invalid',
                'data-hozo-disabled',
              ]) {
                const value = attributes[name]
                if (value == null) element.removeAttribute(name)
                else element.setAttribute(name, String(value))
              }
              element.disabled = Boolean(attributes.disabled)
            }
          },
          {
            state,
            invalid,
            unavailable,
            projected,
          },
        )
        await page.mouse.move(700, 500)
        for (const id of ['reference', 'compiled', 'old']) {
          const owner = page.locator(`#${id}`)
          // Hover some selected states but not all; the fact is read back
          // from the browser, including on a disabled button.
          if (mask % 2 === 0) await owner.hover({ force: true })
          const observed = await owner.evaluate((element) => ({
            padding: Number.parseFloat(getComputedStyle(element).paddingTop),
            hovered: element.matches(':hover'),
          }))
          const facts = {
            ...Object.fromEntries(
              Object.entries(state ?? {}).map(([key, value]) => [`aria-${key}`, value === true]),
            ),
            'aria-invalid': String(invalid) === 'true',
            disabled: unavailable,
            'aria-disabled': unavailable,
            hovered: observed.hovered,
          }
          const style = typeof props.style === 'function' ? props.style(facts) : props.style
          const selected = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
          const dynamic = Object.assign(
            {},
            ...[
              typeof dynamicProps.style === 'function'
                ? dynamicProps.style(facts)
                : dynamicProps.style,
            ]
              .flat(Infinity)
              .filter(Boolean),
          )
          if (id === 'old') oldMismatches += Number(observed.padding !== selected.paddingTop)
          else {
            assert.equal(selected.paddingTop, observed.padding, `${id}/${mask}/static`)
            assert.equal(dynamic.paddingTop, observed.padding, `${id}/${mask}/generated`)
            observations++
          }
          await page.mouse.move(700, 500)
        }
      }
    }
    assert.equal(observations, includeNegated ? 268 : 256)
    assert.ok(oldMismatches > 0, 'the independent oracle detects legacy whole-input string order')
  } finally {
    await page.close()
  }
}

test('font-weight registration and custom theme values agree in actual Web, Native and generated outputs', {
  skip: !executablePath,
}, async () => {
  const names = [
    'font-bold',
    'font-normal',
    'p-4',
    'p-2',
    'focus:font-normal',
    'active:font-bold',
    'hover:focus:font-normal',
  ]
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const [bold, normal] of [
      [700, 400],
      [900, 300],
    ]) {
      const css = `@theme {--spacing:.25rem;--app-bold:${bold};--font-weight-bold:var(--app-bold);--font-weight-normal:${normal};} @tailwind utilities;`
      const theme = await loadTheme(css, tailwindPackageDir())
      const themedCompiler = createCompiler(theme)
      const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
      const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
      const cache = openCandidateCache()
      cache.scanFile('fonts.ts', JSON.stringify(names.join(' ')), 0)
      const resolver = evaluate(
        cache.renderNativeModulePlan(context, theme).code.replace(/^import .*$/gm, ''),
        { createClassResolver },
      ).hozoClasses
      const sheet = (await compile(css)).build(names)
      for (const classes of [names.join(' '), [...names].reverse().join(' ')]) {
        const input = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
        const web = themedCompiler.prepareWebModule(input).emit(context)[0]
        const native = themedCompiler.prepareNativeModule(input).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          HozoPressable: 'owner',
          Pressable: 'owner',
          h: (_type, props) => props,
        })
        assert.equal(typeof props.hozoTextStyle, 'function')
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Label</button><button id="compiled" class="hozo-0">Label</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          await page.mouse.move(600, 600)
          await page.evaluate(() => document.activeElement?.blur())
          const owner = page.locator(`#${id}`)
          for (let stage = 0; stage < 4; stage++) {
            if (stage === 1) await owner.focus()
            if (stage === 2) await owner.hover()
            if (stage === 3) await page.mouse.down()
            try {
              const actual = await owner.evaluate((element) => ({
                weight: getComputedStyle(element).fontWeight,
                padding: getComputedStyle(element).paddingTop,
                state: {
                  focused: element.matches(':focus'),
                  hovered: element.matches(':hover'),
                  pressed: element.matches(':active'),
                },
              }))
              const label = Object.assign(
                {},
                ...[props.hozoTextStyle(actual.state)].flat(Infinity).filter(Boolean),
              )
              const dynamic = Object.assign({}, ...resolver(classes, actual.state))
              assert.equal(label.fontWeight, actual.weight, `${bold}/${id}/${stage}/static`)
              assert.equal(dynamic.fontWeight, actual.weight, `${bold}/${id}/${stage}/dynamic`)
              assert.equal(actual.padding, '16px')
              assert.equal(dynamic.paddingTop, 16)
              observations++
            } finally {
              if (stage === 3) await page.mouse.up()
            }
          }
        }
      }
    }
    assert.equal(observations, 32)
  } finally {
    await page.close()
  }
})

test('absolute text metrics preserve upstream defaults and explicit leading across all owner-state combinations', {
  skip: !executablePath,
}, async () => {
  const cases = [
    'text-xl text-lg',
    'text-lg leading-6',
    'text-lg hover:text-xl focus:leading-6 active:text-2xl',
    'text-lg focus:leading-6 active:leading-8 hover:focus:text-3xl',
    'text-lg tracking-[2px] tracking-[1px]',
  ]
  const names = [...new Set([...cases.flatMap((value) => value.split(' ')), 'p-4', 'p-2'])]
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const theme = await loadTheme(css, tailwindPackageDir())
  const compiler = createCompiler(theme)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('metrics.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context, theme).code.replace(/^import .*$/gm, ''),
    { createClassResolver, hozoTextMetricStyles },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const value of cases)
      for (const classes of [
        `${value} p-4 p-2`,
        `p-2 p-4 ${value.split(' ').reverse().join(' ')}`,
      ]) {
        const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`
        const web = compiler.prepareWebModule(source).emit(context)[0]
        const native = compiler.prepareNativeModule(source).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          Pressable: 'owner',
          HozoPressable: 'owner',
          Text: 'label',
          HozoText: 'label',
          h: (_type, props) => props,
        })
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Label</button><button id="compiled" class="hozo-0">Label</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          const owner = page.locator(`#${id}`)
          for (const focused of [false, true])
            for (const hovered of [false, true])
              for (const pressed of [false, true]) {
                await page.mouse.up()
                await page.evaluate(() => document.activeElement?.blur())
                if (focused) await owner.focus()
                if (hovered || pressed) await owner.hover()
                else await page.mouse.move(600, 600)
                if (pressed) await page.mouse.down()
                try {
                  const actual = await owner.evaluate((element) => ({
                    size: parseFloat(getComputedStyle(element).fontSize),
                    line: parseFloat(getComputedStyle(element).lineHeight),
                    tracking: getComputedStyle(element).letterSpacing,
                    state: {
                      focused: element.matches(':focus'),
                      hovered: element.matches(':hover'),
                      pressed: element.matches(':active'),
                    },
                  }))
                  const label =
                    typeof props.hozoTextStyle === 'function'
                      ? props.hozoTextStyle(actual.state)
                      : props.hozoTextStyle
                  const selected = Object.assign({}, ...[label].flat(Infinity).filter(Boolean))
                  const dynamic = Object.assign({}, ...resolve(classes, actual.state))
                  for (const [key, expected] of [
                    ['fontSize', actual.size],
                    ['lineHeight', actual.line],
                  ]) {
                    assert.equal(
                      selected[key],
                      expected,
                      `${id}/${classes}/${JSON.stringify(actual.state)}/static/${key}`,
                    )
                    assert.equal(
                      dynamic[key],
                      expected,
                      `${id}/${classes}/${JSON.stringify(actual.state)}/dynamic/${key}`,
                    )
                  }
                  if (actual.tracking !== 'normal') {
                    assert.equal(selected.letterSpacing, parseFloat(actual.tracking))
                    assert.equal(dynamic.letterSpacing, parseFloat(actual.tracking))
                  }
                  observations++
                } finally {
                  await page.mouse.up()
                }
              }
        }
      }
    assert.equal(observations, 160)
  } finally {
    await page.close()
  }
})

test('the canonical-order reference has independent browser winners under reversed classes and RTL', {
  skip: !executablePath,
}, async () => {
  const { css } = await prepareOrderReference()
  const page = await browser.newPage()
  try {
    for (const entry of orderCases)
      for (const dir of ['ltr', 'rtl'])
        for (const classes of [entry.classes, entry.classes.split(' ').reverse().join(' ')]) {
          await page.setContent(
            `<html dir="${dir}"><style>${css}\nbutton { appearance:none; border:0; padding:0; }</style><button class="${classes}">Label</button></html>`,
          )
          if (entry.state) await page.locator('button').hover()
          if (entry.state === 'active') await page.mouse.down()
          const actual = await page.locator('button').evaluate((node, keys) => {
            const style = getComputedStyle(node)
            return Object.fromEntries(keys.map((key) => [key, style[key]]))
          }, Object.keys(entry.expected))
          if (entry.state === 'active') await page.mouse.up()
          assert.deepEqual(actual, entry.expected, `${entry.id}/${dir}/${classes}`)
        }
  } finally {
    await page.close()
  }
})

test('canonical-order baseline records current Hozo divergences without claiming they conform', {
  skip: !executablePath,
}, async () => {
  const baseline = await prepareOrderSubjects()
  const expectedPage = await browser.newPage(),
    actualPage = await browser.newPage()
  const cells = []
  let measurementValid = false
  let failure
  let stage = 'start'
  const capturedAt = new Date().toISOString()
  try {
    for (const subject of baseline.subjects)
      for (const dir of ['ltr', 'rtl']) {
        stage = `${subject.id}/${dir}/${subject.classes}`
        await expectedPage.setContent(
          `<html dir="${dir}"><style>${baseline.reference.css}</style><button class="${subject.classes}">Label</button></html>`,
        )
        const html = renderToStaticMarkup(
          evaluate(`module.exports=(${subject.web.jsx})`, { h: createElement }),
        )
        const variants = [
          ['staticWeb', subject.web.css, html, '[data-testid="order-probe"]'],
          [
            'defaultCandidates',
            baseline.defaultCss,
            `<button class="${subject.classes}">Label</button>`,
            'button',
          ],
          [
            'projectOrderedCandidates',
            baseline.orderedCss,
            `<button class="${subject.classes}">Label</button>`,
            'button',
          ],
        ]
        const keys = Object.keys(subject.expected)
        for (const [route, css, markup, selector] of variants) {
          await actualPage.setContent(`<html dir="${dir}"><style>${css}</style>${markup}</html>`)
          if (subject.state) {
            await expectedPage.locator('button').hover()
            await actualPage.locator(selector).hover()
          }
          if (subject.state === 'active') {
            await expectedPage.mouse.down()
            await actualPage.mouse.down()
          }
          const read = (page, target) =>
            page.locator(target).evaluate((node, keys) => {
              const style = getComputedStyle(node)
              return Object.fromEntries(keys.map((key) => [key, style[key]]))
            }, keys)
          const expected = await read(expectedPage, 'button')
          assert.deepEqual(expected, subject.expected, `oracle ${subject.id}`)
          const actual = await read(actualPage, selector)
          if (subject.state === 'active') {
            await expectedPage.mouse.up()
            await actualPage.mouse.up()
          }
          cells.push({
            id: subject.id,
            classes: subject.classes,
            dir,
            route,
            expected,
            actual,
            diagnostics: subject.web.diagnostics,
          })
        }
        for (const [route, raw] of [
          ['staticNative', dir === 'rtl' ? subject.rtl.selected : subject.native.selected],
          ['nativeCandidates', dir === 'rtl' ? subject.rtl.fallback : subject.fallback],
        ])
          cells.push({
            id: subject.id,
            classes: subject.classes,
            dir,
            route,
            expected: subject.expected,
            actual: projectOrderNative(raw, keys, dir),
            raw,
            diagnostics: subject.native.diagnostics,
          })
      }
    assert.equal(cells.length, orderCases.length * 2 * 2 * 5)
    measurementValid = true
  } catch (error) {
    failure = { stage, message: String(error) }
    throw error
  } finally {
    const destination = fileURLToPath(
      new URL('../../../artifacts/tailwind-order/browser-baseline.json', import.meta.url),
    )
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(
      destination,
      `${JSON.stringify({ schema: 1, capturedAt, provenance: baseline.provenance, reference: baseline.reference.snapshot, measurementValid, failure, note: 'Selected Native scalar projection, not device pixels/AT. Mismatches are observations, not conformance passes.', summary: summarizeOrderCells(cells), cells }, null, 2)}\n`,
    )
    await expectedPage.close()
    await actualPage.close()
  }
})

test('Web candidate container branches preserve Tailwind cascade across breakpoints', {
  skip: !executablePath,
}, async () => {
  const cases = [
    'container',
    'container max-w-5xl',
    'container md:max-w-none',
    'container lg:max-w-xs',
    'container w-auto',
  ]
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const names = [...new Set(cases.flatMap((value) => value.split(' ')))]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const cache = openCandidateCache()
  cache.scanFile('container-candidates.ts', JSON.stringify(names.join(' ')), 1)
  const upstreamOrder = prepared.classOrder(cache.candidates())
  const sheets = [
    (await compile(css)).build(names),
    cache.renderCss(),
    cache.renderCss(undefined, upstreamOrder),
    cache.renderCss(undefined, upstreamOrder.toReversed()),
  ]
  const page = await browser.newPage()
  let reversedDifferences = 0
  try {
    for (const width of [500, 700, 900, 1100, 1400, 1700]) {
      await page.setViewportSize({ width, height: 300 })
      const orders = cases.flatMap((value) => [value, value.split(' ').toReversed().join(' ')])
      for (const marker of ['', 'hozo-candidate-owner ']) {
        const read = async (sheet) => {
          await page.setContent(
            `<!doctype html><style>body { margin: 0; }${sheet}</style>${orders.map((value) => `<main class="${marker}${value}"></main>`).join('')}`,
          )
          return page.locator('main').evaluateAll((nodes) =>
            nodes.map((node) => {
              const { width, maxWidth } = getComputedStyle(node)
              return [width, maxWidth]
            }),
          )
        }
        const expected = await read(sheets[0])
        assert.deepEqual(await read(sheets[1]), expected, `built-in/${width}/${marker}`)
        assert.deepEqual(await read(sheets[2]), expected, `captured/${width}/${marker}`)
        const reversed = await read(sheets[3])
        reversedDifferences += reversed.filter(
          ([value, max], index) => value !== expected[index][0] || max !== expected[index][1],
        ).length
      }
    }
    assert.ok(reversedDifferences > 0, 'the same rules emitted in reverse order change the cascade')
  } finally {
    await page.close()
  }
})

test('Web leaves authored conjunction specificity to the browser', {
  skip: !executablePath,
}, async () => {
  const classes = 'hover:focus:p-2 active:p-4 columns-(--layout)'
  const result = compiler
    .prepareWebModule(
      `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`,
    )
    .emit(await authoredOwnerContext(classes))[0]
  assert.match(result.css, /:hover:focus[\s\S]*:active/)
  const html = renderToStaticMarkup(
    evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
  )
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  try {
    await page.setContent(`<style>${result.css}</style>${html}`)
    await oracle.setContent(`<style>${css}</style><button class="${classes}">Target</button>`)
    for (const target of [page, oracle]) {
      const button = target.getByRole('button', { name: 'Target' })
      await button.hover()
      await target.mouse.down()
      const state = await button.evaluate((el) => ({
        overlap: el.matches(':hover:focus:active'),
        padding: getComputedStyle(el).paddingTop,
      }))
      assert.deepEqual(state, { overlap: true, padding: '8px' })
      await target.mouse.up()
    }
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('authored output keeps repeated owner guards in CSS order', {
  skip: !executablePath,
}, async () => {
  const classes = 'hover:p-2 active:p-4 hover:p-6 columns-(--layout)'
  const result = compiler
    .prepareWebModule(
      `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`,
    )
    .emit(await authoredOwnerContext(classes))[0]
  const html = renderToStaticMarkup(
    evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
  )
  // This is the explicit authored control, not the classified default.
  const reference =
    'button:hover {padding:8px} button:active {padding:16px} button:hover {padding:24px}'
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const [css, markup] of [
      [reference, '<button>Target</button>'],
      [result.css, html],
    ]) {
      await page.setContent(`<style>${css}</style>${markup}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'button',
      })
      assert.ok(nodeId)
      for (const [forcedPseudoClasses, padding] of [
        [['active'], '16px'],
        [['hover'], '24px'],
        [['hover', 'active'], '24px'],
      ]) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
        assert.equal(
          await page.locator('button').evaluate((el) => getComputedStyle(el).paddingTop),
          padding,
          forcedPseudoClasses.join(':'),
        )
      }
    }
  } finally {
    await page.close()
  }
})

test('authored gap and logical edge writes retain repeated owner runs', {
  skip: !executablePath,
}, async () => {
  for (const [classes, property, css, resting] of [
    ['hover:p-2 active:p-4 hover:p-6 hover:gap-2', 'paddingTop', 'padding-top', '1px'],
    ['hover:gap-x-2 active:gap-x-4 hover:gap-x-6', 'columnGap', 'column-gap', 'normal'],
    ['hover:px-2 active:px-4 hover:ps-6', 'paddingInlineStart', 'padding-inline-start', '6px'],
  ]) {
    await assertRepeatedOwnerRegisters({
      classes: `${classes} columns-(--layout)`,
      reference: `
        button { ${css}: ${resting}; }
        button:hover { ${css}: 8px; }
        button:active { ${css}: 16px; }
        button:hover { ${css}: 24px; }
      `,
      property,
      values: ['16px', '24px', '24px', resting],
    })
  }
})

test('an unknown owner write keeps repeated metric runs without losing explicit leading', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}
    @tailwind utilities;
    @theme { --color-brand: #123456; }
    @utility bg-brand { background-color: #abcdef; }
    @utility text-xl { font-size: 20px; }
    @utility text-2xl { font-size: 24px; }
    @utility leading-8 { line-height: 32px; }`
  const theme = await loadTheme(css, tailwindPackageDir())
  const local = createCompiler(theme)
  const cases = [
    'hover:text-lg active:text-2xl hover:text-xl',
    'hover:leading-6 active:leading-8 hover:leading-7 hover:text-xl',
    'active:leading-8 hover:text-xl active:leading-6',
    'active:leading-8 hover:text-xl hover:focus:leading-6',
  ]
  const names = [
    ...new Set(cases.flatMap((classes) => classes.split(' '))),
    'text-sm',
    'bg-brand',
    'hover:mt-2',
    'hover:bg-brand',
  ]
  const { snapshot } = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const cache = openCandidateCache()
  cache.scanFile('metric-fallback.ts', JSON.stringify(names.join(' ')), 1)
  const candidates = cache.renderNativeModulePlan(final, theme)
  assert.equal(candidates.ordering.ranks['bg-brand'], undefined)
  assert.equal(candidates.ordering.ranks['hover:text-xl'], undefined)
  assert.equal(
    candidates.entries.find((entry) => entry.candidate === 'bg-brand').groups[0].writes[0].reason,
    'ambiguous-property-owner',
  )
  const candidateCode = candidates.code.replace(/^import .*$/gm, '')
  const resolve = evaluate(candidateCode, {
    hozoTextMetricStyles,
    // Exercise Native specificity on its own. Leaving the compact ranks in
    // this control also activates the production assessed-run projection.
    createClassResolver: (plan) =>
      createClassResolver(plan.styles, plan.unsupported, plan.compose, plan.states, plan.ambient),
  }).hozoClasses
  const metrics = (style) => {
    const { fontSize, lineHeight } = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    return [fontSize, lineHeight]
  }
  assert.deepEqual(
    metrics(
      resolve(`text-sm ${cases[0]} bg-brand`, { hovered: true, pressed: true, focused: false }),
    ),
    [20, 28],
  )
  // Ambiguous active and hover metric owners pin the authored boundary.
  // The independent CSS checks the declarations Hozo can project.
  const rules = {
    'hover:text-lg': ':hover { font-size: 18px; line-height: var(--tw-leading, 28px) }',
    'hover:text-xl': ':hover { font-size: 20px; line-height: var(--tw-leading, 28px) }',
    'active:text-2xl': ':active { font-size: 24px; line-height: var(--tw-leading, 32px) }',
    'hover:leading-6': ':hover { --tw-leading: 24px; line-height: 24px }',
    'hover:leading-7': ':hover { --tw-leading: 28px; line-height: 28px }',
    'active:leading-6': ':active { --tw-leading: 24px; line-height: 24px }',
    'active:leading-8': ':active { --tw-leading: 32px; line-height: 32px }',
    'hover:focus:leading-6': ':hover:focus { --tw-leading: 24px; line-height: 24px }',
  }
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const authored of cases)
      for (const classes of [authored, authored.split(' ').toReversed().join(' ')]) {
        const input = `text-sm ${classes} bg-brand`
        const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${input}"/>`
        const native = local.prepareNativeModule(source).emit(final).components[0]
        const { hozoTextStyle } = evaluate(
          `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
          { HozoPressable: 'host', Pressable: 'host', h: (_type, props) => props },
        )
        const web = local.prepareWebModule(source).emit(final)[0]
        const { className } = evaluate(`module.exports=(${web.jsx})`, {
          h: (_type, props) => props,
        })
        const reference = [
          '#oracle { font-size: 14px; line-height: var(--tw-leading, 20px) }',
          ...classes.split(' ').map((name) => `#oracle${rules[name]}`),
        ].join('\n')
        await page.setContent(`<!doctype html><style>${reference}\n${web.css}</style>
          <button id="oracle">Label</button><button id="compiled" class="${className}">Label</button>`)
        const { root } = await cdp.send('DOM.getDocument')
        const ids = await Promise.all(
          ['#oracle', '#compiled'].map((selector) =>
            cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }),
          ),
        )
        for (const hovered of [false, true])
          for (const pressed of [false, true])
            for (const focused of [false, true]) {
              const state = { hovered, pressed, focused }
              const forcedPseudoClasses = [
                hovered && 'hover',
                pressed && 'active',
                focused && 'focus',
              ].filter(Boolean)
              for (const { nodeId } of ids)
                await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
              const [expected, compiled] = await page.locator('button').evaluateAll((buttons) =>
                buttons.map((button) => {
                  const style = getComputedStyle(button)
                  return [parseFloat(style.fontSize), parseFloat(style.lineHeight)]
                }),
              )
              const label = `${input}/${forcedPseudoClasses.join(':')}`
              assert.deepEqual(compiled, expected, `${label}/web`)
              assert.deepEqual(metrics(hozoTextStyle(state)), expected, `${label}/native`)
              assert.deepEqual(
                metrics(resolve(input, state)),
                expected,
                `${label}/specificity-only`,
              )
            }
      }
  } finally {
    await page.close()
  }
})

test('authored font weight and family retain repeated owner runs in Web and Native', {
  skip: !executablePath,
}, async () => {
  // Compare the explicit authored path to independent declaration order.
  const cases = [
    ['hover:font-bold', ':hover', 'font-weight:700'],
    ['active:font-medium', ':active', 'font-weight:500'],
    ['hover:font-normal', ':hover', 'font-weight:400'],
    ['hover:font-sans', ':hover', 'font-family: Arial'],
    ['active:font-mono', ':active', 'font-family: Courier'],
    ['hover:font-serif', ':hover', 'font-family: Georgia'],
  ]
  const local = createCompiler({
    colors: [],
    fontFamilies: [
      { name: 'sans', web: 'Arial', value: 'Arial' },
      { name: 'mono', web: 'Courier', value: 'Courier' },
      { name: 'serif', web: 'Georgia', value: 'Georgia' },
    ],
  })
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const input of [cases, cases.toReversed()]) {
      const classes = input.map(([name]) => name).join(' ')
      const source = `import { Pressable,Text } from '@hozo/core';const el=<Pressable><Text className="${classes} columns-(--layout)"/></Pressable>`
      const authored = await authoredOwnerContext(`${classes} columns-(--layout)`)
      const web = local.prepareWebModule(source).emit(authored)[0]
      const native = local.prepareNativeModule(source).emit(authored).components[0]
      const getChild = (_type, props, child) => child ?? props
      const { className } = evaluate(`module.exports=(${web.jsx})`, { h: getChild })
      const { style: selectStyle } = evaluate(
        `const hozoStyles=${native.styles}; module.exports=(${native.jsx})`,
        { HozoPressable: 'host', HozoText: 'text', h: getChild },
      )
      await page.setContent(`<!doctype html><style>
        ${input.map(([, guard, declaration]) => `#oracle${guard}{${declaration}}`).join('\n')}
        ${web.css}
        </style><button id="oracle"></button><button id="compiled" class="${className}"></button>`)
      const { root } = await cdp.send('DOM.getDocument')
      const ids = []
      for (const selector of ['#oracle', '#compiled'])
        ids.push((await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).nodeId)
      for (const [hovered, pressed] of [
        [true, true],
        [true, false],
        [false, true],
      ]) {
        const forcedPseudoClasses = [hovered && 'hover', pressed && 'active'].filter(Boolean)
        for (const nodeId of ids)
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
        const [expected, actual] = await page.locator('button').evaluateAll((nodes) =>
          nodes.map((node) => {
            const { fontFamily, fontWeight } = getComputedStyle(node)
            return [fontFamily, fontWeight]
          }),
        )
        const style = Object.assign({}, ...selectStyle({ hovered, pressed }).filter(Boolean))
        assert.deepEqual(actual, expected, classes)
        assert.deepEqual([style.fontFamily, style.fontWeight], expected, classes)
      }
    }
  } finally {
    await page.close()
  }
})
