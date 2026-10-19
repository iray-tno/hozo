import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HozoInheritedMetricsContext,
  HozoInheritedPaintContext,
} from './generated/text-inheritance-protocol.ts'
import { HozoTextSizeContext as generatedSize } from './generated/text-size-context.ts'
import {
  HOZO_INHERITED_TEXT_FIELDS,
  HozoInheritedMetricsContext as metrics,
  HozoInheritedPaintContext as paint,
} from './text-inheritance.ts'
import { HozoTextSizeContext } from './text-size.ts'

test('generated leaves use the engine singletons, including the legacy size bridge', () => {
  assert.equal(HozoInheritedMetricsContext, metrics)
  assert.equal(HozoInheritedPaintContext, paint)
  assert.equal(generatedSize, HozoTextSizeContext)
  assert.deepEqual(HOZO_INHERITED_TEXT_FIELDS, [
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
    'color',
  ])
})
