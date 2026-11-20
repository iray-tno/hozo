// `hozo manifest [package-dir] [--entry <file>] [--check] [--sources <glob>]...
// [--compiled-by-consumer]` (RFC 011), and
// the deprecated `hozo-manifest` binary, which runs the same function.
//
// Writes the package's manifest where its package.json's `hozo.manifest`
// says (default `hozo.manifest.json`), or with --check, exits 1 when the
// file is not what the source says. See `./manifest.ts`.

import path from 'node:path'

import { writeManifest } from './manifest.ts'

export interface ManifestCliIO {
  log(message: string): void
  error(message: string): void
}

/** An invocation that cannot run, with a stable string code (RFC 011 §3). */
class ManifestInputError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

const help = (
  command: string,
) => `Usage: ${command} [package-dir] [--entry <file>] [--check] [--sources <glob>]... [--compiled-by-consumer]

Builds a package's hozo.manifest.json from its source entry.
  --entry <file>          Source entry relative to package-dir, when the published entry is built output
  --check                 Write nothing; exit 1 when the manifest on disk is stale
  --sources <glob>        Files whose classes the package contributes; writes version 2. Repeatable
  --compiled-by-consumer  The consumer's build compiles the package's source (it ships no built output)

Without --sources the manifest is version 1: text forwarding only, and an app
gets no classes from the package.`

function parseArguments(args: readonly string[]) {
  let check = false
  let compiledByConsumer = false
  let entry: string | undefined
  let packageDir: string | undefined
  const sources: string[] = []
  const value = (index: number, option: string, what: string) => {
    const next = args[index + 1]
    if (next === undefined || next.startsWith('-'))
      throw new ManifestInputError(`${option} requires ${what}`, 'missing-value')
    return next
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '--help' || argument === '-h') return { help: true as const }
    if (argument === '--check') check = true
    else if (argument === '--compiled-by-consumer') compiledByConsumer = true
    else if (argument === '--entry') {
      entry = value(index, '--entry', 'a file')
      index += 1
    } else if (argument === '--sources') {
      sources.push(value(index, '--sources', 'a glob'))
      index += 1
    } else if (argument.startsWith('-'))
      throw new ManifestInputError(`Unknown option ${argument}`, 'unknown-option')
    else if (packageDir !== undefined)
      throw new ManifestInputError(`Unexpected argument ${argument}`, 'unexpected-argument')
    else packageDir = argument
  }
  // Said of the sources, so it means nothing without them; a silent version 1
  // would read as the author's answer when it was not.
  if (compiledByConsumer && !sources.length)
    throw new ManifestInputError('--compiled-by-consumer needs --sources', 'missing-sources')
  const candidates = sources.length ? { sources, compiledByConsumer } : undefined
  return { help: false as const, check, entry, candidates, packageDir: packageDir ?? '.' }
}

/**
 * Exit codes as every `hozo` command: `0` current or written, `1` stale
 * under `--check`, `2` the manifest could not be built.
 */
export function runManifestCli(
  args: readonly string[],
  cwd = process.cwd(),
  io: ManifestCliIO = console,
  command = 'hozo manifest',
): number {
  try {
    const parsed = parseArguments(args)
    if (parsed.help) {
      io.log(help(command))
      return 0
    }
    const packageDir = path.resolve(cwd, parsed.packageDir)
    let result: ReturnType<typeof writeManifest>
    try {
      result = writeManifest(packageDir, {
        check: parsed.check,
        entry: parsed.entry,
        candidates: parsed.candidates,
      })
    } catch (error) {
      // No package.json, no entry, an entry that does not parse: the
      // package, not its manifest, needs fixing.
      throw new ManifestInputError(
        (error instanceof Error ? error.message : String(error)).replace(/^hozo manifest: /, ''),
        'invalid-package',
      )
    }
    const shown = path.relative(cwd, result.file)
    if (!result.current) {
      io.error(`${shown} is out of date. Run: ${command} ${path.relative(cwd, packageDir) || '.'}`)
      return 1
    }
    io.log(parsed.check ? `${shown} is current` : `wrote ${shown}`)
    return 0
  } catch (error) {
    if (!(error instanceof ManifestInputError)) throw error
    io.error(`${command}: ${error.message} [${error.code}]`)
    return 2
  }
}
