import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClassResolver } from './class-resolver.ts'
import { hozoTransformStyles, type TransformSpec } from './transform-slots.ts'

const base = { opacity: 0.5, transform: [{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }] }
const baseSpec: TransformSpec = [
  base,
  {
    translate: 'slots',
    translateSlots: [{ translateX: 8 }],
    rotate: [{ rotate: '45deg' }],
    scale: 'slots',
    scaleSlots: [{ scale: 0.95 }],
  },
]
const transform = (styles: ReturnType<typeof hozoTransformStyles>) => styles.at(-1)?.transform

test('a conditional reset clears only its CSS property and restores when inactive', () => {
  for (const [name, expected] of [
    ['rotate', [{ translateX: 8 }, { scaleX: 0.95 }, { scaleY: 0.95 }]],
    ['scale', [{ translateX: 8 }, { rotate: '45deg' }]],
    ['translate', [{ rotate: '45deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }]],
    ['functions', [{ translateX: 8 }, { rotate: '45deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }]],
  ] as const) {
    const reset = { transform: [] }
    const spec: TransformSpec = [reset, name === 'rotate' ? { rotate: [] } : { [name]: 'none' }]
    assert.deepEqual(transform(hozoTransformStyles([base, reset], [baseSpec, spec])), expected)
    assert.deepEqual(
      transform(hozoTransformStyles([base, false], [baseSpec, spec])),
      base.transform.flatMap((entry) =>
        'scale' in entry ? [{ scaleX: entry.scale }, { scaleY: entry.scale }] : [entry],
      ),
    )
    assert.deepEqual(base.opacity, 0.5)
    assert.deepEqual(base.transform, [{ translateX: 8 }, { rotate: '45deg' }, { scale: 0.95 }])
  }
})

test('resets retain axis registers for a later utility instead of clearing their values', () => {
  const y = { transform: [{ translateY: 12 }] }
  const off = { transform: [] }
  const x = { transform: [{ translateX: 4 }] }
  const specs: TransformSpec[] = [
    [y, { translate: 'slots', translateSlots: [{ translateY: 12 }] }],
    [off, { translate: 'none' }],
    [x, { translate: 'slots', translateSlots: [{ translateX: 4 }] }],
  ]
  assert.deepEqual(transform(hozoTransformStyles([y, off], specs)), [])
  assert.deepEqual(transform(hozoTransformStyles([y, off, x], specs)), [
    { translateX: 4 },
    { translateY: 12 },
  ])
})

test('function-slot resets preserve standalone transforms and transform-cpu restores registers', () => {
  const functions = { transform: [{ rotateX: '30deg' }] }
  const off = { transform: [] }
  const cpu = { transform: [] }
  const specs: TransformSpec[] = [
    baseSpec,
    [functions, { functions: 'slots', functionsSlots: [{ rotateX: '30deg' }] }],
    [off, { functions: 'none' }],
    [cpu, { functions: 'slots' }],
  ]
  const unchanged = [{ translateX: 8 }, { rotate: '45deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }]
  assert.deepEqual(transform(hozoTransformStyles([base, functions, off], specs)), unchanged)
  assert.deepEqual(transform(hozoTransformStyles([base, functions, off, cpu], specs)), [
    ...unchanged,
    { rotateX: '30deg' },
  ])
})

test('authored transform lists retain order and repeated functions, then yield to registered slots', () => {
  const authored = { transform: [{ rotate: '10deg' }, { translateX: 3 }, { rotate: '20deg' }] }
  const slots = { transform: [{ skewX: '5deg' }] }
  const specs: TransformSpec[] = [
    [authored, { functions: 'authored', functionsAuthored: authored.transform }],
    [slots, { functions: 'slots', functionsSlots: slots.transform }],
  ]
  assert.deepEqual(transform(hozoTransformStyles([authored], specs)), authored.transform)
  assert.deepEqual(transform(hozoTransformStyles([authored, slots], specs)), slots.transform)
})

test('nested false styles and an authored RN transform keep normal style-array precedence', () => {
  const authored = { transform: [{ rotate: '90deg' }], opacity: 1 }
  const result = hozoTransformStyles([[false, base], null, [undefined, authored]], [baseSpec])
  assert.deepEqual(result, [{ opacity: 0.5 }, authored])
  assert.equal(result.at(-1), authored)
})

test('dynamic classes use the same slot composition and keep their cached result', () => {
  const reset = { transform: [] }
  const resolve = createClassResolver({ base, reset }, {}, (styles) =>
    hozoTransformStyles(styles, [baseSpec, [reset, { rotate: [] }]]),
  )
  assert.deepEqual(transform(resolve('base reset')), [
    { translateX: 8 },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.equal(resolve('base reset'), resolve('base reset'))
  assert.deepEqual(transform(resolve('reset base')), [
    { translateX: 8 },
    { rotate: '45deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
})

test('a project-sized candidate index is queried only for the styles actually resolved', () => {
  const specs = new Map([baseSpec])
  specs[Symbol.iterator] = () => {
    throw new Error('the project index must not be copied per resolution')
  }
  assert.deepEqual(transform(hozoTransformStyles([base], specs)), [
    { translateX: 8 },
    { rotate: '45deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
})

test('a two-dimensional scale disables the Z slot without destroying its register', () => {
  const matrix = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1] }
  const z = { transform: [matrix] }
  const x = { transform: [{ scaleX: 0.75 }] }
  const restore = { transform: [matrix] }
  const specs: TransformSpec[] = [
    [z, { scale: 'slots', scale3d: true, scaleSlots: [matrix] }],
    [x, { scale: 'slots', scale3d: false, scaleSlots: [{ scaleX: 0.75 }] }],
    [restore, { scale: 'slots', scale3d: true }],
  ]
  assert.deepEqual(transform(hozoTransformStyles([z, x], specs)), [{ scaleX: 0.75 }])
  assert.deepEqual(transform(hozoTransformStyles([z, x, restore], specs)), [
    { scaleX: 0.75 },
    matrix,
  ])
})
