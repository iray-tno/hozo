// Explicit finite browser fixture, not an adapter graph or an owner audit.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createCompiler } from '../../packages/compiler/src/index.ts'
import {
  captureOwnerManifests,
  InstanceOwnerCallerProject,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
} from '../../packages/compiler/src/project.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'
import { tabLabelClasses, tabsProbeRoot } from './tabs-probe.mjs'

export async function prepareWebTabsPublication() {
  const require = createRequire(path.join(tabsProbeRoot, 'examples/storybook-demo/package.json'))
  const packageRoot = realpathSync(path.join(tabsProbeRoot, 'packages/patterns'))
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  const entry = realpathSync(require.resolve('@hozo/patterns'))
  assert.equal(entry, realpathSync(path.join(packageRoot, metadata.exports['.'].default)))
  const edge = {
    importer: path.join(tabsProbeRoot, 'examples/storybook-demo/src/OwnerTabsFixture.tsx'),
    specifier: '@hozo/patterns',
  }
  const observation = readResolvedOwnerManifest(edge, {
    packageRoot,
    entry,
    declaredManifest: metadata.hozo.manifest,
  })
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(
    captureOwnerManifests([edge], [observation], {
      platform: 'web',
      epoch: 'tabs-web-browser-fixture',
    }),
  )
  let preparations = 0
  const project = new InstanceOwnerCallerProject(epoch.lease(), createCompiler(), async (names) => {
    preparations++
    return JSON.stringify(
      (await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), names))
        .snapshot,
    )
  })
  const source = `import {Tabs} from '@hozo/patterns';
export function TabsFixture({tabs,index,onIndexChange}) {return <Tabs tabs={tabs} index={index} onIndexChange={onIndexChange} tabClassName=${JSON.stringify(tabLabelClasses)}/>}`
  try {
    const result = await project.emit(source, {
      ...edge,
      entry,
      imported: 'Tabs',
      classProp: 'tabClassName',
    })
    assert.equal(result.preview.findings[0].disposition, 'prepared-literal')
    assert.ok(result.preview.css)
    assert.equal(preparations, 1)
    assert.equal(result.identity.owner, 'Tabs.Tab')
    assert.equal(result.identity.entry, entry)
    assert.doesNotMatch(result.preview.code, /react-native|StyleSheet|hozoTabStyle/)
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
