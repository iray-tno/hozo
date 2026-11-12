import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { run } from './index.mjs'
import { DEFAULT_CSS_FILES, SCAN_EXCLUDED_DIRECTORIES } from './square-config.mjs'

const capture = () => {
  const stream = {
    output: '',
    write(value) {
      stream.output += value
    },
  }
  return stream
}

/**
 * A project with the given `@hozo/*` packages installed at one version, and
 * the given files. The package checks pass, so only the config checks speak.
 */
function project(t, packages, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-square-config-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  write(
    'package.json',
    JSON.stringify({ dependencies: Object.fromEntries(packages.map((name) => [name, '0.4.0'])) }),
  )
  for (const name of packages)
    write(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '0.4.0' }))
  for (const [file, contents] of Object.entries(files)) write(file, contents)
  return root
}

async function square(root) {
  const io = { stdout: capture(), stderr: capture() }
  const exit = await run(['square', root, '--format', 'json', '--fail-on', 'warning'], io)
  const report = JSON.parse(io.stdout.output)
  return { exit, check: (id) => report.setup.find((check) => check.id === id) }
}

const codes = (check) => check.findings.map((finding) => finding.code)

const VITE = `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({ plugins: [hozo({ css: 'src/theme.css' }), react()] })
`
const THEME = '@import "tailwindcss";\n@theme { --color-brand: red; }\n'

test('a Vite project wired as the guide says passes every config check', async (t) => {
  const root = project(t, ['@hozo/core', '@hozo/vite', '@hozo/compiler'], {
    'vite.config.ts': VITE,
    'src/theme.css': THEME,
  })
  const { exit, check } = await square(root)
  assert.equal(exit, 0)
  assert.deepEqual(
    ['adapter', 'css', 'metro', 'scan'].map((id) => [id, check(id).status]),
    [
      ['adapter', 'passed'],
      ['css', 'passed'],
      ['metro', 'skipped'],
      ['scan', 'skipped'],
    ],
  )
  assert.equal(check('adapter').summary, 'vite.config.ts (@hozo/vite)')
  assert.equal(check('css').summary, 'src/theme.css')
  assert.match(check('scan').reason, /No candidate scan yet/)
})

test('adapter: not used, used before installing, React first, nowhere to go', async (t) => {
  const unused = project(t, ['@hozo/core', '@hozo/vite'], {
    'vite.config.ts':
      "import react from '@vitejs/plugin-react'\nexport default { plugins: [react()] }\n",
  })
  const result = await square(unused)
  assert.deepEqual(codes(result.check('adapter')), ['adapter-not-configured'])
  assert.equal(result.check('adapter').fatal, true)
  assert.match(result.check('adapter').findings[0].message, /does not use @hozo\/vite/)

  const reactFirst = project(t, ['@hozo/core'], {
    'vite.config.ts': VITE.replace(
      "hozo({ css: 'src/theme.css' }), react()",
      "react(), hozo({ css: 'src/theme.css' })",
    ),
    'src/theme.css': THEME,
  })
  const ordered = await square(reactFirst)
  assert.deepEqual(codes(ordered.check('adapter')), ['adapter-not-installed', 'plugin-order'])
  assert.equal(ordered.check('adapter').fatal, undefined)

  const noConfig = project(t, ['@hozo/core', '@hozo/next'])
  const nowhere = await square(noConfig)
  assert.deepEqual(codes(nowhere.check('adapter')), ['adapter-not-configured'])
  assert.match(
    nowhere.check('adapter').findings[0].message,
    /@hozo\/next is installed, but no bundler config/,
  )

  // A library compiled by its consumer has no bundler and no adapter.
  const library = await square(project(t, ['@hozo/core']))
  assert.equal(library.check('adapter').status, 'skipped')
  assert.equal(library.check('css').status, 'skipped')
  assert.equal(library.exit, 0)
})

