// Finite fixture plumbing shared by the two probes, not an adapter resolver.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../../packages/compiler/src/index.ts'
import {
  captureOwnerManifests,
  InstanceOwnerCallerProject,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
} from '../../packages/compiler/src/project.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

export async function prepareWebOwnerPublication(
  source,
  { fixture, imported, classProp, owner, sites },
) {
  const require = createRequire(path.join(root, 'examples/storybook-demo/package.json'))
  const packageRoot = realpathSync(path.join(root, 'packages/patterns'))
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  const entry = realpathSync(require.resolve('@hozo/patterns'))
  assert.equal(entry, realpathSync(path.join(packageRoot, metadata.exports['.'].default)))
  const edge = {
    importer: path.join(root, `examples/storybook-demo/src/${fixture}.tsx`),
    specifier: '@hozo/patterns',
  }
  const observation = readResolvedOwnerManifest(edge, {
    packageRoot,
    entry,
    declaredManifest: metadata.hozo.manifest,
  })
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(captureOwnerManifests([edge], [observation], { platform: 'web', epoch: fixture }))
  let preparations = 0
  const project = new InstanceOwnerCallerProject(epoch.lease(), createCompiler(), async (names) => {
    preparations++
    return JSON.stringify(
      (await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), names))
        .snapshot,
    )
  })
  try {
    const result = await project.emit(source, { ...edge, entry, imported, classProp })
    assert.equal(result.preview.findings.length, sites)
    assert.ok(result.preview.findings.every((row) => row.disposition === 'prepared-literal'))
    assert.ok(result.preview.css)
    assert.equal(preparations, 1)
    assert.equal(result.identity.owner, owner)
    assert.equal(result.identity.entry, entry)
    assert.doesNotMatch(result.preview.code, /react-native|StyleSheet|hozoTabStyle|hozoHandleStyle/)
    return {
      code: result.preview.code,
      css: result.preview.css,
      identity: result.identity,
      fingerprint: result.preview.contextFingerprint,
      preparations,
    }
  } finally {
    project.invalidate()
  }
}
