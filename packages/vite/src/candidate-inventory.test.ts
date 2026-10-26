import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openCandidateCache } from '@hozo/compiler'
import { build, type Plugin } from 'vite'
import { candidateMetaKey, contentRevision, ViteCandidateInventory } from './candidate-inventory.ts'
import { hozo } from './index.ts'

const source = (name: string) => `export const tone = () => '${name}'`

function record(code: string, sources?: readonly string[]) {
  const cache = openCandidateCache(undefined, sources)
  cache.scanFile('source.tsx', code, 0)
  return cache.exportFile('source.tsx')!
}

function sealed(inventory: ViteCandidateInventory, id: string, code: string) {
  const module = { id, code, meta: inventory.transformMeta(id, code, record(code)) }
  inventory.moduleParsed(module)
  return JSON.parse(JSON.stringify(module))
}

test('inventory unions authored content and final graph receipts without scanning on replay', (t) => {
  const inventory = new ViteCandidateInventory('client')
  const authoredCode = source('p-4')
  const recorded = record(authoredCode)
  inventory.observeAuthored('authored', authoredCode, recorded)
  const live = sealed(inventory, '/post.mdx', source('bg-red-500'))
  const deleted = sealed(inventory, '/removed.mdx', source('text-blue-500'))
  assert.equal(inventory.reconcile([], [live, deleted]).modules.length, 2)
  const proto = Object.getPrototypeOf(openCandidateCache())
  t.mock.method(proto, 'scanFile', () => {
    throw new Error('replay must not scan')
  })
  t.mock.method(proto, 'persist', () => {
    throw new Error('inventory must not mutate the persistent candidate cache')
  })
  // A fresh inventory has no transform callbacks. Only receipts actually
  // present in the supplied graph survive; the absent derived module does not.
  const replay = new ViteCandidateInventory('client')
  replay.observeAuthored('authored', authoredCode, JSON.parse(JSON.stringify(recorded)))
  const result = replay.reconcile(
    [{ id: 'authored', revision: contentRevision(authoredCode) }],
    [live],
  )
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.candidates, ['bg-red-500', 'p-4'])
  assert.equal(result.finalOrderingReady, false)
  assert.equal(JSON.stringify(result).includes('text-blue-500'), false)
  assert.deepEqual(result.issues, [])
})

test('missing, changed and foreign receipts cannot publish a partial union', () => {
  const inventory = new ViteCandidateInventory('client')
  const valid = sealed(inventory, '/a.tsx', source('p-4'))
  const badModules = [
    { ...valid, meta: {} },
    { ...valid, code: source('p-8') },
    { ...valid, id: '/a.tsx?other' },
    { ...valid, code: null },
    { ...valid, meta: { [candidateMetaKey]: { ...valid.meta[candidateMetaKey], schema: 2 } } },
  ]
  for (const bad of badModules) {
    const result = inventory.reconcile([], [valid, bad])
    assert.equal(result.status, 'incomplete')
    assert.equal('candidates' in result, false)
    assert.equal('usesTailwind' in result, false)
  }
  assert.equal(new ViteCandidateInventory('ssr').reconcile([], [valid]).status, 'incomplete')
  assert.equal(
    new ViteCandidateInventory('client', ['foreign']).reconcile([], [valid]).status,
    'incomplete',
  )
})

test('only fresh producers seal final downstream output; replay cannot bless changed output', () => {
  const inventory = new ViteCandidateInventory('client')
  const input = source('p-4')
  const module = {
    id: '/a.tsx',
    code: `${input};export const downstream=1`,
    meta: inventory.transformMeta('/a.tsx', input, record(input)),
  }
  inventory.moduleParsed(module)
  assert.equal(inventory.reconcile([], [module]).status, 'complete')
  const replay = new ViteCandidateInventory('client')
  module.code += ';export const unexpected=2'
  replay.moduleParsed(module)
  assert.equal(replay.reconcile([], [module]).status, 'incomplete')
  inventory.moduleParsed(module)
  assert.equal(inventory.reconcile([], [module]).status, 'incomplete')
})

