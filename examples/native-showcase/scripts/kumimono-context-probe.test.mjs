import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/kumimono-context-probe.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
const module = { exports: {} }
new Function('module', code)(module)
const { inspectKumimonoContext } = module.exports

test('explicit context probe queries the four native identity strings once, never renders or flushes', () => {
  let time = 0
  const calls = []
  const events = []
  const gl = {
    RENDERER: 1,
    VENDOR: 2,
    VERSION: 3,
    SHADING_LANGUAGE_VERSION: 4,
    getParameter(parameter) {
      assert.equal(this, gl)
      calls.push(parameter)
      time += 2
      return ['software renderer', 'vendor', 'OpenGL ES 3', 'GLSL ES 3'][parameter - 1]
    },
    render() {
      assert.fail('probe must not render')
    },
    flushEXP() {
      assert.fail('probe must not explicitly flush')
    },
    endFrameEXP() {
      assert.fail('probe must not present')
    },
  }
  inspectKumimonoContext(
    gl,
    (event) => events.push(event),
    () => time,
  )
  assert.deepEqual(calls, [1, 2, 3, 4])
  assert.equal(events.length, 1)
  assert.equal(events[0].parameters.RENDERER, 'software renderer')
  assert.equal(events[0].queryMs, 8)
  assert.equal(events[0].diagnostic, true)
  assert.equal(events[0].timingPerturbed, true)
  assert.deepEqual(events[0].errors, {})
})

test('unsupported/failed strings stay unknown; the probe never invents a GPU identity', () => {
  const events = []
  inspectKumimonoContext(
    {
      RENDERER: 1,
      VENDOR: 2,
      VERSION: 3,
      SHADING_LANGUAGE_VERSION: 4,
      getParameter(parameter) {
        if (parameter === 1) throw new Error('unsupported')
        return null
      },
    },
    (event) => events.push(event),
  )
  assert.deepEqual(Object.values(events[0].parameters), [null, null, null, null])
  assert.equal(Object.keys(events[0].errors).length, 4)
  assert.match(events[0].errors.RENDERER, /unsupported/)
})
