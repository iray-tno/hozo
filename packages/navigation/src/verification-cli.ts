#!/usr/bin/env node
// `hozo links` (RFC 011), and the deprecated `hozo-links` binary, which runs
// the same function.

import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type AndroidAppLinkAssociation,
  type AppleUniversalLinkAssociation,
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
} from './verification.ts'
import {
  checkDeepLinkVerificationFiles,
  writeDeepLinkVerificationFiles,
} from './verification-node.ts'

interface VerificationConfig {
  outputDirectory?: string
  apple?: readonly AppleUniversalLinkAssociation[]
  android?: readonly AndroidAppLinkAssociation[]
}

export interface VerificationCliIO {
  log(message: string): void
  error(message: string): void
}

/** An invocation that cannot run, with a stable string code (RFC 011 §3). */
class LinksInputError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

function parseArguments(args: readonly string[]) {
  let configPath = 'hozo-links.json'
  let check = false
  let help = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--check') check = true
    else if (argument === '--help' || argument === '-h') help = true
    else if (argument === '--config' || argument === '-c') {
      const value = args[index + 1]
      if (value === undefined)
        throw new LinksInputError(`${argument} requires a path`, 'missing-value')
      configPath = value
      index += 1
    } else throw new LinksInputError(`Unknown argument ${argument}`, 'unknown-option')
  }
  return { configPath, check, help }
}

function loadConfig(filePath: string): VerificationConfig {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new LinksInputError(
      `cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      'config-not-found',
    )
  }
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The verification config must be a JSON object')
  }
  const config = value as VerificationConfig
  if (config.outputDirectory !== undefined && typeof config.outputDirectory !== 'string') {
    throw new TypeError('outputDirectory must be a string')
  }
  if (config.apple !== undefined && !Array.isArray(config.apple)) {
    throw new TypeError('apple must be an array of associations')
  }
  if (config.android !== undefined && !Array.isArray(config.android)) {
    throw new TypeError('android must be an array of associations')
  }
  return config
}

const help = (command: string) => `Usage: ${command} [--config hozo-links.json] [--check]

Generate Universal Links and Android App Links verification files.
--check verifies committed files without changing them.`

/**
 * Exit codes as every `hozo` command: `0` written or current, `1` stale
 * under `--check`, `2` the command could not run.
 */
export function runVerificationCli(
  args: readonly string[],
  cwd = process.cwd(),
  io: VerificationCliIO = console,
  command = 'hozo links',
): number {
  try {
    const parsed = parseArguments(args)
    if (parsed.help) {
      io.log(help(command))
      return 0
    }
    const configPath = path.resolve(cwd, parsed.configPath)
    let options: Parameters<typeof writeDeepLinkVerificationFiles>[0]
    try {
      const config = loadConfig(configPath)
      options = {
        outputDirectory: path.resolve(path.dirname(configPath), config.outputDirectory ?? 'public'),
        apple: config.apple === undefined ? undefined : createAppleAppSiteAssociation(config.apple),
        android: config.android === undefined ? undefined : createAndroidAssetLinks(config.android),
      }
    } catch (error) {
      if (error instanceof LinksInputError) throw error
      // Malformed JSON, a wrong field type, an invalid app ID or fingerprint.
      throw new LinksInputError(
        error instanceof Error ? error.message : String(error),
        'invalid-config',
      )
    }

    if (parsed.check) {
      const checked = checkDeepLinkVerificationFiles(options)
      const stale = Object.values(checked).filter((file) => !file.current)
      if (stale.length > 0) {
        for (const file of stale) io.error(`out of date: ${file.path}`)
        return 1
      }
      for (const file of Object.values(checked)) io.log(`current: ${file.path}`)
      return 0
    }

    let written: ReturnType<typeof writeDeepLinkVerificationFiles>
    try {
      written = writeDeepLinkVerificationFiles(options)
    } catch (error) {
      throw new LinksInputError(
        error instanceof Error ? error.message : String(error),
        'write-failed',
      )
    }
    for (const file of Object.values(written)) {
      io.log(`${file.changed ? 'wrote' : 'unchanged'}: ${file.path}`)
    }
    return 0
  } catch (error) {
    if (!(error instanceof LinksInputError)) throw error
    io.error(`${command}: ${error.message} [${error.code}]`)
    return 2
  }
}

// Run as the deprecated binary. `realpathSync`, since npm links a package's
// bin into `node_modules/.bin` as a symlink, and `argv[1]` is the link's
// path while `import.meta.url` is the file's.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(path.resolve(process.argv[1]))
) {
  console.error('hozo-links is deprecated; run `hozo links` from @hozo/cli instead.')
  process.exitCode = runVerificationCli(process.argv.slice(2), process.cwd(), console, 'hozo-links')
}
