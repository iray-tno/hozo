// `hozo add <component>...` (RFC 012, docs/rfcs/012-hozo-add.md): copy an
// `@hozo/ui` component into the project as source, so the project owns it.
//
// What is copied is the look. The behaviour a copied file depends on stays
// in `@hozo/core`, `@hozo/patterns`, `@hozo/form` and `@hozo/primitives`,
// still installed and still covered by the Verification Matrix (RFC 012 §2).
//
// Reads files and nothing else: no compiler, no network, no install. The
// upstream is the `@hozo/ui` the project has installed.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { sourceFiles } from './square-config.mjs'

export const SCHEMA_VERSION = 1

const help = `Usage: hozo add <component>... [options]
       hozo add --list [options]

Copies an @hozo/ui component into the project as source, with the relative
files it imports, so the project owns and edits it. Callers are not changed:
\`import { Button } from '@hozo/ui'\` keeps working, and add lists the files
that import the component from @hozo/ui so the project can move them.
Names are @hozo/ui's file names without extension (button, date-picker, ...)
or a component's name (badge is in status, checkbox in toggle).

Options:
  --write               Create the files (without it, a dry run)
  --force               Overwrite a file at the destination that add did not
                        create, or one Git has no copy of
  --list                Every component, and the state of each copy
  --format text|json    Output format (default: text)
  --help                Show this help

The destination is "hozo": { "components": "<dir>" } in package.json, or
{ "components": "<dir>" } in hozo.json, never both. Without either it is
src/components/ui, or components/ui when the project has no src.

Each copied file starts with one line naming its origin:
  // hozo add: @hozo/ui@<version> src/<file> sha256:<hash>
Delete the line to detach the copy from @hozo/ui.`

/** The first line of a copied file. The hash is of the upstream file as copied. */
const ORIGIN = /^\/\/ hozo add: (@hozo\/ui)@(\S+) (\S+) sha256:([0-9a-f]{64})\r?\n/

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const posix = (file) => file.split(path.sep).join('/')

class AddError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw new AddError(`${posix(file)} is not valid JSON: ${error.message}`, 'invalid-config')
  }
}

/**
 * The destination, relative to the project (RFC 012 §4). Either file may hold
 * it, so a project that dislikes another file at its root needs none; both is
 * an error rather than a silent choice.
 */
export function destination(project) {
  const manifest = readJson(path.join(project, 'package.json')) ?? {}
  const inPackage = manifest.hozo?.components
  const inHozo = readJson(path.join(project, 'hozo.json'))?.components
  if (inPackage !== undefined && inHozo !== undefined)
    throw new AddError(
      'Both package.json ("hozo": { "components" }) and hozo.json ("components") set the destination; keep one',
      'config-conflict',
    )
  const configured = inPackage ?? inHozo
  if (configured !== undefined) {
    if (typeof configured !== 'string' || configured === '' || path.isAbsolute(configured))
      throw new AddError(
        `"components" must be a directory relative to the project, not ${JSON.stringify(configured)}`,
        'invalid-config',
      )
    return {
      dir: posix(path.normalize(configured)),
      from: inPackage !== undefined ? 'package.json' : 'hozo.json',
    }
  }
  const src = existsSync(path.join(project, 'src'))
  return { dir: src ? 'src/components/ui' : 'components/ui', from: 'default' }
}

/** The installed `@hozo/ui`: its directory and version. */
function upstream(project) {
  let file
  try {
    file = createRequire(path.join(project, 'package.json')).resolve('@hozo/ui/package.json')
  } catch {
    throw new AddError(
      `@hozo/ui is not installed in this project; ${installCommand(project, ['@hozo/ui'])}`,
      'missing-package',
    )
  }
  const root = path.dirname(file)
  return { root, version: JSON.parse(readFileSync(file, 'utf8')).version }
}

/** Component names: `@hozo/ui`'s `.tsx` files, without the extension. */
function components(ui) {
  return readdirSync(path.join(ui.root, 'src'))
    .filter((name) => name.endsWith('.tsx') && !/\.test\.tsx?$/.test(name))
    .map((name) => name.slice(0, -'.tsx'.length))
    .sort()
}

function nearest(names, wanted) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j += 1) {
        const current = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
        previous = current
      }
    }
    return row[b.length]
  }
  return names
    .map((name) => [
      name,
      name.includes(wanted) || wanted.includes(name) ? 0 : distance(name, wanted),
    ])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([name]) => name)
}

