import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { planImportFix, sourceEdits } from './fix.mjs'
import { AuditInputError, measureRealApp, runCli } from './index.mjs'

const APP = `import { View, Text, Pressable, Platform, Keyboard, Linking } from 'react-native'
export const App = () => <View><Pressable onPress={Keyboard.dismiss}><Text>{Platform.OS}</Text></Pressable></View>
export const open = () => Linking.openURL('x')
`
const UTIL = `// keep me
import { Platform, Linking } from 'react-native'
import type { ViewStyle } from 'react-native'
import { Dimensions as D,
  Keyboard } from 'react-native'
export const x = [Platform.OS, D.get('window'), Keyboard, Linking]
`
const NATIVE = `import { Platform } from 'react-native'
export const os = Platform.OS
`

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

function checkout(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-fix-'))
  mkdirSync(path.join(root, 'src'))
  for (const [name, source] of Object.entries(files))
    writeFileSync(path.join(root, 'src', name), source)
  git(root, 'init', '-q')
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.')
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
  return root
}

function cli(argv) {
  let out = ''
  return runCli(argv, { stdout: { write: (text) => (out += text), isTTY: false } }).then(
    (plan) => ({ plan, out }),
  )
}

test('a dry run prints a diff that git applies to exactly what --write writes, and writes nothing', async () => {
  const root = checkout({ 'App.tsx': APP, 'util.ts': UTIL, 'Native.native.tsx': NATIVE })
  try {
    const { out } = await cli([root, '--fix'])
    assert.equal(readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8'), APP)
    assert.match(out, /Would change 2 of 3 files/)
    assert.match(out, /Native-only, left as is: 1/)
    assert.match(out, /Add @hozo\/rn-compat/)
    assert.match(out, /Run again with --write/)

    const diff = out.slice(0, out.indexOf('\n\nWould change'))
    writeFileSync(path.join(root, 'fix.diff'), `${diff}\n`)
    git(root, 'apply', '--unidiff-zero', 'fix.diff')
    const applied = ['App.tsx', 'util.ts'].map((name) =>
      readFileSync(path.join(root, 'src', name), 'utf8'),
    )
    git(root, 'checkout', '--', 'src')

    await cli([root, '--fix', '--write'])
    const written = ['App.tsx', 'util.ts'].map((name) =>
      readFileSync(path.join(root, 'src', name), 'utf8'),
    )
    assert.deepEqual(written, applied)
    assert.equal(
      written[1],
      `// keep me
import { Linking } from 'react-native'
import { Platform } from '@hozo/rn-compat'
import type { ViewStyle } from 'react-native'
import { Dimensions as D, Keyboard } from '@hozo/rn-compat'
export const x = [Platform.OS, D.get('window'), Keyboard, Linking]
`,
    )
    // Components stay: on Native, @hozo/core's are Hozo's own.
    assert.match(written[0], /^import \{ View, Text, Pressable, Linking \} from 'react-native'\n/)
    assert.equal(readFileSync(path.join(root, 'src', 'Native.native.tsx'), 'utf8'), NATIVE)

    // A second run has nothing left to move.
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'fix')
    const again = await cli([root, '--fix', '--write'])
    assert.match(again.out, /Wrote 0 of 3 files/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the moves are the ones the audit reports for the same files', async () => {
  const root = checkout({ 'App.tsx': APP, 'util.ts': UTIL })
  try {
    const report = await measureRealApp({ root })
    const audited = Object.fromEntries(
      report.files.map((file) => [
        file.file,
        file.targets.web.reactNativeImports.outcomes
          .filter((outcome) => outcome.replacement === '@hozo/rn-compat')
          .map((outcome) => file.reactNativeUsage.bindings[outcome.bindingIndex].imported)
          .sort(),
      ]),
    )
    const planned = Object.fromEntries(
      planImportFix(
        root,
        report.files.map((file) => path.join(root, file.file)),
      ).map((entry) => [entry.file, [...entry.moved].sort()]),
    )
    assert.deepEqual(planned, audited)
    assert.deepEqual(planned['src/util.ts'], ['Dimensions', 'Keyboard', 'Platform'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--write leaves a file with uncommitted changes alone unless forced', async () => {
  const root = checkout({ 'util.ts': UTIL })
  try {
    const edited = `${UTIL}// mine\n`
    writeFileSync(path.join(root, 'src', 'util.ts'), edited)
    await assert.rejects(cli([root, '--fix', '--write']), (error) => {
      assert.ok(error instanceof AuditInputError)
      assert.match(error.message, /uncommitted changes in src\/util\.ts/)
      return true
    })
    assert.equal(readFileSync(path.join(root, 'src', 'util.ts'), 'utf8'), edited)
    await cli([root, '--fix', '--write', '--force'])
    assert.match(readFileSync(path.join(root, 'src', 'util.ts'), 'utf8'), /@hozo\/rn-compat/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--write and --force are refused without --fix', async () => {
  await assert.rejects(cli(['.', '--write']), /only apply to --fix/)
})

test('edits keep the file line endings and add no blank line', () => {
  const original = "import { Platform } from 'react-native'\r\nPlatform.OS\r\n"
  const end = original.indexOf('\r\n')
  const [edit] = sourceEdits(original, [
    { spanStart: 0, spanEnd: end, replacement: "import { Platform } from '@hozo/rn-compat'\n" },
  ])
  assert.equal(edit.replacement, "import { Platform } from '@hozo/rn-compat'")
  const [split] = sourceEdits(original, [
    {
      spanStart: 0,
      spanEnd: end,
      replacement: "import { A } from 'react-native'\nimport { Platform } from '@hozo/rn-compat'\n",
    },
  ])
  assert.equal(
    split.replacement,
    "import { A } from 'react-native'\r\nimport { Platform } from '@hozo/rn-compat'",
  )
})

test('every API the fix moves is React Native’s own object on Native', async () => {
  // The safety argument for writing a Web-only build move into shared
  // source: under its `react-native` condition, @hozo/rn-compat hands back
  // React Native's own export, so Native sees no change. Checked against the
  // source, so a new owned API with a Hozo implementation on Native fails
  // here before the codemod moves it.
  const { reactNativeImportFix } = await import('@hozo/compiler/analysis')
  const entry = readFileSync(
    new URL('../../rn-compat/src/index.native.ts', import.meta.url),
    'utf8',
  )
  const names = [...entry.matchAll(/^export const (\w+)/gm)].map((match) => match[1])
  const { decisions } = reactNativeImportFix(
    `import { ${names.join(', ')} } from 'react-native'\n`,
    'probe.ts',
  )
  const moved = decisions
    .filter((decision) => decision.disposition === 'rewritten-to-hozo')
    .map((decision) => decision.imported)
  assert.ok(moved.length >= 8, moved.join(', '))
  for (const name of moved) {
    assert.match(
      entry,
      new RegExp(
        String.raw`^export const ${name}(?:: typeof ReactNative\.${name})? = ReactNative\.${name}$`,
        'm',
      ),
      name,
    )
  }
})
