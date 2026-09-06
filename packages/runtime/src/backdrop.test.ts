import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type ComponentType, createElement, type FunctionComponent } from 'react'

import {
  configureHozoBackdropFilter,
  createExpoBlurAdapter,
  hozoBackdropFilterAdapter,
} from './backdrop.ts'

test('Expo blur adapts CSS radius without loading Expo in the runtime', () => {
  const BlurView: ComponentType<{ intensity?: number; marker?: string }> = (props) =>
    createElement('blur-view', props)
  const adapter = createExpoBlurAdapter(BlurView, {
    intensityForRadius: (radius) => radius * 2,
    props: { marker: 'configured' },
  })
  const cleanup = configureHozoBackdropFilter(adapter)
  try {
    const configured = hozoBackdropFilterAdapter()
    assert.ok(configured)
    const element = (configured as FunctionComponent<{ blurRadius: number }>)({ blurRadius: 12 })
    assert.ok(element)
    assert.equal(element.type, BlurView)
    assert.deepEqual(element.props, { intensity: 24, marker: 'configured' })
  } finally {
    cleanup()
  }
  assert.equal(hozoBackdropFilterAdapter(), undefined)
})
