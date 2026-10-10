import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readAnalysisAliases } from './analysis-config.ts'

function fixture(t: test.TestContext, files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-config-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), source)
  }
  return root
}
const link = (target: string, directory: string) =>
  symlinkSync(target, directory, process.platform === 'win32' ? 'junction' : 'dir')
const paths = (root: string) => {
  const result = readAnalysisAliases(root)
  assert.equal(result.fact.status, 'resolved', JSON.stringify(result.fact))
  return result.fact.value.paths
}

test('scoped explicit package config, relative parents and child paths stay read-only', (t) => {
  const root = fixture(t, {
    'tsconfig.json':
      '{"extends":"@rn/config/tsconfig.json", "compilerOptions":{"paths":{"#/*":["src/*"]},"plugins":[{"name":"./execute.cjs"}]}}',
    'node_modules/@rn/config/package.json': '{"main":"./execute.cjs"}',
    'node_modules/@rn/config/tsconfig.json':
      '{ // JSONC\n "extends":"./defaults", "compilerOptions":{"strict":true}, }',
    'node_modules/@rn/config/defaults.json': '{"compilerOptions":{"jsx":"react-native"}}',
    'execute.cjs': `require('node:fs').writeFileSync(require('node:path').join(__dirname, 'EXECUTED'), 'executed')`,
  })
  const snapshot = readdirSync(root, { recursive: true }).map((file) => String(file))
  const result = readAnalysisAliases(root)
  assert.equal(result.fact.status, 'resolved')
  assert.deepEqual(result.fact.value.paths, { '#/*': [path.join(root, 'src/*')] })
  assert.deepEqual(
    result.inputs.map(({ file }) => path.relative(root, file).replaceAll('\\', '/')),
    [
      'tsconfig.json',
      'node_modules/@rn/config/package.json',
      'node_modules/@rn/config/tsconfig.json',
      'node_modules/@rn/config/defaults.json',
    ],
  )
  for (const input of result.inputs)
    assert.equal(input.sha256, createHash('sha256').update(readFileSync(input.file)).digest('hex'))
  assert.deepEqual(
    readdirSync(root, { recursive: true }).map((file) => String(file)),
    snapshot,
  )
})

test('package tsconfig field, default and extensionless subpaths select data, never main', (t) => {
  for (const [specifier, manifest, selected] of [
    ['preset', '{"tsconfig":"./configs/base.json","main":"./execute.cjs"}', 'configs/base.json'],
    ['preset', '{"main":"./execute.cjs"}', 'tsconfig.json'],
    ['preset/tsconfig.base', '{"tsconfig":"./wrong.json"}', 'tsconfig.base.json'],
  ]) {
    const root = fixture(t, {
      'tsconfig.json': JSON.stringify({ extends: specifier }),
      'node_modules/preset/package.json': manifest!,
      [`node_modules/preset/${selected}`]: '{"compilerOptions":{"paths":{"@/*":["./tokens/*"]}}}',
      'node_modules/preset/execute.cjs': 'throw new Error("executable entry must never run")',
    })
    const result = readAnalysisAliases(root)
    assert.equal(result.fact.status, 'resolved', JSON.stringify(result.fact))
    assert.deepEqual(result.fact.value.paths['@/*'], [
      path.join(root, 'node_modules/preset', path.dirname(selected!), 'tokens/*'),
    ])
    assert.equal(result.inputs.length, 3)
  }
})

test('lookup climbs within the checkout and nearest installed config shadows its ancestor', (t) => {
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"./config/child"}',
    'config/child.json': '{"extends":"preset"}',
    'config/node_modules/preset/tsconfig.json':
      '{"compilerOptions":{"paths":{"near":["./near.ts"]}}}',
    'node_modules/preset/tsconfig.json': '{"compilerOptions":{"paths":{"far":["./far.ts"]}}}',
  })
  assert.deepEqual(paths(root), { near: [path.join(root, 'config/node_modules/preset/near.ts')] })
  rmSync(path.join(root, 'config/node_modules/preset/tsconfig.json'))
  const missing = readAnalysisAliases(root)
  assert.equal(
    missing.fact.status,
    'unresolved',
    'a broken nearest package is not guessed into an outer package',
  )
  assert.equal(missing.inputs.length, 2)
})

