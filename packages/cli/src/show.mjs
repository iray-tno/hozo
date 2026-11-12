// `hozo show <file>` (RFC 011 §5): what one file compiles to, for the Web
// and for React Native, with the project's own theme. The terminal stand-in
// for the REPL: the same two compiler calls the REPL makes through
// `hozo_wasm` (`compile` and `compileNative`), through the native binding
// the build uses, with the theme read from the stylesheet the project uses
// rather than Tailwind's default.

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
// The REPL's layout; this entry loads no addon.
import { formatJsx } from '@hozo/compiler/format-jsx'
import { classListLines, classLists } from './show-classes.mjs'
import { checkCss } from './square-config.mjs'

export const SCHEMA_VERSION = 1

const help = `Usage: hozo show <file> [options]

Prints what a file compiles to: the Web JSX and CSS, the React Native JSX and
StyleSheet, each class list with what became of its classes, and each
diagnostic with its line and column. The theme is the project's, read from
the stylesheet its bundler config names (or the usual names: src/index.css,
global.css, ...), as the build reads it.

A class list is compiled (some classes perhaps under a condition); compiled
into a callback its pattern owner (Chip, Menu, ...) applies with its own
state, on Native; handed to a component the compiler does not lower, which
resolves it; or resolved at runtime when the compiler cannot read it (on
Native, by its pattern owner with its state, when it has one). A class in it
is compiled, not-generated (Tailwind has no rule for it in this theme), refused
or not-wired on Native (with the reason), or passed-through: not a Tailwind
class, kept on the Web for the project's own CSS.

Options:
  --web | --native       Show one platform (default: both)
  --css <file>           The stylesheet to read the theme from, relative to the project
  --format text|json     Output format (default: text)
  --fail-on <level>      Exit 1 on a diagnostic at or above this: none (default),
                         warning or error
  --help                 Show this help`

const SEVERITY_RANK = { info: 0, warning: 1, error: 2 }
const FAIL_ON = { none: Number.POSITIVE_INFINITY, warning: 1, error: 2 }

class ShowInputError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function parseArgs(argv) {
  const options = { format: 'text', failOn: 'none', platforms: ['web', 'native'] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--web' || argument === '--native') {
      if (options.platform)
        throw new ShowInputError('--web and --native are exclusive', 'invalid-option')
      options.platform = argument.slice(2)
      options.platforms = [options.platform]
    } else if (argument === '--css') {
      const value = argv[++index]
      if (value === undefined || value.startsWith('-'))
        throw new ShowInputError('--css takes a stylesheet', 'missing-value')
      options.css = value
    } else if (argument === '--format' || argument === '--fail-on') {
      const value = argv[++index]
      const allowed = argument === '--format' ? ['text', 'json'] : Object.keys(FAIL_ON)
      if (!allowed.includes(value))
        throw new ShowInputError(
          `${argument} takes ${allowed.join(', ')}${value === undefined ? '' : `, got ${value}`}`,
          value === undefined ? 'missing-value' : 'invalid-option',
        )
      options[argument === '--format' ? 'format' : 'failOn'] = value
    } else if (argument.startsWith('-'))
      throw new ShowInputError(`Unknown option ${argument}; use --help for usage`, 'unknown-option')
    else if (options.file !== undefined)
      throw new ShowInputError(`Unexpected argument ${argument}`, 'unexpected-argument')
    else options.file = argument
  }
  if (options.file === undefined)
    throw new ShowInputError('A file to show is required; use --help for usage', 'missing-file')
  return options
}