test('changed or newly discovered authored inputs remain incomplete and deleted inputs are pruned', () => {
  const inventory = new ViteCandidateInventory('client')
  inventory.observeAuthored('old', source('p-2'), record(source('p-2')))
  const result = inventory.reconcile(
    [
      { id: 'old', revision: contentRevision(source('p-4')) },
      { id: 'new', revision: 'new' },
    ],
    [],
  )
  assert.equal(result.status, 'incomplete')
  assert.deepEqual(
    result.issues.map(({ id, kind }) => [id, kind]),
    [
      ['new', 'missing'],
      ['old', 'stale'],
    ],
  )
  const removed = inventory.reconcile([], [])
  assert.equal(removed.status, 'complete')
  assert.deepEqual(removed.candidates, [])
  assert.deepEqual(removed.ignored, ['old'])
})

test('metadata carries one module record, not a project-sized ordering namespace', () => {
  const inventory = new ViteCandidateInventory('client')
  const code = source('p-4')
  const facts = record(code)
  const before = JSON.stringify(inventory.transformMeta('/a.tsx', code, facts)).length
  for (let i = 0; i < 100; i++) inventory.observeAuthored(`authored-${i}`, code, facts)
  const after = JSON.stringify(inventory.transformMeta('/a.tsx', code, facts)).length
  assert.equal(after, before)
})

test('a producer cannot seal facts mutated by a downstream metadata writer', () => {
  const inventory = new ViteCandidateInventory('client')
  const code = source('p-4')
  const module = { id: '/a.tsx', code, meta: inventory.transformMeta('/a.tsx', code, record(code)) }
  module.meta[candidateMetaKey].record = record(source('p-8'))
  inventory.moduleParsed(module)
  assert.equal(inventory.reconcile([], [module]).status, 'incomplete')
})

test('query observations use isolated native scans and retain no scratch entries or persistent writes', (t) => {
  const inventory = new ViteCandidateInventory('client')
  const prototype = Object.getPrototypeOf(openCandidateCache())
  const scan = prototype.scanFile
  const seen: { cache: ReturnType<typeof openCandidateCache>; id: string }[] = []
  t.mock.method(prototype, 'scanFile', function (id, input, stamp) {
    seen.push({ cache: this, id })
    return scan.call(this, id, input, stamp)
  })
  t.mock.method(prototype, 'persist', () => {
    throw new Error('derived observations must not persist')
  })
  const modules = [
    { id: '/same.tsx?red', code: source('bg-red-500') },
    { id: '/same.tsx?blue', code: source('bg-blue-500') },
  ].map((entry) => {
    const module = { ...entry, meta: inventory.transformDerivedMeta(entry.id, entry.code)! }
    inventory.moduleParsed(module)
    return module
  })
  assert.deepEqual(
    seen.map(({ id }) => id),
    modules.map(({ id }) => id),
  )
  assert.ok(seen.every(({ cache }) => cache.size === 0))
  assert.equal(
    seen[0]!.cache,
    seen[1]!.cache,
    'one reusable scratch scanner, not a native cache per query',
  )
  assert.deepEqual(inventory.reconcile([], modules).candidates, ['bg-blue-500', 'bg-red-500'])
  assert.deepEqual(inventory.reconcile([], [modules[1]!]).candidates, ['bg-blue-500'])
})

test('query facts preserve trusted-source static subtraction and usesTailwind truth', () => {
  const input = `import {View} from 'foreign-ui';export const App=()=> <View className="p-4"/>`
  for (const [sources, expected] of [
    [undefined, ['p-4']],
    [['foreign-ui'], []],
  ] as const) {
    const inventory = new ViteCandidateInventory('client', sources)
    const id = '/same.tsx?static'
    const module = { id, code: input, meta: inventory.transformDerivedMeta(id, input)! }
    inventory.moduleParsed(module)
    const result = inventory.reconcile([], [module])
    assert.equal(result.status, 'complete')
    assert.deepEqual(result.candidates, expected)
    assert.equal(result.usesTailwind, true)
  }
})

