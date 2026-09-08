import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
  DEEP_LINK_VERIFICATION_PATHS,
  serializeDeepLinkVerification,
} from './verification.ts'

test('creates a modern Apple association with ordered include and exclude components', () => {
  assert.deepEqual(
    createAppleAppSiteAssociation([
      {
        appIDs: ['ABCDE12345.com.example.app', 'ABCDE12345.com.example.app'],
        components: [
          { path: '/account/delete', exclude: true, comment: 'Keep destructive links on Web' },
          { path: '/products/*', query: { ref: '*' } },
        ],
      },
    ]),
    {
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.example.app'],
            components: [
              {
                '/': '/account/delete',
                exclude: true,
                comment: 'Keep destructive links on Web',
              },
              { '/': '/products/*', '?': { ref: '*' } },
            ],
          },
        ],
      },
    },
  )
})

test('omitting Apple components deliberately matches the whole associated domain', () => {
  assert.deepEqual(createAppleAppSiteAssociation([{ appIDs: ['ABCDE12345.com.example.app'] }]), {
    applinks: { details: [{ appIDs: ['ABCDE12345.com.example.app'] }] },
  })
})

test('creates Android statements and canonicalizes certificate fingerprints', () => {
  const compact = '0123456789abcdef'.repeat(4)
  const canonical = compact.toUpperCase().match(/.{2}/g)!.join(':')
  assert.deepEqual(
    createAndroidAssetLinks([
      {
        packageName: 'com.example.app',
        sha256CertFingerprints: [compact, canonical],
      },
    ]),
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.example.app',
          sha256_cert_fingerprints: [canonical],
        },
      },
    ],
  )
})

test('rejects association files that platforms cannot verify', () => {
  assert.throws(() => createAppleAppSiteAssociation([]), /at least one/)
  assert.throws(
    () => createAppleAppSiteAssociation([{ appIDs: ['missing-prefix-separator'] }]),
    /Apple application identifier/,
  )
  assert.throws(
    () =>
      createAndroidAssetLinks([
        { packageName: 'example', sha256CertFingerprints: ['not-a-fingerprint'] },
      ]),
    /package name/,
  )
  assert.throws(
    () =>
      createAndroidAssetLinks([
        { packageName: 'com.example.app', sha256CertFingerprints: ['bad'] },
      ]),
    /fingerprint/,
  )
})

test('publishes exact well-known paths and newline-terminated JSON', () => {
  assert.deepEqual(DEEP_LINK_VERIFICATION_PATHS, {
    apple: '/.well-known/apple-app-site-association',
    android: '/.well-known/assetlinks.json',
  })
  assert.equal(serializeDeepLinkVerification({ ok: true }), '{\n  "ok": true\n}\n')
})
