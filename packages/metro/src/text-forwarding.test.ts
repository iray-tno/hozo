// A component package's manifest, from `node_modules` to a compiled Text
// (#950), through the transformer the way Metro runs it.
//
// The manifest is read by the worker from the installed package, and it has
// to reach Metro's cache key too: Metro keys a transform on the file and the
// transformer, and nothing else tells it the output depended on a file in
// another package.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getCacheKey, transform, withHozo } from './index.ts'

const SAVE = `import { View, Text } from '@hozo/core'
import { Button } from 'fake-ui'
export function Save() {
  return <Button tone="accent"><View><Text>Save</Text></View></Button>
}
`

function manifest(classes: string) {
  return JSON.stringify({
    version: 1,
    textForwarding: {
      Button: {
        props: [{ name: 'tone', default: 'neutral', values: ['accent', 'neutral'] }],
        variants: [
          { when: ['accent'], classes },
          { when: ['neutral'], classes: 'text-black' },
        ],
      },
    },
  })
}

function project(classes: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-forwarding-'))
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { 'fake-ui': '1.0.0' } }),
  )
  const ui = path.join(root, 'node_modules', 'fake-ui')
  mkdirSync(ui, { recursive: true })
  writeFileSync(
    path.join(ui, 'package.json'),
    JSON.stringify({ name: 'fake-ui', hozo: { manifest: './hozo.manifest.json' } }),
  )
  writeFileSync(path.join(ui, 'hozo.manifest.json'), manifest(classes))
  const upstream = path.join(root, 'upstream.cjs')
  writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
  return { root, upstream, ui }
}

test("a Text inside a dependency's component gets what its manifest says", async () => {
  const { root, upstream } = project('font-semibold text-lg bg-blue-600')
  try {
    await withHozo({ projectRoot: root, transformer: { babelTransformerPath: upstream } }, { root })
    const output = (await transform({
      src: SAVE,
      filename: path.join(root, 'src', 'Save.tsx'),
      options: { projectRoot: root, platform: 'ios' },
    })) as string
    assert.match(output, /fontWeight: '600'/)
    assert.match(output, /fontSize: 18/)
    // The Button's box stays the Button's.
    assert.doesNotMatch(output, /backgroundColor/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the cache key changes with a dependency manifest, and only then', () => {
  const { root, ui } = project('font-semibold')
  try {
    const first = getCacheKey({ projectRoot: root })
    assert.equal(getCacheKey({ projectRoot: root }), first)
    writeFileSync(path.join(ui, 'hozo.manifest.json'), manifest('font-bold'))
    assert.notEqual(getCacheKey({ projectRoot: root }), first)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
