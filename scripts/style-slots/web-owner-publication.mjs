// Finite fixture plumbing shared by the two probes, not an adapter resolver.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../../packages/compiler/src/index.ts'
import { prepareOwnerLowerModule } from '../../packages/compiler/src/lower.ts'
import {
  captureOwnerManifests,
  collectOwnerPackageContributions,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
  TailwindProjectSession,
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
  const compiler = createCompiler()
  const original = compiler.prepareWebModule.bind(compiler)
  let ordinaryParses = 0
  compiler.prepareWebModule = (source, ...args) => {
    if (!source.includes('function Plan()')) ordinaryParses++
    return original(source, ...args)
  }
  // One ordinary primitive in the same module forces the real composition
  // path. Its function is never mounted by the widget/browser fixture.
  const input = `${source}
import {View as OrdinaryOwnerControl} from '@hozo/primitives';
export function OrdinaryOwnerEvidence(){return <OrdinaryOwnerControl className="p-1"/>}`
  let preparations = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    preparations++
    return JSON.stringify(
      (await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), names))
        .snapshot,
    )
  })
  try {
    const lease = epoch.lease()
    const packages = collectOwnerPackageContributions(lease.capture)
    assert.equal(packages.status, 'complete')
    const [output] = await session.emit(
      edge.importer,
      [
        (compiler) =>
          prepareOwnerLowerModule(input, edge.importer, edge.importer, compiler, root, lease, [
            { ...edge, entry, imported, classProp },
          ]),
      ],
      packages.candidates,
    )
    lease.check()
    assert.ok(output.lowered)
    assert.equal(output.owners.length, 1)
    const result = output.owners[0]
    assert.equal(result.preview.findings.length, sites)
    assert.ok(result.preview.findings.every((row) => row.disposition === 'prepared-literal'))
    assert.ok(result.preview.css)
    assert.equal(preparations, 1)
    assert.equal(ordinaryParses, 1)
    assert.match(output.lowered.css, /padding-top: 4px/)
    assert.doesNotMatch(output.lowered.code, /<OrdinaryOwnerControl/)
    assert.equal(result.identity.owner, owner)
    assert.equal(result.identity.entry, entry)
    assert.doesNotMatch(result.preview.code, /react-native|StyleSheet|hozoTabStyle|hozoHandleStyle/)
    return {
      code: output.lowered.code,
      css: output.lowered.css,
      identity: result.identity,
      fingerprint: result.preview.contextFingerprint,
      preparations,
      ordinaryParses,
      delivery: 'composed-ordinary-lowering',
    }
  } finally {
    epoch.invalidate()
    session.invalidate()
  }
}