test('an older query observation cannot be sealed after a replacement input was observed', () => {
  const inventory = new ViteCandidateInventory('client')
  const id = '/same.tsx?variant'
  const oldInput = source('p-4')
  const newInput = source('p-8')
  const oldModule = { id, code: oldInput, meta: inventory.transformDerivedMeta(id, oldInput)! }
  const newModule = { id, code: newInput, meta: inventory.transformDerivedMeta(id, newInput)! }
  inventory.moduleParsed(oldModule)
  assert.equal(inventory.reconcile([], [oldModule]).status, 'incomplete')
  inventory.moduleParsed(newModule)
  assert.deepEqual(inventory.reconcile([], [newModule]).candidates, ['p-8'])
})

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-inventory-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'entry.tsx'), `${source('p-4')};import './post.mdx'`)
  writeFileSync(path.join(root, 'post.mdx'), '# not JSX; produced by the fixture plugin')
  writeFileSync(path.join(root, 'unimported.tsx'), source('text-green-500'))
  const transformed: Plugin = {
    name: 'fixture-mdx',
    enforce: 'pre',
    transform(_code, id) {
      if (id.endsWith('.mdx')) return `globalThis.fixtureTone = 'bg-red-500'`
    },
  }
  return { root, transformed }
}

async function tinyBuild(root: string, transformed: Plugin, extra: Plugin[] = []) {
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [hozo({ root }), transformed, ...extra],
    build: {
      write: false,
      lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], cssFileName: 'fixture' },
      rolldownOptions: { external: ['react/jsx-runtime'] },
    },
  })
}

function readInventory(root: string) {
  return JSON.parse(
    readFileSync(path.join(root, 'node_modules/.hozo/candidate-inventory-client.json'), 'utf8'),
  )
}

test('real Vite build preserves final code receipts, MDX and unimported authored facts', async (t) => {
  const { root, transformed } = fixture(t)
  let graph = 0
  const output = await tinyBuild(root, transformed, [
    {
      name: 'downstream-code',
      transform(code, id) {
        if (id.endsWith('entry.tsx')) return `${code};export const downstream = 42`
      },
      moduleParsed(info) {
        if (info.id.endsWith('entry.tsx')) graph++
      },
    },
  ])
  assert.equal(graph, 1)
  assert.match(JSON.stringify(output), /downstream/)
  assert.doesNotMatch(JSON.stringify(output), /hozo:runtime-candidates/)
  const inventory = readInventory(root)
  assert.equal(inventory.status, 'complete')
  assert.equal(inventory.finalOrderingReady, false)
  assert.deepEqual(inventory.candidates, ['bg-red-500', 'p-4', 'text-green-500'])
  assert.equal(inventory.authored.length, 2)
  assert.equal(inventory.modules.length, 2)
})

test('real Vite build collects query MDX from its transformed input, not physical Markdown', async (t) => {
  const { root, transformed } = fixture(t)
  writeFileSync(path.join(root, 'entry.tsx'), `${source('p-4')};import './post.mdx?variant'`)
  transformed.transform = (_code, id) =>
    id.includes('.mdx') ? `globalThis.fixtureTone = 'bg-blue-500'` : undefined
  await tinyBuild(root, transformed)
  const inventory = readInventory(root)
  assert.equal(inventory.status, 'complete')
  assert.deepEqual(inventory.candidates, ['bg-blue-500', 'p-4', 'text-green-500'])
  assert.ok(inventory.modules.some((id) => id.includes('post.mdx?variant')))
})

test('real Vite query variants preserve the physical authored cache and stay distinct', async (t) => {
  const { root, transformed } = fixture(t)
  const shared = path.join(root, 'shared.tsx')
  const authored = source('p-2')
  writeFileSync(shared, authored)
  writeFileSync(
    path.join(root, 'entry.tsx'),
    `
    import {tone as red} from './shared.tsx?red';
    import {tone as blue} from './shared.tsx?blue';
    export const tones = [red, blue];
  `,
  )
  await tinyBuild(root, transformed, [
    {
      name: 'produce-query-input',
      load(id) {
        if (id.includes('shared.tsx?'))
          return source(id.endsWith('?red') ? 'bg-red-500' : 'bg-blue-500')
      },
    },
  ])
  const result = readInventory(root)
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.candidates, ['bg-blue-500', 'bg-red-500', 'p-2', 'text-green-500'])
  assert.equal(result.modules.filter((id) => id.includes('shared.tsx?')).length, 2)
  const physical = openCandidateCache(path.join(root, 'node_modules/.hozo/candidates.json'))
  assert.equal(physical.exportFile(shared), record(authored))
  assert.equal(physical.candidates().includes('bg-red-500'), false)
  assert.equal(physical.candidates().includes('bg-blue-500'), false)
  assert.doesNotMatch(
    readFileSync(path.join(root, 'node_modules/.hozo/candidates.css'), 'utf8'),
    /\.bg-(red|blue)-500/,
    'this fact-collection layer does not change the active stylesheet publisher',
  )
})

