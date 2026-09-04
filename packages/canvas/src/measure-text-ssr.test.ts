// The other branch of `measureCanvasText`, which needs a process with no
// `document` in it -- hence its own file, since `node --test` runs each
// in its own process and the measuring context is made once per module.

import assert from 'node:assert/strict'
import test from 'node:test'

import { measureCanvasText } from './index.tsx'

test('with no document there is nothing to measure with, and it says so', () => {
  // A server rendering a chart has no canvas. `undefined` rather than
  // zeros, for the reason a path hit test refuses there: zeros are a
  // layout that moves on hydration, and the caller is the one who can
  // decide what to do instead.
  assert.equal('document' in globalThis, false, 'this test needs a process with no DOM')
  assert.equal(measureCanvasText({ text: 'Jan', x: 0, y: 0, fontSize: 20 }), undefined)
})
