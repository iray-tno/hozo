import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Dimensions, useWindowDimensions } from './dimensions.ts'

const windowSize = { width: 390, height: 844, scale: 3, fontScale: 1 }
const screenSize = { width: 430, height: 932, scale: 3, fontScale: 1 }

test('Dimensions exposes stable window and screen snapshots without a browser', () => {
  Dimensions.set({ window: windowSize, screen: screenSize })
  assert.equal(Dimensions.get('window'), windowSize)
  assert.equal(Dimensions.get('screen'), screenSize)
})

test('Dimensions subscriptions receive one shared change snapshot and can be removed', () => {
  const received: number[] = []
  const subscription = Dimensions.addEventListener('change', ({ window }) => {
    received.push(window.width)
  })
  Dimensions.set({ window: { ...windowSize, width: 412 } })
  subscription.remove()
  Dimensions.set({ window: { ...windowSize, width: 430 } })
  assert.deepEqual(received, [412])
})

test('useWindowDimensions reads the same snapshot during server rendering', () => {
  Dimensions.set({ window: windowSize })
  function Probe() {
    const size = useWindowDimensions()
    return createElement('span', null, `${size.width}:${size.height}:${size.scale}`)
  }
  assert.equal(renderToStaticMarkup(createElement(Probe)), '<span>390:844:3</span>')
})
