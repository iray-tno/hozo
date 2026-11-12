// `hozo explain [CODE]` (RFC 011 §5): what a diagnostic means, a source
// that raises it, and what the compiler says about that source.
//
// Reads `@hozo/compiler/diagnostics.json` and nothing else, so it works
// offline and loads no compiler addon. The catalog is generated from the
// compiler's own doc comments and its conformance cases; see
// `scripts/diagnostic-catalog.mjs`.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const help = `Usage: hozo explain [CODE] [--format text|json]

Explains a diagnostic code, such as ARIA_NAME_PROHIBITED: what it means, a
source that raises it, and the compiler's message for that source.
Without a code, lists every code.`

function catalog() {
  const file = createRequire(import.meta.url).resolve('@hozo/compiler/diagnostics.json')
  return JSON.parse(readFileSync(file, 'utf8'))
}

const BACKENDS = { both: 'Web and Native', web: 'Web', native: 'Native' }
const firstSentence = (text) => text.split('\n')[0].replace(/(\.)\s.*$/, '$1')
const indent = (text) => text.replace(/^/gm, '  ')

function describe(code, entry) {
  const lines = [code, '', entry.summary || '(No description in the compiler yet.)', '']
  if (entry.unreachable) {
    lines.push(`No source is known to raise it: ${entry.unreachable}.`)
    return `${lines.join('\n')}\n`
  }
  if (!entry.example) return `${lines.join('\n')}\n`
  lines.push(
    `Example (${BACKENDS[entry.example.backend]}${entry.example.jsx ? ', inside a component' : ''}):`,
    indent(entry.example.jsx ?? entry.example.module.trimEnd()),
    '',
  )
  if (entry.emitted.length === 0) {
    lines.push(
      'The compiler does not raise it on this example any more; the conformance report counts it as silent.',
    )
  } else {
    lines.push('What the compiler says about it:')
    // One line when both backends say the same thing.
    const said = new Map()
    for (const { backend, severity, message } of entry.emitted) {
      const key = `${severity}: ${message}`
      said.set(key, [...(said.get(key) ?? []), backend])
    }
    for (const [text, backends] of said)
      lines.push(indent(`${backends.length > 1 ? BACKENDS.both : BACKENDS[backends[0]]}, ${text}`))
  }
  return `${lines.join('\n')}\n`
}

/** Codes close to a mistyped one: sharing a word, or a prefix. */
function suggestions(codes, wanted) {
  const words = new Set(wanted.split('_').filter((word) => word.length > 2))
  return codes
    .map((code) => [code, code.split('_').filter((word) => words.has(word)).length])
    .filter(([, shared]) => shared > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code)
}

/**
 * Exit codes as every `hozo` command; `explain` has no findings, so it is
 * `0` or `2`. `error` is `{ message, code }` for the caller to report.
 */
export function runExplain(argv, io) {
  let format = 'text'
  let wanted
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      io.stdout.write(`${help}\n`)
      return { exit: 0 }
    }
    if (argument === '--format') {
      format = argv[++index]
      if (format !== 'text' && format !== 'json')
        return {
          exit: 2,
          error: { message: '--format takes text or json', code: 'unknown-option' },
        }
    } else if (argument.startsWith('-'))
      return { exit: 2, error: { message: `Unknown option ${argument}`, code: 'unknown-option' } }
    else if (wanted !== undefined)
      return {
        exit: 2,
        error: { message: `Unexpected argument ${argument}`, code: 'unexpected-argument' },
      }
    else wanted = argument
  }
  const { codes } = catalog()
  const names = Object.keys(codes).sort()
  if (wanted === undefined) {
    if (format === 'json') io.stdout.write(`${JSON.stringify({ codes }, null, 2)}\n`)
    else {
      const width = Math.max(...names.map((name) => name.length))
      for (const name of names)
        io.stdout.write(`${name.padEnd(width)}  ${firstSentence(codes[name].summary)}\n`)
    }
    return { exit: 0 }
  }
  // `aria-name-prohibited` and `aria_name_prohibited` mean the same code.
  const code = wanted.toUpperCase().replaceAll('-', '_')
  const entry = codes[code]
  if (!entry) {
    const near = suggestions(names, code)
    return {
      exit: 2,
      error: {
        message: `No diagnostic ${wanted}.${near.length ? ` Did you mean ${near.join(', ')}?` : ''} Run \`hozo explain\` for the list`,
        code: 'unknown-diagnostic',
      },
    }
  }
  io.stdout.write(
    format === 'json' ? `${JSON.stringify({ code, ...entry }, null, 2)}\n` : describe(code, entry),
  )
  return { exit: 0 }
}
