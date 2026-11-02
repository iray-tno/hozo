// Actual Vite build evidence. No supplied owner edges, locator or caller list.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'
import { hozoWithDiscoveredOwnerCallers } from '../../packages/vite/src/index.ts'
import { handleClasses } from './handle-publication.mjs'
import { handleStateClasses } from './handle-web.mjs'
import { tabLabelClasses } from './tabs-probe.mjs'

const host = fileURLToPath(new URL('../../examples/storybook-demo/', import.meta.url))
const require = createRequire(new URL('../../packages/vite/package.json', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
export const viteOwnerSource = `import {Tabs,BottomSheet} from '@hozo/patterns';import {View} from '@hozo/primitives';
export function TabsFixture({tabs,index,onIndexChange,tabStyle}){return <Tabs tabs={tabs} index={index} onIndexChange={onIndexChange} tabStyle={tabStyle} tabClassName=${JSON.stringify(tabLabelClasses)}/>}
export function HandleFixture({interactive,handleStyle}){return interactive
 ? <BottomSheet open portal={false} detents={[.5,1]} accessibilityLabel="Vite sheet" sheetClassName="vite-panel" handleStyle={handleStyle} handleClassName=${JSON.stringify(handleStateClasses)}><button>Content</button></BottomSheet>
 : <BottomSheet open portal={false} detents={[1]} accessibilityLabel="Vite sheet" sheetClassName="vite-panel" handleStyle={handleStyle} handleClassName=${JSON.stringify(handleClasses)}><button>Content</button></BottomSheet>}
export function OrdinaryControl(){return <View testID="ordinary-control" className="p-1"/>}`

export async function buildViteOwnerPublication() {
  const directory = mkdtempSync(path.join(host, 'hozo-owner-vite-'))
  const entry = path.join(directory, 'Entry.tsx')
  let metadata
  try {
    writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"owner-build-fixture","type":"module","private":true}',
    )
    writeFileSync(entry, viteOwnerSource)
    writeFileSync(
      path.join(directory, 'tokens.css'),
      `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`,
    )
    const result = await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        hozoWithDiscoveredOwnerCallers({
          root: directory,
          css: 'tokens.css',
          content: { include: ['Entry.tsx'], packages: [] },
        }),
        {
          name: 'capture-owner-build-evidence',
          generateBundle() {
            const id = [...this.getModuleIds()].find(
              (id) => !id.includes('\0') && !id.includes('?') && path.resolve(id) === entry,
            )
            assert.ok(id)
            metadata = structuredClone(this.getModuleInfo(id).meta.hozoOwnerDelivery)
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['es'] },
        rolldownOptions: {
          external: (id) =>
            id === 'react' ||
            id.startsWith('react/') ||
            id === 'react-dom' ||
            id.startsWith('react-dom/'),
        },
      },
    })
    const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
    const chunks = output.filter((item) => item.type === 'chunk')
    const sheets = output.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    assert.equal(chunks.length, 1)
    assert.ok(sheets.length)
    assert.equal(metadata?.schema, 1)
    assert.equal(metadata.scope, 'configured-static-source-capture')
    const owners = metadata.owners.filter((owner) =>
      owner.findings.some((row) => row.disposition === 'prepared-literal'),
    )
    assert.equal(owners.length, 2)
    assert.deepEqual(
      new Set(owners.map((owner) => owner.identity.owner)),
      new Set(['Tabs.Tab', 'BottomSheet.handle']),
    )
    for (const owner of owners) {
      assert.equal(owner.identity.importer, entry)
      assert.equal(owner.identity.platform, 'web')
      assert.match(owner.fingerprint, /^scalar-order-v8:/)
      assert.ok(owner.findings.every((row) => row.disposition === 'prepared-literal'))
    }
    const modules = Object.keys(chunks[0].modules).map((file) => file.replaceAll('\\', '/'))
    for (const file of ['tabs.js', 'bottom-sheet.js'])
      assert.ok(modules.some((module) => module.endsWith(`/patterns/dist/${file}`)))
    assert.ok(!modules.some((module) => /packages\/(compiler|tailwind|vite)\//.test(module)))
    return {
      code: chunks[0].code,
      css: sheets
        .map((sheet) =>
          typeof sheet.source === 'string'
            ? sheet.source
            : Buffer.from(sheet.source).toString('utf8'),
        )
        .join('\n'),
      owners,
      modules,
      sourceSha256: createHash('sha256').update(viteOwnerSource).digest('hex'),
    }
  } finally {
    const resolved = realpathSync(directory)
    const relative = path.relative(realpathSync(host), resolved)
    assert.ok(
      relative &&
        !relative.startsWith('..') &&
        !path.isAbsolute(relative) &&
        path.basename(resolved).startsWith('hozo-owner-vite-'),
    )
    rmSync(resolved, { recursive: true, force: true })
  }
}