const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

/** The specifiers a module imports or re-exports from. */
function specifiers(source) {
  return [...source.matchAll(IMPORT)].map((match) => match[1] ?? match[2])
}

/** `@scope/name/deep` → `@scope/name`; `name/deep` → `name`. */
const packageName = (specifier) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

/**
 * The component's file and the relative files it reaches, as paths under
 * `src/`, in the order they are found; and the packages they import.
 */
function closure(ui, name) {
  const files = []
  const packages = new Set()
  const visit = (file) => {
    if (files.includes(file)) return
    files.push(file)
    const source = readFileSync(path.join(ui.root, 'src', file), 'utf8')
    for (const specifier of specifiers(source)) {
      if (specifier.startsWith('.'))
        visit(posix(path.normalize(path.join(path.dirname(file), specifier))))
      else if (!specifier.startsWith('node:')) packages.add(packageName(specifier))
    }
  }
  visit(`${name}.tsx`)
  return { files, packages }
}

/** A copied file's origin line and the rest of it, or `undefined` for one add did not create. */
export function origin(text) {
  const match = ORIGIN.exec(text)
  if (!match) return undefined
  const body = text.slice(match[0].length)
  return { version: match[2], file: match[3], hash: match[4], edited: sha256(body) !== match[4] }
}

/**
 * The state of a copy (RFC 012 §6): `current`, `upstream-newer`, `edited`,
 * or `edited, upstream-newer`.
 */
function copyState(recorded, installed) {
  const states = []
  if (recorded.edited) states.push('edited')
  if (recorded.version !== installed) states.push('upstream-newer')
  return states.length > 0 ? states.join(', ') : 'current'
}

function packageManager(project) {
  let dir = project
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
    if (existsSync(path.join(dir, 'bun.lock')) || existsSync(path.join(dir, 'bun.lockb')))
      return 'bun'
    if (existsSync(path.join(dir, 'package-lock.json'))) return 'npm'
    const parent = path.dirname(dir)
    if (parent === dir) return 'npm'
    dir = parent
  }
}

function installCommand(project, packages) {
  const manager = packageManager(project)
  const verb = manager === 'npm' ? 'install' : 'add'
  return `${manager} ${verb} ${packages.join(' ')}`
}

/** Packages the copies import that the project's package.json does not declare. */
function missingPackages(project, packages) {
  const manifest = readJson(path.join(project, 'package.json')) ?? {}
  const declared = new Set(
    ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
      (field) => Object.keys(manifest[field] ?? {}),
    ),
  )
  return [...packages].filter((name) => !declared.has(name)).sort()
}

/**
 * What `@hozo/ui`'s entry publishes, read from its `export { … } from
 * './x.tsx'` blocks: each published name → the file and the name that file
 * defines it under. `Button` → `button.tsx`, `HozoButton`.
 */
function publishedNames(ui) {
  const entry = readFileSync(path.join(ui.root, 'src', 'index.ts'), 'utf8')
  const names = new Map()
  for (const match of entry.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    const file = posix(path.normalize(match[2]))
    for (const part of match[1].split(',')) {
      const [defined, published = defined] = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
      if (defined) names.set(published, { file, defined })
    }
  }
  return names
}

/**
 * Project files importing a name from `@hozo/ui` that one of `files` defines,
 * with the line, and the import that would take it from the copy instead.
 * The copy exports the name its file defines (`HozoButton`); `@hozo/ui`'s
 * entry is what renamed it (`Button`).
 */
function callers(project, published, files, dest) {
  const found = []
  for (const file of sourceFiles(project)) {
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file) || file.startsWith(`${dest}/`)) continue
    let source
    try {
      source = readFileSync(path.join(project, file), 'utf8')
    } catch {
      continue
    }
    if (!source.includes('@hozo/ui')) continue
    for (const match of source.matchAll(
      /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@hozo\/ui['"]/g,
    )) {
      const moved = new Map()
      for (const part of match[2].split(',')) {
        const type = /^\s*type\s/.test(part) || match[1] !== undefined
        const [name, local = name] = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
        const target = published.get(name)
        if (!name || !target || !files.includes(target.file)) continue
        let specifier = posix(
          path.relative(path.dirname(file), path.join(dest, target.file.replace(/\.tsx?$/, ''))),
        )
        if (!specifier.startsWith('.')) specifier = `./${specifier}`
        const binding = `${type ? 'type ' : ''}${target.defined}${local === target.defined ? '' : ` as ${local}`}`
        moved.set(specifier, [...(moved.get(specifier) ?? []), { name, binding }])
      }
      if (moved.size === 0) continue
      found.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        names: [...moved.values()].flat().map((item) => item.name),
        imports: [...moved].map(
          ([specifier, items]) =>
            `import { ${items.map((item) => item.binding).join(', ')} } from '${specifier}'`,
        ),
      })
    }
  }
  return found
}

