import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { collectIosRenderSample } from './ios-render-sample.mjs'

test('render sampler targets only the launch PID, uses bounded read-only commands, and retains completion', () => {
  const output = mkdtempSync(join(tmpdir(), 'hozo-render-sample-'))
  try {
    const calls = []
    const result = collectIosRenderSample(1234, output, (command, args, options) => {
      calls.push([command, args])
      assert.equal(options.timeout, 8_000)
      return Buffer.from('process observation')
    })
    assert.deepEqual(calls, [
      ['ps', ['-p', '1234', '-o', 'pid,ppid,%cpu,state,etime,comm']],
      ['/usr/bin/sample', ['1234', '3', '1', '-file', join(output, 'sample.txt')]],
    ])
    assert.equal(result.completed, true)
    assert.equal(JSON.parse(readFileSync(join(output, 'sampling.json'))).pid, 1234)
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})

test('sampling failure is retained rather than retried or reported as success', () => {
  const output = mkdtempSync(join(tmpdir(), 'hozo-render-sample-'))
  try {
    let calls = 0
    const result = collectIosRenderSample(1234, output, () => {
      calls++
      throw new Error('permission denied')
    })
    assert.equal(calls, 1)
    assert.equal(result.completed, false)
    assert.match(result.error, /permission denied/)
    assert.equal(JSON.parse(readFileSync(join(output, 'sampling.json'))).completed, false)
    assert.throws(() => collectIosRenderSample('1234; other', output))
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})
