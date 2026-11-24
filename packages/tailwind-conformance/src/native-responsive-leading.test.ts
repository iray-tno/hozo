import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

for (const [classes, expected] of [
  ['text-lg sm:text-xl tracking-wide md:tracking-[2px]', [0.45, 0.5, 2]],
  ['text-lg sm:tracking-[2px] md:text-xl tracking-wide', [0.45, 2, 2]],
] as const) {
  test(`Native keeps responsive em tracking behind explicit tracking: ${classes}`, () => {
    const { C } = loadNativeModule(`import {Text} from '@hozo/core';
    export function C(){return <Text className="${classes}">Text</Text>}`)
    let tree: ReturnType<typeof renderer.create>
    renderer.act(() => {
      stub.Dimensions.__hozoSetWindow({ width: 639 })
      tree = renderer.create(react.createElement(C))
    })
    const text = tree.root.findByType('Text')
    try {
      for (const [width, index] of [
        [639, 0],
        [640, 1],
        [768, 2],
        [640, 1],
        [639, 0],
      ] as const) {
        renderer.act(() => stub.Dimensions.__hozoSetWindow({ width }))
        assert.equal(tree.root.findByType('Text'), text)
        const style = stub.StyleSheet.flatten(text.props.style)
        assert.equal(
          style.fontSize,
          width >= (classes.includes('sm:text-xl') ? 640 : 768) ? 20 : 18,
        )
        assert.equal(style.letterSpacing, expected[index])
      }
    } finally {
      renderer.act(() => tree.unmount())
      renderer.act(() => stub.Dimensions.__hozoSetWindow({ width: 800 }))
    }
  })
}

test('a child font fallback is not overridden by a View ancestor leading', () => {
  const { C } = loadNativeModule(`import {View, Text} from '@hozo/core';
    export function C(){return <View className="text-lg leading-relaxed"><Text className="text-xl">Child</Text></View>}`)
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(C))
  })
  try {
    assert.equal(stub.StyleSheet.flatten(tree.root.findByType('Text').props.style).lineHeight, 28)
  } finally {
    renderer.act(() => tree.unmount())
  }
})

for (const [classes, small, medium, large] of [
  ['text-lg sm:text-xl leading-relaxed', 29.25, 32.5, 32.5],
  ['text-[1.125rem] sm:text-[1.25rem] leading-relaxed', 29.25, 32.5, 32.5],
  ['leading-relaxed sm:text-xl text-lg', 29.25, 32.5, 32.5],
  ['text-lg sm:text-xl leading-6', 24, 24, 24],
  ['leading-6 sm:text-xl text-lg', 24, 24, 24],
  ['text-lg sm:text-xl leading-relaxed sm:leading-tight', 29.25, 25, 25],
  ['text-lg sm:leading-tight md:text-xl', 28, 22.5, 25],
  ['text-lg sm:text-xl', 28, 28, 28],
] as const) {
  test(`Native leading tracks responsive font sizes: ${classes}`, () => {
    const { C } = loadNativeModule(`import { Paragraph } from '@hozo/core';
      export function C() { return <Paragraph className="${classes}">Several lines of text</Paragraph> }`)
    let tree: ReturnType<typeof renderer.create>
    renderer.act(() => {
      stub.Dimensions.__hozoSetWindow({ width: 639 })
      tree = renderer.create(react.createElement(C))
    })
    const field = () => tree.root.findByType('Text')
    const original = field()
    try {
      for (const [width, expected] of [
        [639, small],
        [640, medium],
        [768, large],
        [1280, large],
        [639, small],
      ]) {
        renderer.act(() => stub.Dimensions.__hozoSetWindow({ width }))
        assert.equal(field(), original)
        const style = stub.StyleSheet.flatten(field().props.style)
        assert.equal(style.lineHeight, expected, `${width}px`)
        assert.equal(
          style.fontSize,
          classes.includes('md:text-xl') ? (width >= 768 ? 20 : 18) : width >= 640 ? 20 : 18,
        )
      }
    } finally {
      renderer.act(() => tree.unmount())
      renderer.act(() => stub.Dimensions.__hozoSetWindow({ width: 800 }))
    }
  })
}
