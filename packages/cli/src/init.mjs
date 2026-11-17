// `hozo init` (RFC 013): add Hozo to a project that already builds.
//
// Detect the stack from its config, install `@hozo/*` at this CLI's
// version, pick or create the stylesheet Hozo reads, edit the config by
// insertion (init-config.mjs), and finish with `square --setup`. Under the
// write contract every `hozo` command that edits files follows (RFC 011
// §3.4): a dry run unless `--write`.

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { packageManager, posix } from './add.mjs'
import {
  expoMetroConfig,
  InitError,
  storybookConfigEdit,
  viteConfigEdit,
  wrapConfigEdit,
} from './init-config.mjs'
import { DEFAULT_CSS_FILES } from './square-config.mjs'
import { unifiedDiff } from './text-diff.mjs'

export const SCHEMA_VERSION = 1

const help = `Usage: hozo init [options]

Adds Hozo to the project in the current directory: installs @hozo/* at this
CLI's version, picks or creates the stylesheet Hozo reads, adds Hozo to the
bundler config, then runs \`hozo square --setup\`. A config init does not
recognise is not edited: init prints the lines to add and exits 2.

Edits Vite, TanStack Start, Astro, Next.js, Metro and Storybook configs, and
creates metro.config.js for an Expo project that has none. Storybook beside a
Vite config is left alone: it builds with that config, and its hozo().

Options:
  --write               Install and edit (without it, a dry run)
  --force               Edit files Git has no copy of, or outside Git
  --css <file>          The stylesheet Hozo reads; created if missing
  --ui                  Install @hozo/ui and import its theme as well
  --no-install          Edit only; print the install commands
  --format text|json    Output format (default: text)
  --help                Show this help

Exit codes: 0 done, 1 done but square reports a setup error, 2 nothing was
changed (usage, an unknown stack, a config init cannot edit, or a refused
write).`

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']

/** Stylesheets a starter builds with, beyond Hozo's default list (RFC 013 §2). */
const STARTER_CSS = ['src/styles/app.css', 'src/styles/globals.css', 'styles/globals.css']

