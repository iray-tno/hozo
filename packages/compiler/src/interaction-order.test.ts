import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { createCompiler, openCandidateCache } from './index.ts'

const variants = [
  'hover:bg-[#111111]',
  'focus:bg-[#222222]',
  'focus-visible:bg-[#333333]',
  'active:bg-[#444444]',
]
const compiler = createCompiler()
const flatten = (style) => Object.assign({}, ...style.flat(Infinity).filter(Boolean))
function props(source: string, inherited = false, errors: string[] = []) {
  const component = compiler.compileNativeModule(source, undefined, undefined, {
    textInheritance: inherited,
  }).components[0]
  assert.deepEqual(
    component.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => entry.code),
    errors,
    JSON.stringify(component.diagnostics),
  )
  const module = { exports: {} }
  runInNewContext(
    transformSync(`module.exports = ${component.jsx}`, {
      loader: 'tsx',
      jsxFactory: 'h',
      format: 'cjs',
    }).code,
    {
      module,
      children: null,
      HozoPressable: 'owner',
      HozoInheritedPressable: 'owner',
      HozoChip: 'owner',
      hozoFilterStyles,
      remove: () => {},
      h: (_type, value) => value,
      hozoStyles: runInNewContext(`(${component.styles})`),
    },
  )
  return module.exports as {
    style: (state: object) => object[]
    hozoRemoveStyle: (state: object) => object[]
  }
}
function permutations<T>(values: T[]): T[][] {
  return values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
        permutations(values.filter((_, position) => position !== index)).map((rest) => [
          value,
          ...rest,
        ]),
      )
}

