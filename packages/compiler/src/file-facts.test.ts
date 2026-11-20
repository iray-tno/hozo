// Decision 014: one record per file, from the scan's one read. The channels
// derived from records give the answer reading the source gave, and read
// nothing again.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { FileFactStore, fileFacts } from './file-facts.ts'
import {
  classHelperCandidates,
  inspectStaticModuleImports,
  scanTailwindOrderCandidates,
  summarizeClassHelperMerges,
  summarizeClassHelpers,
  summarizeTextForwarding,
} from './index.ts'
import {
  FILE_FACTS_FILE,
  findClassHelpers,
  projectClassHelpers,
  projectTextForwarding,
  scanProject,
} from './project.ts'

function write(root: string, relative: string, text: string): string {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return path.resolve(file)
}

// A helper, a forwarding component behind a barrel, and a caller of both.
function app(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-file-facts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(root, 'package.json', JSON.stringify({ name: 'app' }))
  write(
    root,
    'src/lib/cn.ts',
    // A joiner as shadcn/ui writes it: arguments handed to one the compiler knows.
    "import { clsx } from 'clsx'\nexport function cn(...inputs: unknown[]) { return clsx(inputs) }\n",
  )
  write(
    root,
    'src/ui/label.tsx',
    "import { Pressable } from '@hozo/core'\n" +
      "export function Label({ tone = 'plain', children }: { tone?: 'plain' | 'loud'; children?: unknown }) {\n" +
      "  return <Pressable className={tone === 'loud' ? 'text-lg font-bold' : 'text-sm'}>{children}</Pressable>\n" +
      '}\n',
  )
  write(root, 'src/ui/index.ts', "export { Label } from './label'\n")
  const caller = write(
    root,
    'src/screen.tsx',
    "import { View, Text } from '@hozo/core'\nimport { cn } from './lib/cn'\nimport { Label } from './ui'\n" +
      'export const Screen = ({ on }: { on: boolean }) => (\n' +
      "  <View className={cn('p-4', on && 'bg-red-500')}><Label tone=\"loud\"><Text>Hi</Text></Label></View>\n" +
      ')\n',
  )
  return { root, caller }
}

test('one record holds what each pass read from the source', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // This package's own sources: a corpus of real, varied files.
  const files = readdirSync(here)
    .filter((name) => /\.tsx?$/.test(name))
    .slice(0, 40)
    .map((name) => path.join(here, name))
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const record = fileFacts(file, source, 1)
    assert.deepEqual(record.order, scanTailwindOrderCandidates(source), file)
    assert.deepEqual(
      record.imports,
      [...new Set(inspectStaticModuleImports(source, file).bindings.map((b) => b.source))],
      file,
    )
    assert.deepEqual(record.helperImports, classHelperCandidates(source), file)
    assert.deepEqual(record.helperExports, summarizeClassHelpers(source), file)
    assert.deepEqual(record.helperMerges, summarizeClassHelperMerges(source), file)
    assert.deepEqual(record.textForwarding, summarizeTextForwarding(source), file)
  }
})

test('class helpers and project text forwarding come from the scan records, with no read of their own', (t) => {
  const { root, caller } = app(t)
  const project = scanProject(root)
  const helpers = projectClassHelpers(root, project.files, project.facts)
  const forwarding = projectTextForwarding(root, project.files, project.facts)
  assert.equal(project.facts.reads, 0, 'every file the channels needed was in the walk')

  assert.deepEqual(helpers[caller], [{ module: './lib/cn', name: 'cn' }])
  const modules = forwarding.importers[caller]!
  assert.deepEqual(
    modules.map((module) => module.module),
    ['./ui'],
  )
  assert.deepEqual(
    modules[0]!.components.map((component) => component.name),
    ['Label'],
  )
  // Through the barrel to the definition, as a manifest is built.
  assert.deepEqual(
    forwarding.sources.map((file) => path.relative(root, file).replaceAll('\\', '/')),
    ['src/ui/index.ts', 'src/ui/label.tsx'],
  )

  // The same answers as reading each file here, which is what no store gives.
  assert.deepEqual(projectClassHelpers(root, project.files), helpers)
  assert.deepEqual(projectTextForwarding(root, project.files), forwarding)
})

test("a bundler's per-transform helper lookup reads the helper's record, not the file", async (t) => {
  const { root, caller } = app(t)
  const project = scanProject(root)
  const resolve = async (specifier: string) =>
    specifier === './lib/cn' ? path.join(root, 'src', 'lib', 'cn.ts') : undefined
  // The module's own imports come from the code the bundler holds.
  const code = readFileSync(caller, 'utf8')
  const found = await findClassHelpers(code, caller, resolve, undefined, project.facts)
  assert.deepEqual(found, [{ module: './lib/cn', name: 'cn' }])
  assert.equal(project.facts.reads, 0)
  // Without a store, the same answer, read here.
  assert.deepEqual(await findClassHelpers(code, caller, resolve), found)
})

test('records persist with the scan, so an unchanged project reads nothing', (t) => {
  const { root } = app(t)
  scanProject(root)
  const stored = JSON.parse(
    readFileSync(path.join(root, 'node_modules', '.hozo', FILE_FACTS_FILE), 'utf8'),
  )
  assert.equal(Object.keys(stored.files).length, 4)
  const again = scanProject(root)
  assert.equal(again.stats.scannedFiles, 0)
  projectClassHelpers(root, again.files, again.facts)
  projectTextForwarding(root, again.files, again.facts)
  assert.equal(again.facts.reads, 0)
})

test('a file the channels need from outside the walk gets a record the same way', (t) => {
  const { root, caller } = app(t)
  // Out of the walk: an explicit include that leaves the helper out.
  const project = scanProject(root, { include: ['src/screen.tsx', 'src/ui/**'] })
  assert.ok(!project.files.includes(path.join(root, 'src', 'lib', 'cn.ts')))
  const helpers = projectClassHelpers(root, project.files, project.facts)
  assert.deepEqual(helpers[caller], [{ module: './lib/cn', name: 'cn' }])
  assert.equal(project.facts.reads, 1, 'the helper, read once, on demand')
  projectClassHelpers(root, project.files, project.facts)
  assert.equal(project.facts.reads, 1, 'and recorded')
})

test('an older schema is recomputed rather than trusted', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-file-facts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const store = path.join(root, 'facts.json')
  const file = write(root, 'a.ts', 'export const a = "p-4"\n')
  writeFileSync(store, JSON.stringify({ schema: 0, files: { [file]: { modifiedMs: 0 } } }))
  const facts = new FileFactStore(store)
  assert.deepEqual(facts.get(file)?.order, scanTailwindOrderCandidates('export const a = "p-4"\n'))
  assert.equal(facts.reads, 1)
})
