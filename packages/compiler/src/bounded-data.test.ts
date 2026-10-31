import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readBoundedUtf8File } from './bounded-data.ts'

test('shared data IO rejects invalid budgets before opening and preserves strict UTF-8 bytes', (t) => {
  for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 8_388_609])
    assert.throws(() => readBoundedUtf8File('nonexistent-data', limit), /budget-invalid/)
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-bounded-data-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'data.json')
  writeFileSync(file, '\ufeff{}')
  assert.equal(readBoundedUtf8File(file, 5), '\ufeff{}')
  assert.throws(() => readBoundedUtf8File(file, 4), /size-budget/)
  writeFileSync(file, Buffer.from([0xff]))
  assert.throws(() => readBoundedUtf8File(file, 8), /encoded data|encoding/)
  assert.throws(() => readBoundedUtf8File(dir, 8), /not-a-file|EISDIR|EPERM/)
})
