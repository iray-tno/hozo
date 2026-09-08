#!/usr/bin/env node

import { readFileSync } from 'node:fs'
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
      if (value === undefined) throw new TypeError(`${argument} requires a path`)
      configPath = value
      index += 1
    } else throw new TypeError(`Unknown argument ${argument}`)
  }
  return { configPath, check, help }
}

function loadConfig(filePath: string): VerificationConfig {
  const value: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
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

const HELP = `Usage: hozo-links [--config hozo-links.json] [--check]

Generate Universal Links and Android App Links verification files.
--check verifies committed files without changing them.`

export function runVerificationCli(
  args: readonly string[],
  cwd = process.cwd(),
  io: VerificationCliIO = console,
): number {
  try {
    const parsed = parseArguments(args)
    if (parsed.help) {
      io.log(HELP)
      return 0
    }
    const configPath = path.resolve(cwd, parsed.configPath)
    const config = loadConfig(configPath)
    const outputDirectory = path.resolve(
      path.dirname(configPath),
      config.outputDirectory ?? 'public',
    )
    const options = {
      outputDirectory,
      apple: config.apple === undefined ? undefined : createAppleAppSiteAssociation(config.apple),
      android: config.android === undefined ? undefined : createAndroidAssetLinks(config.android),
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

    const written = writeDeepLinkVerificationFiles(options)
    for (const file of Object.values(written)) {
      io.log(`${file.changed ? 'wrote' : 'unchanged'}: ${file.path}`)
    }
    return 0
  } catch (error) {
    io.error(`hozo-links: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runVerificationCli(process.argv.slice(2))
}
