import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  type AndroidAssetLinkStatement,
  type AppleAppSiteAssociation,
  serializeDeepLinkVerification,
} from './verification.ts'

export interface DeepLinkVerificationFiles {
  apple?: AppleAppSiteAssociation
  android?: readonly AndroidAssetLinkStatement[]
}

export interface WriteDeepLinkVerificationOptions extends DeepLinkVerificationFiles {
  /** Web framework public/static directory that owns the `.well-known` folder. */
  outputDirectory: string
}

export interface WrittenVerificationFile {
  path: string
  /** False when an identical file was already present. */
  changed: boolean
}

export interface WrittenDeepLinkVerificationFiles {
  apple?: WrittenVerificationFile
  android?: WrittenVerificationFile
}

function writeIfChanged(filePath: string, content: string): boolean {
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) return false
  writeFileSync(filePath, content, 'utf8')
  return true
}

/**
 * Writes platform association documents into a framework's public directory.
 *
 * The function only owns the two fixed files inside `.well-known`; it never
 * removes unrelated deployment assets.
 */
export function writeDeepLinkVerificationFiles({
  outputDirectory,
  apple,
  android,
}: WriteDeepLinkVerificationOptions): WrittenDeepLinkVerificationFiles {
  if (apple === undefined && android === undefined) {
    throw new TypeError('At least one Apple or Android verification document is required')
  }

  const directory = path.resolve(outputDirectory, '.well-known')
  mkdirSync(directory, { recursive: true })
  const written: WrittenDeepLinkVerificationFiles = {}

  if (apple !== undefined) {
    const filePath = path.join(directory, 'apple-app-site-association')
    written.apple = {
      path: filePath,
      changed: writeIfChanged(filePath, serializeDeepLinkVerification(apple)),
    }
  }
  if (android !== undefined) {
    const filePath = path.join(directory, 'assetlinks.json')
    written.android = {
      path: filePath,
      changed: writeIfChanged(filePath, serializeDeepLinkVerification(android)),
    }
  }

  return written
}
