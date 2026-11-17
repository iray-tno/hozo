// `hozo init` (RFC 013) over the starters as they ship
// (scripts/fixtures/starters): what it installs, creates and edits, and what
// it refuses to touch.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInit } from './init.mjs'

const STARTERS = fileURLToPath(new URL('../../../scripts/fixtures/starters/', import.meta.url))
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

function starter(t, name, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), `hozo-init-${name}-`))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(path.join(STARTERS, name), root, { recursive: true })
  for (const [file, contents] of Object.entries(files)) {
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
  writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'starter')
}

/**
 * Stands in for the package manager: records each command and does what
 * it would to package.json and node_modules, so a second run sees them.
 */
function packageManager(root) {
  const commands = []
  return {
    commands,
    install(project, command) {
      commands.push(command.join(' '))
      const file = path.join(project, 'package.json')
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      const field = command.some((word) => ['-D', '--save-dev', '--dev'].includes(word))
        ? 'devDependencies'
        : 'dependencies'
      for (const spec of command.filter((word) => word.startsWith('@hozo/'))) {
        const name = spec.slice(0, spec.lastIndexOf('@'))
        manifest[field] = { ...manifest[field], [name]: `^${version}` }
        const dir = path.join(project, 'node_modules', name)
        mkdirSync(dir, { recursive: true })
        writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }))
      }
      writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
      assert.equal(project, root)
    },
  }
}

async function init(root, argv, dependencies = {}) {
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  const result = await runInit(argv, { stdout }, root, { square: async () => [], ...dependencies })
  return { ...result, output: stdout.output }
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8')

test('the Vite starter: a dry run changes nothing, --write installs, creates and edits', async (t) => {
  const root = starter(t, 'vite')
  const config = read(root, 'vite.config.ts')
  const npm = packageManager(root)
  const dry = await init(root, [], npm)
  assert.equal(dry.exit, 0)
  assert.deepEqual(npm.commands, [])
  assert.equal(read(root, 'vite.config.ts'), config)
  assert.match(dry.output, /Would install:\n {2}npm install @hozo\/core@/)
  assert.match(dry.output, /Would create src\/theme\.css/)

  commit(root)
  const result = await init(root, ['--write'], npm)
  assert.equal(result.exit, 0, result.error?.message)
  assert.deepEqual(npm.commands, [
    `npm install @hozo/core@${version}`,
    `npm install --save-dev @hozo/vite@${version} @hozo/compiler@${version}`,
  ])
  // Not src/index.css: it is on Hozo's default list, and has no Tailwind.
  assert.equal(read(root, 'src/theme.css'), '@import "tailwindcss";\n\n@theme {\n}\n')
  assert.equal(
    read(root, 'vite.config.ts'),
    config
      .replace(
        "import { defineConfig } from 'vite'\n",
        "import { defineConfig } from 'vite'\nimport { hozo } from '@hozo/vite'\n",
      )
      .replace('plugins: [react()]', "plugins: [hozo({ css: 'src/theme.css' }), react()]"),
  )

  // A second run has nothing to install or edit.
  const again = await init(root, ['--write'], npm)
  assert.equal(npm.commands.length, 2)
  assert.match(again.output, /already in package\.json/)
  assert.match(again.output, /Nothing to edit/)
})

test('TanStack Start: its Tailwind stylesheet is used, and preflight is off', async (t) => {
  const root = starter(t, 'tanstack-start')
  commit(root)
  const report = JSON.parse(
    (await init(root, ['--write', '--no-install', '--format', 'json'])).output,
  )
  assert.deepEqual(report.stacks, [{ stack: 'tanstack-start', config: 'vite.config.ts' }])
  assert.equal(report.stylesheet, 'src/styles/app.css')
  assert.equal(report.install.ran, false)
  // Nothing is installed yet, so square has nothing to read: it is not run.
  assert.equal(report.setup, undefined)
  assert.deepEqual(
    report.files.map((file) => [file.file, file.action]),
    [['vite.config.ts', 'edit']],
  )
  assert.match(
    read(root, 'vite.config.ts'),
    /plugins: \[\n {4}hozo\(\{ css: 'src\/styles\/app\.css', preflight: false \}\),\n {4}tailwindcss\(\),/,
  )
})

test('Astro: refused without its React integration, edited with it', async (t) => {
  const bare = starter(t, 'astro')
  const refused = await init(bare, [])
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'astro-react-missing')

  const root = starter(t, 'astro')
  const manifest = JSON.parse(read(root, 'package.json'))
  manifest.dependencies['@astrojs/react'] = '^5.0.0'
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest))
  commit(root)
  assert.equal((await init(root, ['--write', '--no-install'])).exit, 0)
  assert.match(
    read(root, 'astro.config.mjs'),
    /import \{ hozo \} from '@hozo\/vite';\n[\s\S]*defineConfig\(\{\n {2}vite: \{ plugins: \[hozo\(\{ css: 'src\/theme\.css' \}\)\] \},\n\}\);/,
  )
})

