import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'
import { convertJUnitDirectory, sourcePathForCase } from './junit-to-allure.mjs'

function testcase(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('testcase')[0]
}

test('compiled TypeScript tests link back to their TS or TSX source', () => {
  const element = testcase(`
    <testsuite package="TypeScript">
      <testcase file="/work/packages/canvas/.test-build/gradient.test.js" />
    </testsuite>`)
  assert.equal(sourcePathForCase(element), 'packages/canvas/src/gradient.test.tsx')
})

test('Rust tests link to the deepest source module that exists', () => {
  const element = testcase(`
    <testsuite package="Rust">
      <testcase classname="hozo_native::native_tests::a11y" />
    </testsuite>`)
  assert.equal(sourcePathForCase(element), 'crates/hozo_native/src/native_tests/a11y.rs')
})

test('conversion emits a main-branch source link without changing the test identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hozo-allure-'))
  const input = join(directory, 'junit')
  const output = join(directory, 'allure')
  try {
    mkdirSync(input)
    writeFileSync(
      join(input, 'node-canvas.xml'),
      `<testsuites><testsuite name="canvas" package="TypeScript">
        <testcase name="draws" classname="gradient" file="/work/packages/canvas/.test-build/gradient.test.js" time="0.01" />
      </testsuite></testsuites>`,
      'utf8',
    )

    assert.equal(convertJUnitDirectory(input, output), 1)
    const resultFile = join(
      output,
      readdirSync(output).find((name) => name.endsWith('-result.json')),
    )
    const result = JSON.parse(readFileSync(resultFile, 'utf8'))
    assert.equal(result.fullName, 'gradient.draws')
    assert.equal(
      result.links[0].url,
      'https://github.com/iray-tno/hozo/blob/main/packages/canvas/src/gradient.test.tsx',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
