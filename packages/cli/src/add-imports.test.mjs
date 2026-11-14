// `hozo add <component> --imports` (RFC 012 §8): callers move from
// `@hozo/ui` to the copy.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runAdd } from './add.mjs'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(ui, 'package.json'), 'utf8')).version

function project(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-add-imports-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'node_modules', '@hozo'), { recursive: true })
  symlinkSync(ui, path.join(root, 'node_modules', '@hozo', 'ui'), 'junction')
  const all = {
    'package.json': JSON.stringify({ dependencies: { '@hozo/ui': version } }),
    '.gitignore': 'node_modules\n',
    ...files,
  }
  for (const [file, contents] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  return root
}

function commit(root) {
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', '-C', root, ...args],
      { stdio: 'ignore' },
    )
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'project')
}

async function add(root, ...argv) {
  const io = {
    stdout: {
      output: '',
      write(value) {
        this.output += value
      },
    },
  }
  const result = await runAdd(argv, io, root)
  return { ...result, output: io.stdout.output }
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8')

const APP = `import { Text } from '@hozo/core';
import { Button, Card } from '@hozo/ui';

export const App = () => <Card><Button>Save</Button></Card>;
`

test('--imports moves the copied component and keeps the rest of the statement', async (t) => {
  const root = project(t, { 'src/app.tsx': APP })
  const dry = await add(root, 'button', '--imports')
  assert.match(dry.output, /Would move the imports in src\/app\.tsx/)
  assert.equal(read(root, 'src/app.tsx'), APP)

  commit(root)
  const result = await add(root, 'button', '--imports', '--write', '--format', 'json')
  assert.equal(result.exit, 0)
  assert.deepEqual(JSON.parse(result.output).importsMoved, ['src/app.tsx'])
  // The other name stays with @hozo/ui; the quotes and semicolons are the file's.
  assert.equal(
    read(root, 'src/app.tsx'),
    APP.replace(
      "import { Button, Card } from '@hozo/ui';",
      "import { Card } from '@hozo/ui';\nimport { HozoButton as Button } from './components/ui/button';",
    ),
  )
  assert.ok(existsSync(path.join(root, 'src/components/ui/button.tsx')))
  // Nothing is left to move.
  const again = await add(root, 'button', '--imports', '--write')
  assert.doesNotMatch(again.output, /imports in/)
})

test('a statement of only moved names is replaced; aliases, types, quotes and depth are kept', async (t) => {
  const root = project(t, {
    'src/screens/save/index.tsx': `import {
  Button as B,
  type ButtonProps,
} from "@hozo/ui"
import { Text } from "@hozo/core"
export const Save = (props: ButtonProps) => <B {...props} />
`,
    'src/badge.tsx': "import { Badge, Alert } from '@hozo/ui'\nexport const x = [Badge, Alert]\n",
  })
  commit(root)
  assert.equal((await add(root, 'button', 'badge', '--imports', '--write')).exit, 0)
  assert.equal(
    read(root, 'src/screens/save/index.tsx'),
    `import { HozoButton as B, type HozoButtonProps as ButtonProps } from "../../components/ui/button"
import { Text } from "@hozo/core"
export const Save = (props: ButtonProps) => <B {...props} />
`,
  )
  // Badge and Alert both live in status.tsx: one import from the copy.
  assert.equal(
    read(root, 'src/badge.tsx'),
    "import { HozoBadge as Badge, HozoAlert as Alert } from './components/ui/status'\nexport const x = [Badge, Alert]\n",
  )
})

test('a caller Git has no copy of is not rewritten, and nothing is written', async (t) => {
  const root = project(t, { 'src/app.tsx': APP })
  commit(root)
  writeFileSync(path.join(root, 'src/app.tsx'), `${APP}// work in progress\n`)
  const refused = await add(root, 'button', '--imports', '--write')
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'uncommitted-changes')
  assert.match(refused.error.message, /src\/app\.tsx/)
  assert.equal(read(root, 'src/app.tsx'), `${APP}// work in progress\n`)
  assert.ok(!existsSync(path.join(root, 'src/components/ui/button.tsx')))
  assert.equal((await add(root, 'button', '--imports', '--write', '--force')).exit, 0)
})

test('with every import moved, add says @hozo/ui can be removed', async (t) => {
  const root = project(t, { 'src/app.tsx': "import { Button } from '@hozo/ui'\n" })
  commit(root)
  const report = JSON.parse(
    (await add(root, 'button', '--imports', '--write', '--format', 'json')).output,
  )
  assert.equal(report.uiRemovable, true)
})