const TAILWIND_IMPORT = /@import\s+(?:url\(\s*)?['"]tailwindcss(?:\/[\w./-]*)?['"][^;\n]*;?/
const UI_THEME_IMPORT = /@import\s+(?:url\(\s*)?['"]@hozo\/ui\/theme\.css['"]/
const NEW_STYLESHEET = '@import "tailwindcss";\n\n@theme {\n}\n'

function version() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

function parse(argv) {
  const options = { write: false, force: false, install: true, ui: false, format: 'text' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--write') options.write = true
    else if (argument === '--force') options.force = true
    else if (argument === '--ui') options.ui = true
    else if (argument === '--no-install') options.install = false
    else if (argument === '--css') {
      options.css = argv[++index]
      if (!options.css || options.css.startsWith('-'))
        throw new InitError('--css takes a stylesheet path', 'missing-argument')
    } else if (argument === '--format') {
      options.format = argv[++index]
      if (options.format !== 'text' && options.format !== 'json')
        throw new InitError('--format takes text or json', 'unknown-option')
    } else if (argument.startsWith('-'))
      throw new InitError(`Unknown option ${argument}; use --help for usage`, 'unknown-option')
    else throw new InitError(`init takes no arguments, found ${argument}`, 'unexpected-argument')
  }
  return options
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function declared(manifest) {
  return Object.assign(
    {},
    manifest.optionalDependencies,
    manifest.peerDependencies,
    manifest.devDependencies,
    manifest.dependencies,
  )
}

function findConfig(project, base) {
  for (const extension of CONFIG_EXTENSIONS) {
    const file = `${base}.${extension}`
    if (existsSync(path.join(project, file))) return file
  }
  return undefined
}

/**
 * The stacks in the project, by the configs `square` knows. The ones this
 * release does not edit yet are returned too, so init can name them.
 */
function detect(project, dependencies) {
  const found = []
  const vite = findConfig(project, 'vite.config')
  if (vite)
    found.push({
      stack: dependencies['@tanstack/react-start'] ? 'tanstack-start' : 'vite',
      config: vite,
    })
  const astro = findConfig(project, 'astro.config')
  if (astro) found.push({ stack: 'astro', config: astro })
  for (const [base, stack] of [
    ['next.config', 'next'],
    ['metro.config', 'metro'],
    ['.storybook/main', 'storybook'],
  ]) {
    const config = findConfig(project, base)
    if (config) found.push({ stack, config, unsupported: stack === 'storybook' })
  }
  // Expo builds with its default Metro config until a project writes one.
  if (!found.some((item) => item.stack === 'metro') && dependencies.expo)
    found.push({ stack: 'metro', config: 'metro.config.js', create: true })
  return found
}

/** The adapter each stack takes. */
const ADAPTERS = {
  vite: '@hozo/vite',
  'tanstack-start': '@hozo/vite',
  astro: '@hozo/vite',
  next: '@hozo/next',
  metro: '@hozo/metro',
  storybook: '@hozo/storybook',
}

const NAMES = {
  vite: 'Vite',
  'tanstack-start': 'TanStack Start',
  astro: 'Astro',
  next: 'Next.js',
  metro: 'Metro',
  storybook: 'Storybook',
}

/** The `css` a config already passes Hozo, if it writes one literally. */
const cssOption = (text) => /\bcss\s*:\s*(['"`])([^'"`\n]+)\1/.exec(text)?.[2]

/**
 * The stylesheet Hozo will read (RFC 013 §5): `{ file, create, tailwind }`.
 * `tailwind` is whether it already imports Tailwind for the build.
 */
function stylesheet(project, options, existing, stacks) {
  const read = (file) => readFileSync(path.join(project, file), 'utf8')
  const given = options.css ?? existing
  if (given) {
    const file = posix(path.normalize(given))
    if (!existsSync(path.join(project, file))) return { file, create: true }
    return { file, tailwind: TAILWIND_IMPORT.test(read(file)) }
  }
  for (const file of [...DEFAULT_CSS_FILES, ...STARTER_CSS])
    if (existsSync(path.join(project, file)) && TAILWIND_IMPORT.test(read(file)))
      return { file, tailwind: true }
  // Astro's pages live in src/ whether or not the starter has made it yet.
  const src = existsSync(path.join(project, 'src')) || stacks.some((item) => item.stack === 'astro')
  return { file: src ? 'src/theme.css' : 'theme.css', create: true }
}

/** The stylesheet with `@hozo/ui`'s theme imported after Tailwind's. */
function withUiTheme(text) {
  if (UI_THEME_IMPORT.test(text)) return text
  const match = TAILWIND_IMPORT.exec(text)
  if (!match) return `@import "@hozo/ui/theme.css";\n${text}`
  const end = match.index + match[0].length
  return `${text.slice(0, end)}\n@import "@hozo/ui/theme.css";${text.slice(end)}`
}

/** The install commands, one per dependency kind, for the project's package manager. */
function installCommands(project, dev, runtime) {
  const manager = packageManager(project)
  const add = manager === 'npm' ? ['install'] : ['add']
  const devFlag = manager === 'npm' ? '--save-dev' : manager === 'bun' ? '--dev' : '-D'
  const commands = []
  if (runtime.length) commands.push([manager, ...add, ...runtime])
  if (dev.length) commands.push([manager, ...add, devFlag, ...dev])
  return commands
}

function runInstall(project, command) {
  // Package managers are `.cmd` shims on Windows, which only a shell runs.
  // There the line goes to the shell whole: every word is a package
  // manager, a verb, a flag or `@hozo/<name>@<version>`, none needing quotes.
  if (process.platform === 'win32') execSync(command.join(' '), { cwd: project, stdio: 'inherit' })
  else execFileSync(command[0], command.slice(1), { cwd: project, stdio: 'inherit' })
}

/**
 * Run `hozo init`. `dependencies.install(project, command)` replaces the
 * package manager in tests; `dependencies.square(project)` the setup check.
 */
export async function runInit(argv, io, project = process.cwd(), dependencies = {}) {
  try {
    const options = parse(argv)
    if (options.help) {
      io.stdout.write(`${help}\n`)
      return { exit: 0 }
    }
    const manifest = readJson(path.join(project, 'package.json'))
    if (!manifest)
      throw new InitError(`No readable package.json in ${project}`, 'missing-package-json')
    const deps = declared(manifest)
    const stacks = detect(project, deps)
    if (stacks.length === 0)
      throw new InitError(
        manifest.workspaces || existsSync(path.join(project, 'pnpm-workspace.yaml'))
          ? 'This is a workspace root with no bundler config; run hozo init in the package that builds'
          : `No bundler config found; init knows ${Object.values(NAMES).join(', ')} (vite.config.*, astro.config.*, next.config.*, metro.config.*, .storybook/main.*, or expo in package.json)`,
        'stack-not-found',
      )
    // Storybook's Vite builder loads the project's vite.config, hozo()
    // included; @hozo/storybook as well would run Hozo twice, and the second
    // pass drops CSS (RFC 013 §7.4).
    const notes = []
    const viteBeside = stacks.find(
      (item) => item.stack === 'vite' || item.stack === 'tanstack-start',
    )
    const storybook = stacks.find((item) => item.stack === 'storybook')
    if (storybook && viteBeside) {
      storybook.skip = true
      notes.push(
        `${storybook.config} is left alone: Storybook builds with ${viteBeside.config}, so it gets hozo() from there, and @hozo/storybook as well would run Hozo twice`,
      )
    }
    if (stacks.some((item) => item.stack === 'astro') && !deps['@astrojs/react'])
      throw new InitError(
        'Astro renders Hozo components through its React integration, which this project does not have; run `npx astro add react` first, then hozo init',
        'astro-react-missing',
      )

    // Versions: every @hozo/* package is released at one version, so the
    // one to install is this CLI's. A project on another is not upgraded.
    const want = version()
    const adapters = [
      ...new Set(stacks.filter((item) => !item.skip).map((item) => ADAPTERS[item.stack])),
    ]
    const runtime = ['@hozo/core', ...(options.ui ? ['@hozo/ui'] : [])]
    const dev = [...adapters, '@hozo/compiler']
    for (const name of [...runtime, ...dev]) {
      const installed = readJson(path.join(project, 'node_modules', name, 'package.json'))?.version
      if (installed && installed !== want)
        throw new InitError(
          `${name} ${installed} is installed, and this hozo is ${want}; init does not upgrade. Run the hozo of ${installed} (npx @hozo/cli@${installed} init), or upgrade every @hozo/* package together (hozo square reports version-mismatch)`,
          'version-mismatch',
        )
    }
    const missing = (names) => names.filter((name) => !deps[name]).map((name) => `${name}@${want}`)
    const commands = installCommands(project, missing(dev), missing(runtime))

    // The stylesheet, then the configs that name it.
    const configs = stacks
      .filter((item) => !item.skip)
      .map((item) => ({
        ...item,
        text: item.create ? '' : readFileSync(path.join(project, item.config), 'utf8'),
      }))
    const sheet = stylesheet(
      project,
      options,
      configs.map((item) => cssOption(item.text)).find(Boolean),
      stacks,
    )
    const tailwindBuild =
      Boolean(deps['@tailwindcss/vite'] || deps['@tailwindcss/postcss']) || sheet.tailwind
    const files = []
    if (sheet.create)
      files.push({
        file: sheet.file,
        action: 'create',
        original: '',
        updated: options.ui ? withUiTheme(NEW_STYLESHEET) : NEW_STYLESHEET,
      })
    else if (options.ui) {
      const original = readFileSync(path.join(project, sheet.file), 'utf8')
      const updated = withUiTheme(original)
      if (updated !== original) files.push({ file: sheet.file, action: 'edit', original, updated })
    }
    for (const item of configs) {
      // Preflight is a Web reset: Metro has no cascade for it to undo.
      const adapterOptions = {
        css: sheet.file,
        preflight: tailwindBuild && item.stack !== 'metro' ? false : undefined,
      }
      if (item.create) {
        files.push({
          file: item.config,
          action: 'create',
          original: '',
          updated: expoMetroConfig(adapterOptions),
        })
        continue
      }
      const edit =
        item.stack === 'next' || item.stack === 'metro'
          ? wrapConfigEdit(item.text, item.config, item.stack, adapterOptions)
          : item.stack === 'storybook'
            ? storybookConfigEdit(item.text, item.config, adapterOptions)
            : viteConfigEdit(
                item.text,
                item.config,
                item.stack === 'astro' ? 'astro' : 'vite',
                adapterOptions,
              )
      if (!edit.same)
        files.push({
          file: item.config,
          action: 'edit',
          original: item.text,
          updated: edit.updated,
        })
    }

    // Every refusal before anything changes.
    if (options.write) {
      const { overwriteRefusal } = await import('./write-contract.mjs')
      const refusal = overwriteRefusal(
        project,
        files.filter((item) => item.action === 'edit').map((item) => item.file),
        options.force,
      )
      if (refusal) throw new InitError(refusal, 'uncommitted-changes')
    }
    const install = dependencies.install ?? runInstall
    const ran = options.write && options.install
    if (ran)
      for (const command of commands)
        try {
          install(project, command)
        } catch (error) {
          throw new InitError(
            `${command.join(' ')} failed (${error.message}); nothing was edited`,
            'install-failed',
          )
        }
    if (options.write)
      for (const item of files) {
        const absolute = path.join(project, item.file)
        mkdirSync(path.dirname(absolute), { recursive: true })
        writeFileSync(absolute, item.updated)
      }

    // square checks what is installed: with packages left to install there
    // is nothing for it to read yet.
    const setup =
      options.write && (ran || commands.length === 0)
        ? await (dependencies.square ?? squareSetup)(project)
        : undefined
    const errors = (setup ?? []).flatMap((check) =>
      (check.findings ?? []).filter((finding) => finding.severity === 'error'),
    )
    const exit = errors.length ? 1 : 0
    const report = {
      stacks: stacks.map((item) => ({ stack: item.stack, config: item.config })),
      version: want,
      stylesheet: sheet.file,
      install: commands.map((command) => command.join(' ')),
      files,
      notes,
    }
    if (options.format === 'json')
      io.stdout.write(
        `${JSON.stringify(
          {
            schemaVersion: SCHEMA_VERSION,
            written: options.write,
            stacks: report.stacks,
            version: want,
            stylesheet: sheet.file,
            install: { commands: report.install, ran },
            files: files.map((item) => ({
              file: item.file,
              action: item.action,
              diff: unifiedDiff(item.file, item.file, item.original, item.updated),
            })),
            notes,
            ...(setup ? { setup } : {}),
          },
          null,
          2,
        )}\n`,
      )
    else io.stdout.write(text(report, options, ran, setup, deps))
    return { exit }
  } catch (error) {
    if (error instanceof InitError) return { exit: 2, error }
    throw error
  }
}

async function squareSetup(project) {
  const { runSquare } = await import('./square.mjs')
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  const { error } = await runSquare(
    [project, '--setup', '--format', 'json'],
    { stdout, stderr: stdout },
    project,
  )
  const failed = (message) => [
    { id: 'square', status: 'failed', findings: [{ severity: 'error', message }] },
  ]
  if (error) return failed(`${error.message} [${error.code}]`)
  try {
    return JSON.parse(stdout.output).setup
  } catch {
    return failed(stdout.output.trim() || 'square printed no report')
  }
}

function text(report, options, ran, setup, deps) {
  const lines = [
    `${report.stacks.map((item) => `${NAMES[item.stack]} (${item.config})`).join(', ')} → Hozo ${report.version}`,
    '',
  ]
  if (report.install.length) {
    lines.push(
      ran ? 'Installed:' : options.write ? 'Install (not run, --no-install):' : 'Would install:',
    )
    for (const command of report.install) lines.push(`  ${command}`)
  } else lines.push('Every @hozo/* package init needs is already in package.json.')
  if (report.files.length === 0) lines.push('', 'Nothing to edit: the project already uses Hozo.')
  for (const item of report.files) {
    const verb =
      item.action === 'create'
        ? options.write
          ? 'Created'
          : 'Would create'
        : options.write
          ? 'Edited'
          : 'Would edit'
    lines.push('', `${verb} ${item.file}:`)
    lines.push(
      unifiedDiff(item.file, item.file, item.original, item.updated).trimEnd().replace(/^/gm, '  '),
    )
  }
  if (!options.write) lines.push('', 'Dry run: pass --write to install and edit, then square runs.')
  else if (!setup)
    lines.push('', 'Run the install commands, then hozo square --setup to check the result.')
  if (setup) {
    lines.push('', 'hozo square --setup:')
    for (const check of setup) {
      lines.push(
        `  ${check.status === 'passed' ? 'pass' : check.status === 'skipped' ? 'skip' : 'FAIL'}  ${check.id}`,
      )
      for (const finding of check.findings ?? [])
        lines.push(`        ${finding.severity}: ${finding.message}`)
    }
  }
  for (const note of report.notes) lines.push('', note)
  if (deps['react-native'])
    lines.push(
      '',
      'react-native is a dependency: hozo dry-fit reports what Hozo would do with its imports.',
    )
  return `${lines.join('\n')}\n`
}