test('a config init does not recognise is not edited, and nothing is installed', async (t) => {
  const computed = `import { defineConfig } from 'vite'\n\nexport default defineConfig(({ mode }) => ({ plugins: [] }))\n`
  const root = starter(t, 'vite', { 'vite.config.ts': computed })
  commit(root)
  const npm = packageManager(root)
  const result = await init(root, ['--write'], npm)
  assert.equal(result.exit, 2)
  assert.equal(result.error.code, 'config-not-editable')
  assert.match(result.error.message, /add hozo\(\{ css: 'src\/theme\.css' \}\) first in plugins/)
  assert.deepEqual(npm.commands, [])
  assert.equal(read(root, 'vite.config.ts'), computed)
})

test('an uncommitted config, a version mismatch and an unknown stack change nothing', async (t) => {
  const dirty = starter(t, 'vite')
  commit(dirty)
  writeFileSync(path.join(dirty, 'vite.config.ts'), `${read(dirty, 'vite.config.ts')}// wip\n`)
  const npm = packageManager(dirty)
  const refused = await init(dirty, ['--write'], npm)
  assert.equal(refused.error.code, 'uncommitted-changes')
  assert.deepEqual(npm.commands, [])

  const older = starter(t, 'vite', {
    'node_modules/@hozo/core/package.json': JSON.stringify({ version: '0.0.1' }),
  })
  assert.equal((await init(older, [])).error.code, 'version-mismatch')

  const storybook = starter(t, 'vite', {
    '.storybook/main.ts': "export default { addons: [], framework: '@storybook/react-vite' }\n",
  })
  assert.equal((await init(storybook, [])).error.code, 'stack-not-supported')
  const none = starter(t, 'vite')
  rmSync(path.join(none, 'vite.config.ts'))
  assert.equal((await init(none, [])).error.code, 'stack-not-found')
})

test('--ui installs @hozo/ui and imports its theme; pnpm gets pnpm add', async (t) => {
  const root = starter(t, 'vite', { 'pnpm-lock.yaml': '' })
  commit(root)
  const pnpm = packageManager(root)
  assert.equal((await init(root, ['--write', '--ui'], pnpm)).exit, 0)
  assert.deepEqual(pnpm.commands, [
    `pnpm add @hozo/core@${version} @hozo/ui@${version}`,
    `pnpm add -D @hozo/vite@${version} @hozo/compiler@${version}`,
  ])
  assert.equal(
    read(root, 'src/theme.css'),
    '@import "tailwindcss";\n@import "@hozo/ui/theme.css";\n\n@theme {\n}\n',
  )
})

test('a setup error square reports after the edits exits 1', async (t) => {
  const root = starter(t, 'vite')
  commit(root)
  const result = await init(root, ['--write'], {
    ...packageManager(root),
    square: async () => [
      {
        id: 'versions',
        status: 'failed',
        findings: [{ severity: 'error', message: '@hozo/vite is not installed' }],
      },
    ],
  })
  assert.equal(result.exit, 1)
  assert.match(result.output, /FAIL {2}versions\n {8}error: @hozo\/vite is not installed/)
})

// create-next-app writes package.json from code; its fixture has none.
const NEXT = { dependencies: { next: '16.4.6', react: '19.3.1', 'react-dom': '19.3.1' } }

