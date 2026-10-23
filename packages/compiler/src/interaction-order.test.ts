import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { createCompiler, openCandidateCache } from './index.ts'

const variants = [
  'hover:bg-[#111111]',
  'focus:bg-[#222222]',
  'focus-visible:bg-[#333333]',
  'active:bg-[#444444]',
]
const compiler = createCompiler()
const flatten = (style) => Object.assign({}, ...style.filter(Boolean))
function props(source: string, inherited = false) {
  const component = compiler.compileNativeModule(source, undefined, undefined, {
    textInheritance: inherited,
  }).components[0]
  assert.ok(
    !component.diagnostics.some((entry) => entry.severity === 'error'),
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
