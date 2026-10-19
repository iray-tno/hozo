import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { prepareTextDeviceFixture } from '../../../packages/tailwind-conformance/src/text-inheritance-device-source.ts'

const require = createRequire(import.meta.url)
const file = fileURLToPath(new URL('../src/text-inheritance-generated.tsx', import.meta.url))
const source = prepareTextDeviceFixture().code
const formatted = execFileSync(
  process.execPath,
  [require.resolve('@biomejs/biome/bin/biome'), 'check', '--write', '--stdin-file-path', file],
  { input: source, encoding: 'utf8' },
)
if (process.argv.includes('--check'))
  assert.equal(
    readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
    formatted,
    'regenerate the Native text fixture',
  )
else writeFileSync(file, formatted)