test('a real query whose metadata was lost is still incomplete, not replaced with authored facts', async (t) => {
  const { root, transformed } = fixture(t)
  writeFileSync(path.join(root, 'entry.tsx'), `import './post.mdx?variant'`)
  transformed.transform = (_code, id) => (id.includes('.mdx') ? source('bg-red-500') : undefined)
  await tinyBuild(root, transformed, [
    {
      name: 'drop-query-receipt',
      moduleParsed(module) {
        if (module.id.includes('?variant')) delete module.meta[candidateMetaKey]
      },
    },
  ])
  const result = readInventory(root)
  assert.equal(result.status, 'incomplete')
  assert.equal('candidates' in result, false)
  assert.ok(result.issues.some(({ id }) => id.includes('?variant')))
})

test('real derived facts follow changed transform input even when the physical source is unchanged', async (t) => {
  const { root, transformed } = fixture(t)
  writeFileSync(path.join(root, 'entry.tsx'), `import './post.mdx?variant'`)
  let tone = 'bg-red-500'
  transformed.transform = (_code, id) => (id.includes('.mdx') ? source(tone) : undefined)
  await tinyBuild(root, transformed)
  assert.ok(readInventory(root).candidates.includes('bg-red-500'))
  tone = 'bg-blue-500'
  await tinyBuild(root, transformed)
  const result = readInventory(root)
  assert.equal(result.status, 'complete')
  assert.ok(result.candidates.includes('bg-blue-500'))
  assert.equal(result.candidates.includes('bg-red-500'), false)
})

test('real lowered JSX is sealed after OXC without adding static classes to runtime candidates', async (t) => {
  const { root, transformed } = fixture(t)
  const entry = path.join(root, 'entry.tsx')
  writeFileSync(
    entry,
    `import {View} from '@hozo/core';export const App=()=> <View className="p-2"/>`,
  )
  const output = await tinyBuild(root, transformed)
  const inventory = readInventory(root)
  assert.equal(inventory.status, 'complete')
  assert.equal(inventory.usesTailwind, true)
  assert.deepEqual(inventory.candidates, ['text-green-500'])
  assert.match(readFileSync(`${entry}.hozo.css`, 'utf8'), /padding-top: 8px/)
  assert.doesNotMatch(JSON.stringify(output), /hozo:runtime-candidates/)
})

test('real build re-enumerates authored files and discards absent derived modules between builds', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed)
  assert.ok(readInventory(root).candidates.includes('bg-red-500'))
  writeFileSync(path.join(root, 'entry.tsx'), source('p-4'))
  rmSync(path.join(root, 'unimported.tsx'))
  // Reuse the physical native cache; absent MDX observations must not keep
  // contributing merely because that cache once contained the source path.
  await tinyBuild(root, transformed)
  const next = readInventory(root)
  assert.equal(next.status, 'complete')
  assert.deepEqual(next.candidates, ['p-4'])
  assert.equal(next.authored.length, 1)
  assert.equal(next.modules.length, 1)
})

test('real build records mid-build authored mutations rather than claiming complete facts', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed, [
    {
      name: 'change-authored-inputs',
      buildEnd: {
        order: 'pre',
        handler() {
          writeFileSync(path.join(root, 'unimported.tsx'), source('text-red-500'))
          writeFileSync(path.join(root, 'new.tsx'), source('m-4'))
        },
      },
    },
  ])
  const result = readInventory(root)
  assert.equal(result.status, 'incomplete')
  assert.equal('candidates' in result, false)
  assert.ok(result.issues.some(({ id, kind }) => id.includes('unimported.tsx') && kind === 'stale'))
  assert.ok(result.issues.some(({ id, kind }) => id.includes('new.tsx') && kind === 'missing'))
})

test('failed real build does not leave the previous complete inventory as current evidence', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed)
  assert.equal(readInventory(root).status, 'complete')
  writeFileSync(path.join(root, 'entry.tsx'), `import './does-not-exist.tsx'`)
  await assert.rejects(tinyBuild(root, transformed), /does-not-exist/)
  const result = readInventory(root)
  assert.equal(result.status, 'failed')
  assert.equal('candidates' in result, false)
  assert.equal(result.finalOrderingReady, false)
})
