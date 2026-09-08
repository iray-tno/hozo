import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createAndroidAssetLinks, createAppleAppSiteAssociation } from './verification.ts'
import {
  checkDeepLinkVerificationFiles,
  writeDeepLinkVerificationFiles,
} from './verification-node.ts'

const apple = createAppleAppSiteAssociation([{ appIDs: ['ABCDE12345.com.example.app'] }])
const android = createAndroidAssetLinks([
  {
    packageName: 'com.example.app',
    sha256CertFingerprints: ['0123456789abcdef'.repeat(4)],
  },
])

test('writes both fixed verification paths below a public directory', () => {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'hozo-links-'))
  try {
    const written = writeDeepLinkVerificationFiles({ outputDirectory, apple, android })
    const applePath = path.join(outputDirectory, '.well-known', 'apple-app-site-association')
    const androidPath = path.join(outputDirectory, '.well-known', 'assetlinks.json')

    assert.deepEqual(written, {
      apple: { path: applePath, changed: true },
      android: { path: androidPath, changed: true },
    })
    assert.deepEqual(JSON.parse(readFileSync(applePath, 'utf8')), apple)
    assert.deepEqual(JSON.parse(readFileSync(androidPath, 'utf8')), android)

    assert.deepEqual(writeDeepLinkVerificationFiles({ outputDirectory, apple, android }), {
      apple: { path: applePath, changed: false },
      android: { path: androidPath, changed: false },
    })
    assert.deepEqual(checkDeepLinkVerificationFiles({ outputDirectory, apple, android }), {
      apple: { path: applePath, current: true },
      android: { path: androidPath, current: true },
    })
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
})

test('writes only the platform documents explicitly supplied', () => {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'hozo-links-'))
  try {
    const written = writeDeepLinkVerificationFiles({ outputDirectory, apple })
    assert.equal(written.apple?.changed, true)
    assert.equal(written.android, undefined)
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
})

test('refuses an empty write that would only create a directory', () => {
  assert.throws(() => writeDeepLinkVerificationFiles({ outputDirectory: tmpdir() }), /At least one/)
})

test('a check reports missing files without creating the directory', () => {
  const outputDirectory = path.join(tmpdir(), `hozo-links-missing-${process.pid}-${Date.now()}`)
  const checked = checkDeepLinkVerificationFiles({ outputDirectory, apple })
  assert.equal(checked.apple?.current, false)
  assert.equal(existsSync(outputDirectory), false)
})
