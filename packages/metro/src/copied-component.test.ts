// `hozo add` (RFC 012) copies an `@hozo/ui` file into the project. The copy
// is only the same component if its own output does not depend on where the
// file sits: under `node_modules/@hozo/ui/src`, or as project code under
// `src/components/ui`. Measured for every file of the package, through the
// transformer the way Metro runs it.
//
// Where it does differ is the caller, and that is recorded rather than
// asserted here: a caller importing a copy gets no text forwarding, because
// the forwarding facts reach Metro only through a dependency's manifest
// (docs/measurements/hozo-add-copied-callers.md).

import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { transform, withHozo } from './index.ts'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-copied-'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { '@hozo/ui': '0.0.0' } }),
  )
  const installed = path.join(root, 'node_modules', '@hozo', 'ui')
  mkdirSync(installed, { recursive: true })
  writeFileSync(
    path.join(installed, 'package.json'),
    JSON.stringify({ name: '@hozo/ui', hozo: { manifest: './hozo.manifest.json' } }),
  )
  cpSync(path.join(ui, 'hozo.manifest.json'), path.join(installed, 'hozo.manifest.json'))
  const upstream = path.join(root, 'upstream.cjs')
  writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
  return { root, upstream }
}

test('an @hozo/ui file compiles the same as project code as it does in node_modules', async () => {
  const { root, upstream } = project()
  try {
    await withHozo({ projectRoot: root, transformer: { babelTransformerPath: upstream } }, { root })
    const compile = async (src: string, file: string, platform: string) => {
      const absolute = path.join(root, file)
      const output = (await transform({
        src,
        filename: absolute,
        options: { projectRoot: root, platform },
      })) as string
      // The one expected difference: the relative path to the project's
      // candidate module, which is the same file from either place.
      return output.replace(
        /from '(\.[^']*\.hozo\/[^']*)'/g,
        (_, relative: string) => `from '${path.resolve(path.dirname(absolute), relative)}'`,
      )
    }
    const files = readdirSync(path.join(ui, 'src')).filter(
      (name) => /\.tsx?$/.test(name) && !name.includes('.test.'),
    )
    assert.ok(files.length > 40, `found ${files.length} files in @hozo/ui`)
    const differ: string[] = []
    let lowered = 0
    for (const name of files) {
      const src = readFileSync(path.join(ui, 'src', name), 'utf8')
      for (const platform of ['ios', 'android']) {
        const installed = await compile(src, `node_modules/@hozo/ui/src/${name}`, platform)
        const copied = await compile(src, `src/components/ui/${name}`, platform)
        if (installed !== copied) differ.push(`${platform} ${name}`)
        if (installed !== src) lowered++
      }
    }
    assert.deepEqual(differ, [])
    // Equal because both were compiled, not because neither was. The files
    // left as written hand their classes to a pattern (`accordion.tsx`,
    // `tabs.tsx`, …), which resolves them on device; 40 of 86 were lowered
    // when this was written.
    assert.ok(lowered >= 40, `${lowered} outputs differ from their source`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
