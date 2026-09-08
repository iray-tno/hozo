import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the published config schema describes both platform inputs', () => {
  const schema = JSON.parse(readFileSync('hozo-links.schema.json', 'utf8')) as {
    $schema: string
    properties: Record<string, unknown>
    anyOf: unknown[]
    $defs: Record<string, unknown>
  }
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.ok(schema.properties.apple)
  assert.ok(schema.properties.android)
  assert.equal(schema.anyOf.length, 2)
  assert.ok(schema.$defs.appleComponent)
})