test('inherited paths use their declaring origin unless an effective baseUrl overrides it', (t) => {
  for (const [parent, child, expected] of [
    [{ paths: { '@/*': ['tokens/*'] } }, {}, 'configs/tokens/*'],
    [{ paths: { '@/*': ['tokens/*'] } }, { baseUrl: './app' }, 'app/tokens/*'],
    [{ baseUrl: '..', paths: { '@/*': ['tokens/*'] } }, {}, 'tokens/*'],
    [{ baseUrl: '..', paths: { '@/*': ['tokens/*'] } }, { baseUrl: './app' }, 'app/tokens/*'],
    [{ baseUrl: '..' }, { paths: { '@/*': ['child/*'] } }, 'child/*'],
    [{ paths: { '@/*': ['parent/*'] } }, { paths: { '@/*': ['child/*'] } }, 'child/*'],
  ] as const) {
    const root = fixture(t, {
      'tsconfig.json': JSON.stringify({ extends: './configs/base', compilerOptions: child }),
      'configs/base.json': JSON.stringify({ compilerOptions: parent }),
    })
    assert.deepEqual(paths(root)['@/*'], [path.join(root, expected)])
  }
})

test('missing installed packages are unresolved without resolving audit dependencies or ancestors', (t) => {
  const outside = fixture(t, {
    'node_modules/preset/tsconfig.json': '{}',
    'app/tsconfig.json': '{"extends":"preset"}',
  })
  const result = readAnalysisAliases(path.join(outside, 'app'))
  assert.equal(result.fact.status, 'unresolved')
  assert.equal(result.inputs.length, 1)
  const root = fixture(t, { 'tsconfig.json': '{"extends":"jsonc-parser"}' })
  const toolDependency = readAnalysisAliases(root)
  assert.equal(toolDependency.fact.status, 'unresolved')
  assert.match(toolDependency.fact.reason, /not installed inside checkout/)
})

test('internal directory links work but external/missing-target links cannot load outside bytes', (t) => {
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"preset"}',
    'node_modules/.pnpm/preset/node_modules/preset/package.json': '{}',
    'node_modules/.pnpm/preset/node_modules/preset/tsconfig.json': '{}',
  })
  const packageRoot = path.join(root, 'node_modules/preset')
  link(path.join(root, 'node_modules/.pnpm/preset/node_modules/preset'), packageRoot)
  assert.equal(readAnalysisAliases(root).fact.status, 'resolved')
  const outside = fixture(t, { 'tsconfig.json': '{}', 'package.json': '{}' })
  for (const specifier of ['external', 'external/missing.json']) {
    const guarded = fixture(t, { 'tsconfig.json': JSON.stringify({ extends: specifier }) })
    mkdirSync(path.join(guarded, 'node_modules'))
    link(outside, path.join(guarded, 'node_modules/external'))
    const result = readAnalysisAliases(guarded)
    assert.equal(result.fact.status, 'unsupported')
    assert.equal(result.inputs.length, 1)
    assert.match(result.fact.reason, /outside checkout/)
  }
})

test('package-selected absolute/traversal escape stays outside the read boundary', (t) => {
  const outside = fixture(t, { 'config.json': '{}', 'package.json': '{}' })
  for (const config of [path.join(outside, 'config.json'), '../../../outside.json']) {
    const root = fixture(t, {
      'tsconfig.json': '{"extends":"preset"}',
      'node_modules/preset/package.json': JSON.stringify({ tsconfig: config }),
    })
    const result = readAnalysisAliases(root)
    assert.equal(result.fact.status, 'unsupported')
    assert.equal(result.inputs.length, 2, 'only root config and manifest bytes were loaded')
  }
})

test('pnpm package configs resolve their own transitive preset from the physical package location', (t) => {
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"preset"}',
    'node_modules/.pnpm/preset/node_modules/preset/package.json': '{}',
    'node_modules/.pnpm/preset/node_modules/preset/tsconfig.json': '{"extends":"other"}',
    'node_modules/.pnpm/preset/node_modules/other/package.json': '{}',
    'node_modules/.pnpm/preset/node_modules/other/tsconfig.json':
      '{"compilerOptions":{"paths":{"nested":["./nested.ts"]}}}',
    'node_modules/other/tsconfig.json': '{"compilerOptions":{"paths":{"wrong":["./wrong.ts"]}}}',
  })
  link(
    path.join(root, 'node_modules/.pnpm/preset/node_modules/preset'),
    path.join(root, 'node_modules/preset'),
  )
  assert.deepEqual(paths(root), {
    nested: [path.join(root, 'node_modules/.pnpm/preset/node_modules/other/nested.ts')],
  })
  assert.ok(
    readAnalysisAliases(root).inputs.every(
      ({ file }) => file !== path.join(root, 'node_modules/other/tsconfig.json'),
    ),
  )
})

test('a manifest file link cannot load outside bytes', (t) => {
  const outside = fixture(t, { 'package.json': '{}' })
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"preset"}',
    'node_modules/preset/tsconfig.json': '{}',
  })
  try {
    symlinkSync(
      path.join(outside, 'package.json'),
      path.join(root, 'node_modules/preset/package.json'),
      'file',
    )
  } catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('File symlinks need Windows privilege; directory-junction boundary tests still run.')
      return
    }
    throw error
  }
  const result = readAnalysisAliases(root)
  assert.equal(result.fact.status, 'unsupported')
  assert.equal(result.inputs.length, 1)
})

