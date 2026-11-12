import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { formatJsx } from '@hozo/compiler/format-jsx'
import { run } from './index.mjs'

const capture = () => {
  const stream = {
    output: '',
    write(value) {
      stream.output += value
    },
  }
  return stream
}

function project(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-show-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, contents] of Object.entries({ 'package.json': '{}', ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  return root
}

async function show(...argv) {
  const io = { stdout: capture(), stderr: capture() }
  const exit = await run(['show', ...argv], io)
  return { exit, stdout: io.stdout.output, stderr: io.stderr.output }
}

const CARD = `import { View, Text } from '@hozo/core'

export function Card() {
  return (
    <View className="p-4 bg-brand hover:p-2">
      <Text className="text-xl font-bold">Sales</Text>
    </View>
  )
}
`

test('without a project theme, show prints what the REPL prints', async (t) => {
  const root = project(t, { 'src/Card.tsx': CARD })
  const { exit, stdout } = await show(path.join(root, 'src/Card.tsx'), '--format', 'json')
  assert.equal(exit, 0)
  const report = JSON.parse(stdout)
  assert.equal(report.file, 'src/Card.tsx')
  assert.equal(report.theme.status, 'default')
  // The REPL's two calls, with no theme: `hozo_wasm` answers as this binding
  // does (packages/tailwind-conformance/src/wasm-binding.test.ts).
  const compiler = createCompiler()
  const [web] = compiler.compile(CARD)
  const [native] = compiler.compileNative(CARD)
  assert.equal(report.web[0].jsx, web.jsx)
  assert.equal(report.web[0].css, web.css)
  assert.equal(report.native[0].jsx, native.jsx)
  assert.equal(report.native[0].styles, native.styles)
  // `bg-brand` is not in Tailwind's default theme: no value to compile in.
  assert.doesNotMatch(report.web[0].css, /#123456/)

  // The text report lays the JSX out as the REPL's panes do.
  const text = (await show(path.join(root, 'src/Card.tsx'))).stdout
  const indented = (code) => code.replace(/^/gm, '  ')
  assert.ok(text.includes(`\nWeb JSX\n${indented(formatJsx(web.jsx))}\n\n`), text)
  assert.ok(text.includes(`\nReact Native JSX\n${indented(formatJsx(native.jsx))}\n\n`), text)
  assert.ok(formatJsx(web.jsx).split('\n').length > 1)
})

test("with the project's stylesheet, its theme compiles in", async (t) => {
  const root = project(t, {
    'src/Card.tsx': CARD,
    'src/index.css': '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n',
  })
  const file = path.join(root, 'src/Card.tsx')
  const { exit, stdout } = await show(file, '--format', 'json')
  assert.equal(exit, 0)
  const report = JSON.parse(stdout)
  assert.deepEqual(report.theme, { status: 'resolved', css: 'src/index.css' })
  assert.match(report.web[0].css, /#123456/)
  assert.match(report.native[0].styles, /#123456/)

  // The text report: one heading per output, then each diagnostic once,
  // naming the backends that raised it. `hover:` on a View is Native's.
  const text = await show(file)
  assert.match(text.stdout, /^hozo show: src\/Card\.tsx \(theme: src\/index\.css\)\n/)
  for (const heading of ['Web JSX', 'Web CSS', 'React Native JSX', 'React Native StyleSheet'])
    assert.match(text.stdout, new RegExp(`\\n${heading}\\n {2}\\S`))
  assert.match(text.stdout, /\nDiagnostics\n {2}error {3}5:\d+ \w+ \(native\)\n/)

  // One platform, and a failing policy.
  const web = await show(file, '--web', '--fail-on', 'error')
  assert.equal(web.exit, 0)
  assert.doesNotMatch(web.stdout, /React Native/)
  const native = await show(file, '--native', '--fail-on', 'error')
  assert.equal(native.exit, 1)
  assert.doesNotMatch(native.stdout, /\nWeb JSX\n/)
  assert.equal(native.stderr, 'hozo show: 1 diagnostic at or above error.\n')
})

test('--css names the stylesheet, and one that cannot be read exits 2', async (t) => {
  const root = project(t, {
    'src/Card.tsx': CARD,
    'theme/brand.css': '@import "tailwindcss";\n@theme { --color-brand: #654321; }\n',
  })
  const file = path.join(root, 'src/Card.tsx')
  const named = JSON.parse(
    (await show(file, '--css', 'theme/brand.css', '--format', 'json')).stdout,
  )
  assert.deepEqual(named.theme, { status: 'resolved', css: 'theme/brand.css' })
  assert.match(named.web[0].css, /#654321/)

  for (const [argv, code] of [
    [[file, '--css', 'missing.css'], 'invalid-css'],
    [[], 'missing-file'],
    [[path.join(root, 'src/Missing.tsx')], 'file-not-found'],
    [[file, '--web', '--native'], 'invalid-option'],
    [[file, '--fail-on', 'sometimes'], 'invalid-option'],
    [[file, '--css'], 'missing-value'],
    [[file, file], 'unexpected-argument'],
  ]) {
    const result = await show(...argv)
    assert.equal(result.exit, 2, argv.join(' '))
    assert.match(result.stderr, new RegExp(`^hozo show: .* \\[${code}\\]\\n$`), argv.join(' '))
  }
})

const LISTS = `import { View, Text, Pressable } from '@hozo/core'
export function A({ x }) {
  return (
    <View className="p-4 bg-brand bg-nope grid not-a-class">
      <Text className={x ? 'text-red-500' : 'text-sm'}>a</Text>
      <Pressable className={x}><Text className="font-bold transition">b</Text></Pressable>
    </View>
  )
}
`

test('class lists: the route of each, and what became of each class', async (t) => {
  const root = project(t, {
    'src/A.tsx': LISTS,
    'src/index.css': '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n',
  })
  const file = path.join(root, 'src/A.tsx')
  const report = JSON.parse((await show(file, '--format', 'json')).stdout)
  assert.equal(report.classLists.status, 'assessed')
  const lists = report.classLists.lists
  assert.deepEqual(
    lists.map(({ line, column, route }) => [line, column, route]),
    [
      [4, 11, 'compiled'],
      [5, 13, 'compiled-conditional'],
      [6, 7, 'runtime'],
      [6, 38, 'compiled'],
    ],
  )
  const outcome = (list, name) => {
    const { web, native } = list.classes.find((entry) => entry.class === name)
    return [web, native]
  }
  // Compiled on both; in the project's theme; nowhere in it; refused by
  // React Native; and not Tailwind's at all.
  assert.deepEqual(outcome(lists[0], 'p-4'), ['compiled', 'compiled'])
  assert.deepEqual(outcome(lists[0], 'bg-brand'), ['compiled', 'compiled'])
  assert.deepEqual(outcome(lists[0], 'bg-nope'), ['not-generated', 'not-generated'])
  // `grid` alone has no React Native style, but on a View it becomes HozoGrid.
  assert.deepEqual(outcome(lists[0], 'grid'), ['compiled', 'compiled'])
  assert.deepEqual(outcome(lists[0], 'not-a-class'), ['passed-through', 'ignored'])
  assert.match(lists[3].classes.find((entry) => entry.class === 'transition').reason, /transition/)
  assert.ok(lists[1].classes.every((entry) => entry.conditional))
  assert.deepEqual(outcome(lists[3], 'transition'), ['compiled', 'refused'])

  // The text names each list, and only the classes not compiled everywhere.
  const text = (await show(file)).stdout
  assert.match(
    text,
    /\nClass lists\n {2}4:11 className: compiled; 3 of 5 classes compiled\n {4}bg-nope: Web not-generated, Native not-generated -- /,
  )
  assert.match(text, /\n {2}6:7 className: resolved at runtime: the compiler cannot read it\n/)
  assert.doesNotMatch(text, /\n {4}p-4:/)

  // One platform reports that platform only.
  const web = JSON.parse((await show(file, '--web', '--format', 'json')).stdout)
  assert.deepEqual(
    web.classLists.lists[0].classes.find((entry) => entry.class === 'grid'),
    { class: 'grid', conditional: false, web: 'compiled' },
  )
})

test('class lists: a variant the element cannot answer on Native is not-wired there', async (t) => {
  const root = project(t, {
    'src/B.tsx': `import { View, Pressable } from '@hozo/core'
export const B = () => (
  <View className="p-2 md:hover:p-4">
    <Pressable className="hover:p-4" onPress={() => {}} />
  </View>
)
`,
  })
  const report = JSON.parse((await show(path.join(root, 'src/B.tsx'), '--format', 'json')).stdout)
  const [view, pressable] = report.classLists.lists
  const entry = (list, name) => list.classes.find((candidate) => candidate.class === name)
  assert.equal(entry(view, 'md:hover:p-4').native, 'not-wired')
  assert.match(entry(view, 'md:hover:p-4').reason, /^`hover:` is wired only on Pressable/)
  assert.equal(entry(view, 'md:hover:p-4').web, 'compiled')
  assert.equal(entry(view, 'p-2').native, 'compiled')
  // A Pressable answers `hover:`; its own list is not blamed for the View's.
  assert.equal(entry(pressable, 'hover:p-4').native, 'compiled')
})