/** The nearest directory at or above `directory` with a `package.json`. */
function projectOf(directory) {
  for (let current = directory; ; ) {
    if (existsSync(path.join(current, 'package.json'))) return current
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * The theme the build compiles against: `--css`, else the stylesheet the
 * bundler config names, else the usual names. Read statically, as the audit
 * reads it: no config is run.
 */
async function projectTheme(project, css) {
  const { loadStaticProjectTheme } = await import('@hozo/tailwind')
  let named = css
  if (named === undefined && project)
    try {
      named = checkCss(project, { names: new Set() }).css
    } catch {}
  if (!project) return { status: 'absent', reason: 'No package.json above the file' }
  const loaded = await loadStaticProjectTheme(project, named)
  if (loaded.theme.status === 'resolved')
    return {
      status: 'resolved',
      css: path.relative(project, loaded.css.value).split(path.sep).join('/'),
      value: loaded.theme.value,
    }
  if (loaded.theme.status === 'absent') return { status: 'absent', reason: loaded.theme.reason }
  throw new ShowInputError(`The theme could not be read: ${loaded.theme.reason}`, 'invalid-css')
}

/** `line:column`, 1-based, of a UTF-16 offset: what a JavaScript string indexes. */
function position(text, offset) {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - (before.lastIndexOf('\n') + 1) + 1 }
}

/**
 * Both backends see the same source and often say the same thing; each
 * diagnostic is listed once, naming every backend that reported it.
 */
function mergeDiagnostics(source, outputs) {
  const merged = new Map()
  for (const [backend, components] of Object.entries(outputs))
    for (const diagnostic of components.flatMap((component) => component.diagnostics)) {
      const key = `${diagnostic.code}:${diagnostic.spanStart}:${diagnostic.message}`
      const known = merged.get(key)
      if (known) {
        if (!known.backends.includes(backend)) known.backends.push(backend)
        continue
      }
      merged.set(key, {
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        ...position(source, diagnostic.spanStart),
        backends: [backend],
      })
    }
  return [...merged.values()].sort((a, b) => a.line - b.line || a.column - b.column)
}

const joined = (parts) => parts.filter((part) => part.trim() !== '').join('\n\n')
const indent = (text) => text.replace(/^(?=.)/gm, '  ')

function text(report) {
  const theme =
    report.theme.status === 'resolved'
      ? `theme: ${report.theme.css}`
      : `theme: Tailwind's default; ${report.theme.reason.replace(/\.$/, '')}`
  const lines = [`hozo show: ${report.file} (${theme})`]
  const section = (title, body) =>
    lines.push('', title, body.trim() === '' ? '  (nothing)' : indent(body.trimEnd()))
  if (report.web) {
    // Laid out as the REPL lays it out; JSON keeps the compiler's one line.
    section('Web JSX', joined(report.web.map((component) => formatJsx(component.jsx))))
    section('Web CSS', joined(report.web.map((component) => component.css)))
  }
  if (report.native) {
    section(
      'React Native JSX',
      joined(
        report.native.map((component) =>
          [...component.prelude, formatJsx(component.jsx)].join('\n'),
        ),
      ),
    )
    section(
      'React Native StyleSheet',
      joined(
        report.native.map((component) =>
          component.styles.trim() === '' ? '' : `StyleSheet.create(${component.styles})`,
        ),
      ),
    )
  }
  lines.push('', 'Class lists', ...classListLines(report.classLists))
  lines.push('', 'Diagnostics')
  if (report.diagnostics.length === 0) lines.push('  none')
  for (const diagnostic of report.diagnostics)
    lines.push(
      `  ${diagnostic.severity.padEnd(7)} ${diagnostic.line}:${diagnostic.column} ${diagnostic.code} (${diagnostic.backends.join(', ')})`,
      indent(indent(diagnostic.message)),
    )
  if (report.components === 0) lines.push('', 'Nothing to compile: no component returned JSX.')
  return `${lines.join('\n')}\n`
}

/**
 * Run `hozo show`. Resolves to `{ exit, error? }`, as `runSquare` does:
 * `error` is `{ message, code }` for the caller to report with exit 2.
 */
export async function runShow(argv, io, cwd = process.cwd()) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    if (!(error instanceof ShowInputError)) throw error
    return { exit: 2, error }
  }
  if (options.help) {
    io.stdout.write(`${help}\n`)
    return { exit: 0 }
  }
  const file = path.resolve(cwd, options.file)
  if (!existsSync(file) || !statSync(file).isFile())
    return { exit: 2, error: { message: `Not a file: ${file}`, code: 'file-not-found' } }
  const source = readFileSync(file, 'utf8')
  const project = projectOf(path.dirname(file))

  let theme
  try {
    theme = await projectTheme(project, options.css)
  } catch (error) {
    if (!(error instanceof ShowInputError)) throw error
    return { exit: 2, error }
  }
  let compiler
  try {
    const { createCompiler } = await import('@hozo/compiler')
    // A project theme compiles with preflight on, as the build does once a
    // file uses Tailwind; without one, the compiler's defaults: the REPL's.
    compiler = createCompiler(
      theme.status === 'resolved' ? { colors: [], ...theme.value, preflight: true } : undefined,
    )
  } catch (error) {
    return {
      exit: 2,
      error: {
        message: `@hozo/compiler could not load: ${String(error?.message ?? error).split('\n')[0]}`,
        code: 'compiler-unavailable',
      },
    }
  }
  const outputs = {}
  if (options.platforms.includes('web')) outputs.web = compiler.compile(source)
  if (options.platforms.includes('native')) outputs.native = compiler.compileNative(source)

  const shown = (project ? path.relative(project, file) : file).split(path.sep).join('/')
  const report = {
    schemaVersion: SCHEMA_VERSION,
    file: shown,
    project: project ?? null,
    theme:
      theme.status === 'resolved'
        ? { status: 'resolved', css: theme.css }
        : { status: 'default', reason: theme.reason },
    components: Object.values(outputs)[0].length,
    ...(outputs.web && {
      web: outputs.web.map(({ jsx, css, runtimeImports, spanStart, spanEnd }) => ({
        jsx,
        css,
        runtimeImports,
        spanStart,
        spanEnd,
      })),
    }),
    ...(outputs.native && {
      native: outputs.native.map(
        ({ jsx, styles, prelude, runtimeImports, nativeImports, spanStart, spanEnd }) => ({
          jsx,
          styles,
          prelude,
          runtimeImports,
          nativeImports,
          spanStart,
          spanEnd,
        }),
      ),
    }),
    classLists: await classLists({
      source,
      root: project ?? path.dirname(file),
      css: theme.status === 'resolved' ? theme.css : undefined,
      diagnostics: Object.values(outputs).flatMap((components) =>
        components.flatMap((component) => component.diagnostics),
      ),
      nativeDiagnostics: (outputs.native ?? []).flatMap((component) => component.diagnostics),
      platforms: options.platforms,
    }),
    diagnostics: mergeDiagnostics(source, outputs),
  }
  const counted = report.diagnostics.filter(
    (diagnostic) => (SEVERITY_RANK[diagnostic.severity] ?? 0) >= FAIL_ON[options.failOn],
  ).length
  io.stdout.write(options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : text(report))
  if (counted)
    io.stderr.write(
      `hozo show: ${counted} diagnostic${counted === 1 ? '' : 's'} at or above ${options.failOn}.\n`,
    )
  return { exit: counted ? 1 : 0 }
}