test('manifest changes are fresh configuration inputs, including a tsconfig entry change', (t) => {
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"preset"}',
    'node_modules/preset/package.json': '{"tsconfig":"./one.json"}',
    'node_modules/preset/one.json': '{"compilerOptions":{"paths":{"one":["one.ts"]}}}',
    'node_modules/preset/two.json': '{"compilerOptions":{"paths":{"two":["two.ts"]}}}',
  })
  const before = readAnalysisAliases(root)
  writeFileSync(path.join(root, 'node_modules/preset/package.json'), '{"tsconfig":"./two.json"}')
  const after = readAnalysisAliases(root)
  assert.equal(before.fact.status, 'resolved')
  assert.equal(after.fact.status, 'resolved')
  assert.notDeepEqual(after.fact.value.paths, before.fact.value.paths)
  assert.notEqual(after.inputs[1]!.sha256, before.inputs[1]!.sha256)
  assert.match(after.inputs[2]!.file, /two.json$/)
})

test('unsupported shapes do not become absent or a default-alias success', (t) => {
  const configDir = '$' + '{configDir}'
  for (const [config, manifest, expected] of [
    ['{"extends":["preset"]}', '{}', 'unsupported'],
    ['{"extends":"https://example.test/config.json"}', '{}', 'unsupported'],
    ['{"extends":"preset/../secret"}', '{}', 'unsupported'],
    ['{"extends":"preset"}', '{"exports":{".":"./tsconfig.json"}}', 'unsupported'],
    ['{"extends":"preset"}', '{"tsconfig":"./execute.cjs"}', 'unsupported'],
    ['{"extends":"preset"}', JSON.stringify({ tsconfig: `${configDir}/base.json` }), 'unsupported'],
    [JSON.stringify({ compilerOptions: { baseUrl: configDir } }), '{}', 'unsupported'],
    [
      JSON.stringify({ compilerOptions: { paths: { '@/*': [`${configDir}/*`] } } }),
      '{}',
      'unsupported',
    ],
    ['{"extends":false}', '{}', 'invalid'],
    ['{"extends":"preset"}', '{"tsconfig":false}', 'invalid'],
    ['{"extends":"preset"}', '{"tsconfig":null}', 'invalid'],
    ['{"extends":"preset"}', '{"tsconfig":0}', 'invalid'],
    ['{"extends":"preset"}', '{"tsconfig":""}', 'invalid'],
    ['{"extends":"preset"}', '{ broken', 'invalid'],
  ] as const) {
    const root = fixture(t, {
      'tsconfig.json': config,
      'node_modules/preset/package.json': manifest,
      'node_modules/preset/tsconfig.json': '{}',
      'node_modules/preset/execute.cjs': 'throw new Error("must not execute")',
    })
    assert.equal(readAnalysisAliases(root).fact.status, expected, config + manifest)
  }
})

test('JSONC prototype setters cannot inject inherited configuration facts', (t) => {
  for (const config of [
    '{"__proto__":{"compilerOptions":{"baseUrl":"./injected"}}}',
    '{"compilerOptions":{"__proto__":{"paths":{"injected":["./injected.ts"]}}}}',
    '{"compilerOptions":{"paths":{"__proto__":null}}}',
  ]) {
    const root = fixture(t, { 'tsconfig.json': config })
    const result = readAnalysisAliases(root)
    assert.equal(result.fact.status, 'invalid')
    assert.equal(result.inputs.length, 1, 'invalid authored bytes remain evidence')
  }
})

test('physical config cycles and excessive chains fail with retained evidence', (t) => {
  const root = fixture(t, {
    'tsconfig.json': '{"extends":"preset"}',
    'node_modules/preset/tsconfig.json': '{"extends":"../../tsconfig.json"}',
  })
  const cycle = readAnalysisAliases(root)
  assert.equal(cycle.fact.status, 'invalid')
  assert.match(cycle.fact.reason, /Cyclic/)
  assert.equal(cycle.inputs.length, 2)
  const files: Record<string, string> = { 'tsconfig.json': '{"extends":"./level0"}' }
  for (let index = 0; index < 33; index++)
    files[`level${index}.json`] =
      index === 32 ? '{}' : JSON.stringify({ extends: `./level${index + 1}` })
  const excessive = readAnalysisAliases(fixture(t, files))
  assert.equal(excessive.fact.status, 'invalid')
  assert.match(excessive.fact.reason, /excessive/)
  assert.equal(excessive.inputs.length, 32)
})
