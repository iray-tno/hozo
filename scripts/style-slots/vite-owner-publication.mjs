// Actual Vite build evidence. No supplied owner edges, locator or caller list.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'
import { hozo, hozoWithDiscoveredOwnerCallers } from '../../packages/vite/src/index.ts'
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

export async function buildViteOwnerPublication(route = 'captured') {
  assert.ok(['captured', 'fallback', 'ordinary'].includes(route))
  const directory = mkdtempSync(path.join(host, 'hozo-owner-vite-'))
  const entry = path.join(directory, 'Entry.tsx')
  const consumer = path.join(directory, 'node_modules/owner-consumer')
  const caller = path.join(consumer, 'index.tsx')
  const entrySource = `${route === 'captured' ? '' : "import signal from './signal.txt?raw';export {signal};"}import './authored.css';import data from './data.json';export const fixtureVersion=data.version;export {TabsFixture,HandleFixture,OrdinaryControl} from 'owner-consumer'`
  let metadata
  let admission
  try {
    writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"owner-build-fixture","type":"module","private":true}',
    )
    mkdirSync(consumer, { recursive: true })
    writeFileSync(
      path.join(consumer, 'package.json'),
      '{"name":"owner-consumer","type":"module","exports":{".":"./index.tsx","./package.json":"./package.json"}}',
    )
    writeFileSync(caller, viteOwnerSource)
    writeFileSync(entry, entrySource)
    writeFileSync(path.join(directory, 'signal.txt'), 'ordinary-owner-fallback')
    writeFileSync(
      path.join(directory, 'authored.css'),
      '.boundary-sentinel { color: rgb(1, 2, 3) }',
    )
    writeFileSync(path.join(directory, 'data.json'), '{"version":1}')
    writeFileSync(
      path.join(directory, 'tokens.css'),
      `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`,
    )
    const options = {
      root: directory,
      css: 'tokens.css',
      content: { include: ['Entry.tsx'], packages: route === 'captured' ? [] : ['owner-consumer'] },
    }
    const result = await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        route === 'ordinary'
          ? hozo(options)
          : hozoWithDiscoveredOwnerCallers(
              options,
              route === 'fallback' ? 'ordinary-fallback' : 'strict',
            ),
        {
          name: 'capture-owner-build-evidence',
          generateBundle() {
            const id = [...this.getModuleIds()].find(
              (id) => !id.includes('\0') && !id.includes('?') && path.resolve(id) === caller,
            )
            assert.ok(id)
            metadata = structuredClone(this.getModuleInfo(id).meta.hozoOwnerDelivery)
            admission = structuredClone(this.getModuleInfo(id).meta.hozoOwnerAdmission)
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
    if (route === 'captured') {
      assert.equal(metadata?.schema, 1)
      assert.equal(metadata.scope, 'configured-static-source-capture')
    }
    const owners = (metadata?.owners ?? []).filter((owner) =>
      owner.findings.some((row) => row.disposition === 'prepared-literal'),
    )
    if (route === 'captured') {
      assert.equal(owners.length, 2)
      assert.deepEqual(
        new Set(owners.map((owner) => owner.identity.owner)),
        new Set(['Tabs.Tab', 'BottomSheet.handle']),
      )
      for (const owner of owners) {
        assert.equal(owner.identity.importer, caller)
        assert.equal(owner.identity.platform, 'web')
        assert.match(owner.fingerprint, /^scalar-order-v52:/)
        assert.ok(owner.findings.every((row) => row.disposition === 'prepared-literal'))
      }
    } else {
      assert.deepEqual(owners, [])
      assert.equal(metadata, undefined)
      assert.deepEqual(
        admission,
        route === 'fallback'
          ? { schema: 1, route: 'ordinary-fallback', reason: 'unsupported-module' }
          : undefined,
      )
    }
    const modules = Object.keys(chunks[0].modules).map((file) => file.replaceAll('\\', '/'))
    for (const file of ['tabs.js', 'bottom-sheet.js'])
      assert.ok(modules.some((module) => module.endsWith(`/patterns/dist/${file}`)))
    assert.ok(!modules.some((module) => /packages\/(compiler|tailwind|vite)\//.test(module)))
    assert.ok(modules.some((module) => module.endsWith('/node_modules/owner-consumer/index.tsx')))
    const sourceHash = createHash('sha256').update(viteOwnerSource).digest('hex')
    if (route === 'captured') {
      assert.ok(
        metadata.capture.edges.some(
          (edge) =>
            edge.importer === entry &&
            edge.specifier === 'owner-consumer' &&
            path.resolve(edge.entry) === caller,
        ),
      )
      assert.equal(
        metadata.capture.sources.find((source) => source.file === caller)?.sha256,
        sourceHash,
      )
      assert.equal(
        metadata.capture.sources.find((source) => source.file === entry)?.sha256,
        createHash('sha256').update(entrySource).digest('hex'),
      )
      const textBoundaries = metadata.capture.unassessedImports.filter(
        (edge) => edge.reason === 'non-js-source',
      )
      assert.deepEqual(
        new Set(textBoundaries.map((edge) => path.extname(edge.entry))),
        new Set(['.css', '.json']),
      )
      assert.ok(textBoundaries.every((edge) => /^[a-f0-9]{64}$/.test(edge.sha256)))
    }
    const css = sheets
      .map((sheet) =>
        typeof sheet.source === 'string'
          ? sheet.source
          : Buffer.from(sheet.source).toString('utf8'),
      )
      .join('\n')
    if (route !== 'captured') {
      assert.doesNotMatch(chunks[0].code, /hozo-owner-[a-f0-9]{16}-r/)
      assert.doesNotMatch(css, /\.hozo-owner-/)
      assert.ok(chunks[0].exports.includes('signal'))
      assert.match(css, /padding-top: ?16px/)
    }
    return {
      code: chunks[0].code,
      css,
      owners,
      admission,
      capture: metadata?.capture,
      configuredPackages: options.content.packages,
      entrySha256: createHash('sha256').update(entrySource).digest('hex'),
      modules,
      sourceSha256: sourceHash,
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