test('css: missing, without Tailwind, without the @hozo/ui theme, or none at all', async (t) => {
  const missing = await square(project(t, ['@hozo/core', '@hozo/vite'], { 'vite.config.ts': VITE }))
  assert.deepEqual(codes(missing.check('css')), ['css-not-found'])
  assert.equal(missing.check('css').findings[0].severity, 'error')

  const bare = await square(
    project(t, ['@hozo/core', '@hozo/vite', '@hozo/ui'], {
      'vite.config.ts': VITE,
      'src/theme.css': '@theme { --color-brand: red; }\n',
    }),
  )
  assert.deepEqual(codes(bare.check('css')), ['css-no-tailwind', 'css-no-ui-theme'])

  // No option and none of the usual names: the default theme, as a warning.
  const none = await square(
    project(t, ['@hozo/core', '@hozo/vite'], {
      'vite.config.ts': VITE.replace("{ css: 'src/theme.css' }", ''),
    }),
  )
  assert.deepEqual(codes(none.check('css')), ['css-not-found'])
  assert.equal(none.check('css').findings[0].severity, 'warning')
  assert.equal(none.exit, 1) // under --fail-on warning

  // A usual name is found without the option, and a themed one passes.
  const found = await square(
    project(t, ['@hozo/core', '@hozo/vite', '@hozo/ui'], {
      'vite.config.ts': VITE.replace("{ css: 'src/theme.css' }", ''),
      'src/index.css': `${THEME}@import "@hozo/ui/theme.css";\n`,
    }),
  )
  assert.equal(found.check('css').status, 'passed')
  assert.equal(found.check('css').summary, 'src/index.css')
})

test('metro: a config changed after Metro saved its state asks for a restart', async (t) => {
  const root = project(t, ['@hozo/core', '@hozo/metro'], {
    'metro.config.js':
      "const { withHozo } = require('@hozo/metro/config')\nmodule.exports = withHozo({}, { css: 'global.css' })\n",
    'global.css': THEME,
    'node_modules/.hozo/metro.json': JSON.stringify({ css: 'global.css' }),
  })
  const past = new Date(Date.now() - 60_000)
  utimesSync(path.join(root, 'node_modules/.hozo/metro.json'), past, past)
  const stale = await square(root)
  assert.deepEqual(codes(stale.check('metro')), ['metro-state-stale'])
  assert.match(stale.check('metro').findings[0].fix, /--clear/)

  utimesSync(path.join(root, 'metro.config.js'), new Date(past - 60_000), new Date(past - 60_000))
  assert.equal((await square(root)).check('metro').status, 'passed')
})

test('scan: a file importing @hozo/* that the last scan did not read', async (t) => {
  const root = project(t, ['@hozo/core', '@hozo/vite'], {
    'vite.config.ts': VITE,
    'src/theme.css': THEME,
    'src/App.tsx': "import { View } from '@hozo/core'\nexport const App = () => <View />\n",
    'src/lazy.tsx': "const core = import('@hozo/core')\n",
    'stories/Card.tsx': "import { Text } from '@hozo/core'\n",
    'src/plain.ts': 'export const answer = 42\n',
    // Never scanned, so never compared.
    'dist/App.js': "import { View } from '@hozo/core'\n",
  })
  mkdirSync(path.join(root, 'node_modules/.hozo'))
  writeFileSync(
    path.join(root, 'node_modules/.hozo/candidates.json'),
    JSON.stringify({ version: 6, files: { [path.join(root, 'src', 'App.tsx')]: {} } }),
  )
  const past = new Date(Date.now() - 60_000)
  for (const file of ['src/App.tsx', 'src/lazy.tsx', 'stories/Card.tsx'])
    utimesSync(path.join(root, file), past, past)
  const { check } = await square(root)
  assert.deepEqual(
    check('scan').findings.map((finding) => finding.path),
    ['src/lazy.tsx', 'stories/Card.tsx'],
  )
  assert.equal(check('scan').summary, '1 of 3 files importing @hozo/* were in the last scan')

  // A file changed since the scan is not compared: the scan may not have run yet.
  utimesSync(path.join(root, 'stories/Card.tsx'), new Date(), new Date(Date.now() + 60_000))
  const later = (await square(root)).check('scan')
  assert.deepEqual(codes(later), ['not-scanned'])
  assert.match(later.summary, /1 changed since and were not compared/)
})

// The lists `square` cannot import without loading the packages they live in.
test('the CSS names and scan exclusions match the packages that define them', () => {
  const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
  const strings = (text, name) =>
    [
      ...new RegExp(String.raw`${name}\s*=\s*\[([^\]]*)\]`).exec(text)[1].matchAll(/'([^']+)'/g),
    ].map((match) => match[1])
  assert.deepEqual(
    strings(source('../../tailwind/src/project.ts'), 'DEFAULT_CSS_FILES'),
    DEFAULT_CSS_FILES,
  )
  assert.deepEqual(
    strings(source('../../compiler/src/project.ts'), 'DEFAULT_EXCLUDE').map((glob) =>
      glob.replace(/^\*\*\/|\/\*\*$/g, ''),
    ),
    SCAN_EXCLUDED_DIRECTORIES,
  )
})