test('all owner-state permutations agree in static and generated candidate routes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-interaction-order-'))
  try {
    const cache = openCandidateCache(path.join(directory, 'cache.json'))
    cache.scanFile('classes.ts', JSON.stringify(variants.join(' ')), 1)
    const module = { exports: {} }
    new Function(
      'require',
      'module',
      transformSync(cache.renderNativeModule(), { format: 'cjs' }).code,
    )(() => ({ createClassResolver }), module)
    const resolve = (module.exports as { hozoClasses: ReturnType<typeof createClassResolver> })
      .hozoClasses
    for (const permutation of permutations(variants)) {
      const classes = `bg-[#ffffff] text-[#000000] ${permutation.join(' ')} transition-colors`
      const source = `import {Button} from '@hozo/core';export const Scene=({children})=><Button className="${classes}">{children}</Button>`
      const controls = [props(source), props(source, true)]
      for (let bits = 0; bits < 16; bits++) {
        const state = {
          hovered: !!(bits & 1),
          focused: !!(bits & 2),
          focusVisible: !!(bits & 4),
          pressed: !!(bits & 8),
        }
        const expected = state.pressed
          ? '#444444'
          : state.focusVisible
            ? '#333333'
            : state.focused
              ? '#222222'
              : state.hovered
                ? '#111111'
                : '#ffffff'
        for (const control of controls)
          assert.equal(flatten(control.style(state)).backgroundColor, expected)
        assert.equal(
          flatten([{ backgroundColor: '#ffffff' }, ...resolve(permutation.join(' '), state)])
            .backgroundColor,
          expected,
        )
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a more specific conjunction wins over a later-ranked single state', () => {
  const source = `import {Button} from '@hozo/core';export const Scene=({children})=><Button className="text-black hover:focus:bg-[#112233] active:bg-[#445566] transition-colors">{children}</Button>`
  assert.equal(
    flatten(props(source).style({ hovered: true, focused: true, pressed: true })).backgroundColor,
    '#112233',
  )
})

test('a whole filter reset does not reverse overlapping hover and active rules', () => {
  for (const classes of ['active:p-2 hover:p-4 filter-none', 'hover:p-4 active:p-2 filter-none']) {
    const source = `import {Pressable} from '@hozo/core';const el=<Pressable className="${classes}"/>`
    const [web] = compiler.compile(source)
    assert.match(web!.css, /:hover[\s\S]*:active/)
    assert.equal(flatten(props(source).style({ pressed: true, hovered: true })).paddingTop, 8)
  }
})

test('a Tailwind barrier keeps Native specificity and lets CSS arbitrate independently', () => {
  const source = `import {Button} from '@hozo/core';export const Scene=({children})=><Button className="hover:focus:p-2 active:p-4 columns-(--layout)">{children}</Button>`
  const [web] = compiler.compile(source)
  // The unassessed utility leaves the conjunction before active in CSS.
  // Its extra selector weight, not the source order, makes it win in Chrome.
  assert.match(web!.css, /:hover:focus[\s\S]*:active/)
  const { style } = props(source, false, ['WEB_ONLY_PROPERTY_ON_NATIVE'])
  for (const hovered of [false, true]) {
    for (const focused of [false, true]) {
      for (const pressed of [false, true]) {
        const selected = flatten(style({ hovered, focused, pressed }))
        assert.equal(selected.paddingTop, hovered && focused ? 8 : pressed ? 16 : undefined)
      }
    }
  }
})

test('authored scalar state writes do not move back into an earlier visit to the guard', () => {
  for (const [classes, key, hover, press, both] of [
    ['hover:p-2 active:p-4 hover:p-6', 'paddingTop', 24, 16, 24],
    ['active:p-2 hover:p-4 active:p-6', 'paddingTop', 16, 24, 24],
    ['hover:m-2 active:m-4 hover:m-6', 'marginTop', 24, 16, 24],
    ['hover:opacity-25 active:opacity-50 hover:opacity-75', 'opacity', 0.75, 0.5, 0.75],
    ['hover:p-2 active:p-4 hover:p-6 hover:gap-2', 'paddingTop', 24, 16, 24],
    ['hover:gap-2 active:gap-4 hover:gap-6', 'rowGap', 24, 16, 24],
    ['hover:gap-x-2 active:gap-x-4 hover:gap-x-6', 'columnGap', 24, 16, 24],
    ['hover:gap-y-2 active:gap-y-4 hover:gap-y-6', 'rowGap', 24, 16, 24],
    ['hover:px-2 active:px-4 hover:ps-6', 'paddingStart', 24, 16, 24],
    ['hover:ms-2 active:ms-4 hover:ms-6', 'marginStart', 24, 16, 24],
  ] as const) {
    const source = `import {Pressable} from '@hozo/core';const el=<Pressable className="${classes} columns-(--layout)"/>`
    const { style } = props(source, false, ['WEB_ONLY_PROPERTY_ON_NATIVE'])
    assert.equal(flatten(style({ hovered: true, pressed: false }))[key], hover)
    assert.equal(flatten(style({ hovered: false, pressed: true }))[key], press)
    assert.equal(flatten(style({ hovered: true, pressed: true }))[key], both)
    const [web] = compiler.compile(source)
    assert.match(
      web!.css,
      classes.startsWith('hover:')
        ? /:hover[\s\S]*:active[\s\S]*:hover/
        : /:active[\s\S]*:hover[\s\S]*:active/,
    )
  }
})

test('fallback keeps same-guard filter grouping when a reset shares resting slots', () => {
  const source =
    'import {Pressable} from "@hozo/core";const el=<Pressable className="blur-sm filter-none hover:blur-sm active:p-4 hover:sepia columns-(--layout)"/>'
  const [web] = compiler.compile(source)
  assert.match(
    web!.css,
    /\.hozo-0:hover \{[^}]*--hozo-blur: blur\(8px\);[^}]*--hozo-sepia: sepia\(100%\);/,
  )
  assert.equal(web!.css.match(/\.hozo-0:hover \{/g)?.length, 1)
  const { style } = props(source, false, ['WEB_ONLY_PROPERTY_ON_NATIVE'])
  assert.equal(flatten(style({ hovered: false, pressed: true })).filter, 'none')
  assert.equal(flatten(style({ hovered: true, pressed: true })).filter, 'blur(8px) sepia(100%)')
})

test('constant/helper class expressions and secondary slots retain Tailwind provenance', () => {
  const classes = 'active:bg-[#0000ff] focus:bg-[#00ff00]'
  for (const expression of ['classes', `cx('active:bg-[#0000ff]', 'focus:bg-[#00ff00]')`]) {
    const source = `import {Button} from '@hozo/core';import {cx} from '@hozo/engine';const classes='${classes}';export const Scene=({children})=><Button className={${expression}}>{children}</Button>`
    assert.equal(
      flatten(props(source).style({ pressed: true, focused: true })).backgroundColor,
      '#0000ff',
    )
  }
  const source = `import {Chip} from '@hozo/core';export const Scene=({children})=><Chip onRemove={remove} removeClassName="${classes}">{children}</Chip>`
  assert.equal(
    flatten(props(source).hozoRemoveStyle({ pressed: true, focused: true })).backgroundColor,
    '#0000ff',
  )
})

test('StyleX argument priority survives while unrelated StyleX no longer blocks Tailwind ordering', () => {
  for (const [arguments_, expected] of [
    ['styles.active, styles.focus', '#00ff00'],
    ['styles.focus, styles.active', '#0000ff'],
  ]) {
    const source = `import * as stylex from '@stylexjs/stylex';import {Button} from '@hozo/core';const styles=stylex.create({active:{':focus':{backgroundColor:'#0000ff'}},focus:{':focus':{backgroundColor:'#00ff00'}}});export const Scene=({children})=><Button {...stylex.props(${arguments_})}>{children}</Button>`
    assert.equal(
      flatten(props(source).style({ pressed: true, focused: true })).backgroundColor,
      expected,
    )
  }
  const source = `import * as stylex from '@stylexjs/stylex';import {Button} from '@hozo/core';const styles=stylex.create({x:{padding:1}});export const Scene=({children})=><Button {...stylex.props(styles.x)} className="active:bg-[#0000ff] focus:bg-[#00ff00]">{children}</Button>`
  const web = compiler.compile(source)[0].css
  assert.ok(
    web.indexOf(':active') > web.indexOf(':focus'),
    'the unrelated StyleX input cannot change Tailwind interaction precedence',
  )
})

test('mixed inputs keep their own state priority and use JSX order for specificity ties', () => {
  const tailwind = `text-[#000000] bg-[#ffffff] transition-colors ${variants.join(' ')}`
  const stylex = `const styles=stylex.create({x:{':focus-visible':{backgroundColor:'#555555'},':hover':{backgroundColor:'#666666'},':focus':{backgroundColor:'#777777'},':active':{backgroundColor:'#888888'}}});`
  for (const stylexLast of [false, true]) {
    const attributes = [`className="${tailwind}"`, '{...stylex.props(styles.x)}']
    if (!stylexLast) attributes.reverse()
    const source = `import * as stylex from '@stylexjs/stylex';import {Button} from '@hozo/core';${stylex}export const Scene=({children})=><Button ${attributes.join(' ')}>{children}</Button>`
    for (const inherited of [false, true]) {
      const control = props(source, inherited)
      for (let bits = 0; bits < 16; bits++) {
        const state = {
          hovered: !!(bits & 1),
          focused: !!(bits & 2),
          focusVisible: !!(bits & 4),
          pressed: !!(bits & 8),
        }
        const expected =
          bits === 0
            ? '#ffffff'
            : stylexLast
              ? state.pressed
                ? '#888888'
                : state.focused
                  ? '#777777'
                  : state.hovered
                    ? '#666666'
                    : '#555555'
              : state.pressed
                ? '#444444'
                : state.focusVisible
                  ? '#333333'
                  : state.focused
                    ? '#222222'
                    : '#111111'
        assert.equal(
          flatten(control.style(state)).backgroundColor,
          expected,
          `${stylexLast}/${inherited}/${bits}`,
        )
      }
    }
  }
})

test('a more specific earlier source still beats a later single-state input', () => {
  for (const attributes of [
    'className="hover:focus:bg-[#112233]" {...stylex.props(styles.x)}',
    '{...stylex.props(styles.x)} className="active:bg-[#445566]"',
  ]) {
    const compound = attributes.startsWith('className')
    const stylex = compound
      ? "{':active':{backgroundColor:'#445566'}}"
      : "{':hover':{':focus':{backgroundColor:'#112233'}}}"
    const source = `import * as stylex from '@stylexjs/stylex';import {Button} from '@hozo/core';const styles=stylex.create({x:${stylex}});export const Scene=({children})=><Button ${attributes}>{children}</Button>`
    assert.equal(
      flatten(props(source).style({ hovered: true, focused: true, pressed: true })).backgroundColor,
      '#112233',
    )
  }
})

test('separate StyleX inputs also preserve specificity before JSX ties', () => {
  const source = `import * as stylex from '@stylexjs/stylex';import {Button} from '@hozo/core';const styles=stylex.create({first:{':hover':{':focus':{backgroundColor:'#112233'}}},last:{':active':{backgroundColor:'#445566'}}});export const Scene=({children})=><Button {...stylex.props(styles.first)} {...stylex.props(styles.last)}>{children}</Button>`
  const control = props(source)
  assert.equal(
    flatten(control.style({ hovered: true, focused: true, pressed: true })).backgroundColor,
    '#112233',
  )
  assert.equal(
    flatten(control.style({ hovered: false, focused: true, pressed: true })).backgroundColor,
    '#445566',
  )
})
