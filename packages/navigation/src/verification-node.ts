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

export interface CheckedVerificationFile {
  path: string
  current: boolean
}

export interface CheckedDeepLinkVerificationFiles {
  apple?: CheckedVerificationFile
  android?: CheckedVerificationFile
}

function writeIfChanged(filePath: string, content: string): boolean {
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) return false
  writeFileSync(filePath, content, 'utf8')
  return true
}

function documents({ outputDirectory, apple, android }: WriteDeepLinkVerificationOptions) {
  const directory = path.resolve(outputDirectory, '.well-known')
  return {
    directory,
    apple:
      apple === undefined
        ? undefined
        : {
            path: path.join(directory, 'apple-app-site-association'),
            content: serializeDeepLinkVerification(apple),
          },
    android:
      android === undefined
        ? undefined
        : {
            path: path.join(directory, 'assetlinks.json'),
            content: serializeDeepLinkVerification(android),
          },
  }
}

function requireDocument(options: DeepLinkVerificationFiles): void {
  if (options.apple === undefined && options.android === undefined) {
    throw new TypeError('At least one Apple or Android verification document is required')
  }
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
  requireDocument({ apple, android })
  const expected = documents({ outputDirectory, apple, android })
  const { directory } = expected
  mkdirSync(directory, { recursive: true })
  const written: WrittenDeepLinkVerificationFiles = {}

  if (expected.apple !== undefined) {
    written.apple = {
      path: expected.apple.path,
      changed: writeIfChanged(expected.apple.path, expected.apple.content),
    }
  }
  if (expected.android !== undefined) {
    written.android = {
      path: expected.android.path,
      changed: writeIfChanged(expected.android.path, expected.android.content),
    }
  }

  return written
}

/** Checks generated deployment files without creating or changing anything. */
export function checkDeepLinkVerificationFiles(
  options: WriteDeepLinkVerificationOptions,
): CheckedDeepLinkVerificationFiles {
  requireDocument(options)
  const expected = documents(options)
  const checked: CheckedDeepLinkVerificationFiles = {}
  if (expected.apple !== undefined) {
    checked.apple = {
      path: expected.apple.path,
      current:
        existsSync(expected.apple.path) &&
        readFileSync(expected.apple.path, 'utf8') === expected.apple.content,
    }
  }
  if (expected.android !== undefined) {
    checked.android = {
      path: expected.android.path,
      current:
        existsSync(expected.android.path) &&
        readFileSync(expected.android.path, 'utf8') === expected.android.content,
    }
  }
  return checked
}