/**
 * What `add` would do for `names`: per file, `create`, `same` (already
 * copied, unchanged since), `copied` (already copied, edited or of another
 * version: left alone, `--update` is for that), or `conflict` (a file add did
 * not create).
 */
function plan(project, ui, dest, names) {
  const files = new Map()
  const packages = new Set()
  for (const name of names) {
    const reached = closure(ui, name)
    for (const file of reached.files) if (!files.has(file)) files.set(file, name)
    for (const item of reached.packages) packages.add(item)
  }
  const entries = []
  for (const [file, component] of files) {
    const upstreamText = readFileSync(path.join(ui.root, 'src', file), 'utf8')
    const target = posix(path.join(dest, file))
    const absolute = path.join(project, target)
    const header = `// hozo add: @hozo/ui@${ui.version} src/${file} sha256:${sha256(upstreamText)}\n`
    const entry = { file: target, upstream: `src/${file}`, component, text: header + upstreamText }
    if (!existsSync(absolute)) entry.action = 'create'
    else {
      const current = readFileSync(absolute, 'utf8')
      const recorded = origin(current)
      if (!recorded) entry.action = 'conflict'
      else if (current === entry.text) entry.action = 'same'
      else {
        entry.action = 'copied'
        entry.state = copyState(recorded, ui.version)
      }
    }
    entries.push(entry)
  }
  return { entries, packages }
}

function parse(argv) {
  const options = { names: [], write: false, force: false, list: false, format: 'text' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--write') options.write = true
    else if (argument === '--force') options.force = true
    else if (argument === '--list') options.list = true
    else if (argument === '--format') {
      options.format = argv[++index]
      if (options.format !== 'text' && options.format !== 'json')
        throw new AddError('--format takes text or json', 'unknown-option')
    } else if (argument.startsWith('-'))
      throw new AddError(`Unknown option ${argument}; use --help for usage`, 'unknown-option')
    else options.names.push(argument)
  }
  if (options.list && options.names.length > 0)
    throw new AddError('--list takes no component names', 'unexpected-argument')
  if (!options.help && !options.list && options.names.length === 0)
    throw new AddError('Name a component to add, or pass --list', 'missing-argument')
  return options
}

/** Every copy under the destination, by the upstream file it records. */
function copies(project, dest) {
  const found = new Map()
  const dir = path.join(project, dest)
  if (!existsSync(dir)) return found
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile()) {
        const recorded = origin(readFileSync(path.join(dir, child), 'utf8'))
        if (recorded) found.set(recorded.file, { ...recorded, file: posix(path.join(dest, child)) })
      }
    }
  }
  walk('')
  return found
}

function list(project, ui, dest, format, io) {
  const found = copies(project, dest)
  const rows = components(ui).map((name) => {
    const copy = found.get(`src/${name}.tsx`)
    return copy
      ? { name, file: copy.file, version: copy.version, state: copyState(copy, ui.version) }
      : { name, state: 'not copied' }
  })
  if (format === 'json') {
    io.stdout.write(
      `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, upstream: { package: '@hozo/ui', version: ui.version }, destination: dest, components: rows }, null, 2)}\n`,
    )
    return 0
  }
  const width = Math.max(...rows.map((row) => row.name.length))
  io.stdout.write(`@hozo/ui@${ui.version}, copies in ${dest}\n\n`)
  for (const row of rows)
    io.stdout.write(
      `  ${row.name.padEnd(width)}  ${row.state}${row.file ? `  ${row.file} (from ${row.version})` : ''}\n`,
    )
  return 0
}

/**
 * `hozo add`. Exit codes as every `hozo` command: `0` done (or would be),
 * `2` it could not run or would overwrite what it should not. `error` is
 * `{ message, code }` for the caller to report.
 */
