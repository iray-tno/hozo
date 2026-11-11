// `hozo`, the one command (RFC 011, docs/rfcs/011-hozo-cli.md).
//
// This module owns routing, help, aliases and exit codes, and nothing else.
// Each command's logic stays in the package that owns it and is imported
// only when that command runs, so `hozo --help` loads no compiler addon.

import { readFileSync } from 'node:fs'

/**
 * Exit codes, the same on every command (RFC 011 §3.5). The split is the one
 * a CI step branches on: `1` means fix the code, `2` means fix the
 * invocation or the install. Finer reasons are string codes, not more exits.
 */
export const EXIT = { passed: 0, findings: 1, error: 2 }

/** An invocation `hozo` cannot run, with a stable string `code`. */
export class CliError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

const COMMANDS = {
  'dry-fit': {
    alias: 'migration-audit',
    summary: 'Before adoption: report what Hozo would do with a React Native checkout',
    run: dryFit,
  },
}

// Names a later RFC specifies (RFC 011 §7). Reserved so no other command
// takes them, and refused with a reason rather than as a typo.
const RESERVED = ['init', 'add', 'mcp']

const ALIASES = Object.fromEntries(
  Object.entries(COMMANDS)
    .filter(([, command]) => command.alias)
    .map(([name, command]) => [command.alias, name]),
)

function version() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

function help() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length))
  const rows = Object.entries(COMMANDS).map(
    ([name, command]) =>
      `  ${name.padEnd(width)}  ${command.summary}${command.alias ? ` (alias: ${command.alias})` : ''}`,
  )
  return `Usage: hozo <command> [options]

Commands:
${rows.join('\n')}

Run \`hozo <command> --help\` for a command's options.

Options:
  --help     Show this help
  --version  Show the installed version

Exit codes: 0 passed, 1 findings at or above --fail-on, 2 the command could not run.
`
}

/**
 * Report an invocation that could not run: one line on stderr, and with
 * `--format json` the same as a JSON object on stdout, for a caller that
 * reads only stdout. Returns the exit code.
 */
function fail(io, prefix, error, argv) {
  io.stderr.write(`${prefix}: ${error.message} [${error.code}]\n`)
  const format = argv.indexOf('--format')
  if (format >= 0 && argv[format + 1] === 'json')
    io.stdout.write(
      `${JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)}\n`,
    )
  return EXIT.error
}

async function dryFit(argv, io) {
  const { AuditInputError, runCli } = await import('@hozo/migration-audit')
  try {
    const report = await runCli(argv, { stdout: io.stdout, command: 'hozo dry-fit' })
    if (!report?.failurePolicy?.exitCode) return EXIT.passed
    io.stderr.write(`hozo dry-fit: ${report.failurePolicy.reasons.join(' ')}\n`)
    return EXIT.findings
  } catch (error) {
    if (!(error instanceof AuditInputError)) throw error
    return fail(io, 'hozo dry-fit', error, argv)
  }
}

/** Run `hozo` with `argv` (no `node`, no script path). Resolves to the exit code. */
export async function run(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const [first, ...rest] = argv
  if (first === undefined || first === '--help' || first === '-h') {
    io.stdout.write(help())
    return EXIT.passed
  }
  if (first === '--version') {
    io.stdout.write(`${version()}\n`)
    return EXIT.passed
  }
  const name = ALIASES[first] ?? first
  const command = COMMANDS[name]
  if (command) return command.run(rest, io)
  const error = RESERVED.includes(first)
    ? new CliError(`\`${first}\` is reserved for a later release (RFC 011 §7)`, 'reserved-command')
    : first.startsWith('-')
      ? new CliError(`Unknown option ${first}; use --help for usage`, 'unknown-option')
      : new CliError(`Unknown command ${first}; use --help for the list`, 'unknown-command')
  return fail(io, 'hozo', error, argv)
}