test('Next.js: the exported config is wrapped, in the file’s own quotes and semicolons', async (t) => {
  const root = starter(t, 'next-app', { 'package.json': JSON.stringify(NEXT) })
  commit(root)
  const npm = packageManager(root)
  assert.equal((await init(root, ['--write'], npm)).exit, 0)
  assert.deepEqual(npm.commands, [
    `npm install @hozo/core@${version}`,
    `npm install --save-dev @hozo/next@${version} @hozo/compiler@${version}`,
  ])
  // Not app/globals.css: on the default list, and without Tailwind.
  assert.equal(read(root, 'theme.css'), '@import "tailwindcss";\n\n@theme {\n}\n')
  assert.equal(
    read(root, 'next.config.ts'),
    read(path.join(STARTERS, 'next-app'), 'next.config.ts')
      .replace(
        'import type { NextConfig } from "next";\n',
        'import type { NextConfig } from "next";\nimport { withHozo } from "@hozo/next";\n',
      )
      .replace(
        'export default nextConfig;',
        'export default withHozo(nextConfig, { css: "theme.css" });',
      ),
  )
  assert.match((await init(root, ['--write'], npm)).output, /Nothing to edit/)
})

test('Next.js with Tailwind: its globals.css is used, and preflight is off', async (t) => {
  const manifest = { ...NEXT, devDependencies: { '@tailwindcss/postcss': '^4', tailwindcss: '^4' } }
  const root = starter(t, 'next-app-tw', { 'package.json': JSON.stringify(manifest) })
  commit(root)
  const report = JSON.parse(
    (await init(root, ['--write', '--no-install', '--format', 'json'])).output,
  )
  assert.equal(report.stylesheet, 'app/globals.css')
  assert.deepEqual(
    report.files.map((file) => file.file),
    ['next.config.ts'],
  )
  assert.match(
    read(root, 'next.config.ts'),
    /export default withHozo\(nextConfig, \{ css: "app\/globals\.css", preflight: false \}\);/,
  )
})

test('React Native: the exported expression is wrapped and the require added after the others', async (t) => {
  const root = starter(t, 'react-native')
  commit(root)
  assert.equal((await init(root, ['--write', '--no-install'])).exit, 0)
  const config = read(root, 'metro.config.js')
  assert.match(
    config,
    /^const \{ getDefaultConfig, mergeConfig \} = require\('@react-native\/metro-config'\);\nconst \{ withHozo \} = require\('@hozo\/metro\/config'\);\n/,
  )
  assert.match(
    config,
    /module\.exports = withHozo\(mergeConfig\(getDefaultConfig\(__dirname\), config\), \{ css: 'theme\.css' \}\);\n$/,
  )
})

test('Expo: a metro.config.js is created from Expo’s default, and a second run keeps it', async (t) => {
  const root = starter(t, 'expo')
  commit(root)
  const report = JSON.parse(
    (await init(root, ['--write', '--no-install', '--format', 'json'])).output,
  )
  assert.deepEqual(report.stacks, [{ stack: 'metro', config: 'metro.config.js' }])
  assert.equal(
    read(root, 'metro.config.js'),
    "const { getDefaultConfig } = require('expo/metro-config')\nconst { withHozo } = require('@hozo/metro/config')\n\nmodule.exports = withHozo(getDefaultConfig(__dirname), { css: 'src/theme.css' })\n",
  )
  assert.ok(read(root, 'src/theme.css').startsWith('@import "tailwindcss";'))
  const again = JSON.parse((await init(root, ['--format', 'json'])).output)
  assert.deepEqual(again.files, [])
})

test('a Next.js config exporting a function is printed, not edited', async (t) => {
  const computed = 'export default (phase) => ({ reactStrictMode: phase !== "x" })\n'
  const root = starter(t, 'next-app', {
    'package.json': JSON.stringify(NEXT),
    'next.config.ts': computed,
  })
  const result = await init(root, [])
  assert.equal(result.error.code, 'config-not-editable')
  // No import to read a quote from: a single quote.
  assert.match(result.error.message, /export withHozo\(<your config>, \{ css: 'theme\.css' \}\)/)
})