export function runAdd(argv, io, project = process.cwd()) {
  try {
    const options = parse(argv)
    if (options.help) {
      io.stdout.write(`${help}\n`)
      return { exit: 0 }
    }
    const dest = destination(project)
    const ui = upstream(project)
    if (options.list) return { exit: list(project, ui, dest.dir, options.format, io) }

    const known = components(ui)
    // A component's own name finds its file too: `badge` is in `status.tsx`,
    // `checkbox` and `switch` in `toggle.tsx`.
    const byComponent = new Map()
    for (const [published, { file }] of publishedNames(ui)) {
      const key = published.toLowerCase()
      if (file.endsWith('.tsx') && !byComponent.has(key)) byComponent.set(key, file.slice(0, -4))
    }
    const names = []
    for (const name of options.names) {
      if (name === 'theme')
        throw new AddError(
          '`hozo add theme` is RFC 012 step 5 and not implemented yet; import @hozo/ui/theme.css and redefine tokens in your @theme',
          'not-implemented',
        )
      const file = known.includes(name)
        ? name
        : byComponent.get(name.replaceAll('-', '').toLowerCase())
      if (!file) {
        const near = nearest(known, name)
        throw new AddError(
          `${name} is not an @hozo/ui component${near.length ? `; did you mean ${near.join(', ')}?` : ''} (hozo add --list shows them all)`,
          'unknown-component',
        )
      }
      if (!names.includes(file)) names.push(file)
    }
    const { entries, packages } = plan(project, ui, dest.dir, names)

    const conflicts = entries.filter((entry) => entry.action === 'conflict')
    if (conflicts.length > 0 && !options.force)
      throw new AddError(
        `${conflicts.map((entry) => entry.file).join(', ')} already exists and was not created by hozo add; pass --force to overwrite it`,
        'destination-exists',
      )
    const writes = entries.filter(
      (entry) => entry.action === 'create' || entry.action === 'conflict',
    )
    if (options.write)
      for (const entry of writes) {
        const absolute = path.join(project, entry.file)
        mkdirSync(path.dirname(absolute), { recursive: true })
        writeFileSync(absolute, entry.text)
      }

    const missing = missingPackages(project, packages)
    const found = callers(
      project,
      publishedNames(ui),
      names.map((name) => `${name}.tsx`),
      dest.dir,
    )

    if (options.format === 'json') {
      io.stdout.write(
        `${JSON.stringify(
          {
            schemaVersion: SCHEMA_VERSION,
            upstream: { package: '@hozo/ui', version: ui.version },
            destination: { dir: dest.dir, from: dest.from },
            written: options.write,
            files: entries.map(({ text, component, ...entry }) => entry),
            missingPackages: missing,
            ...(missing.length ? { install: installCommand(project, missing) } : {}),
            callers: found,
          },
          null,
          2,
        )}\n`,
      )
      return { exit: 0 }
    }
    const verb = options.write ? 'Created' : 'Would create'
    const lines = [
      `@hozo/ui@${ui.version} → ${dest.dir}${dest.from === 'default' ? '' : ` (from ${dest.from})`}`,
      '',
    ]
    for (const entry of entries) {
      const what =
        entry.action === 'create'
          ? verb.toLowerCase()
          : entry.action === 'conflict'
            ? options.write
              ? 'overwrote'
              : 'would overwrite'
            : entry.action === 'same'
              ? 'already copied'
              : `already copied (${entry.state}); left as is`
      lines.push(`  ${what.padEnd(16)} ${entry.file}  (${entry.upstream})`)
    }
    if (missing.length > 0)
      lines.push(
        '',
        `The copies import ${missing.join(', ')}, which package.json does not declare. Install ${missing.length === 1 ? 'it' : 'them'}:`,
        `  ${installCommand(project, missing)}`,
      )
    if (found.length > 0) {
      lines.push('', `Still importing from @hozo/ui (unchanged; move them to the copy when ready):`)
      for (const caller of found)
        lines.push(
          `  ${caller.file}:${caller.line}  ${caller.names.join(', ')}`,
          ...caller.imports.map((line) => `    ${line}`),
        )
    }
    if (!options.write && writes.length > 0)
      lines.push('', 'Nothing was written. Run again with --write to apply.')
    io.stdout.write(`${lines.join('\n')}\n`)
    return { exit: 0 }
  } catch (error) {
    if (!(error instanceof AddError)) throw error
    return { exit: 2, error: { message: error.message, code: error.code } }
  }
}
