import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  configureVersion,
  installNotes,
  prepareAndroid,
  prepareAssets,
  prepareIos,
  publishAssets,
  releaseIdentity,
  SHOWCASE_CHECKS,
  signingCertificateSha256,
  signingCredentials,
  validateEvidence,
} from './showcase-release.mjs'

const env = {
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '123456',
  GITHUB_REPOSITORY: 'iray-tno/hozo',
  GITHUB_REF: 'refs/tags/v0.2.0',
}
const identity = releaseIdentity('0.2.0', env)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value))
const proof = (platform, scenario = 'full') => ({
  platform,
  scenario,
  passed: true,
  diagnostic: false,
  driverCommit: identity.commit,
  binaryRun: identity.run,
  ...(platform === 'iOS' && scenario === 'full' ? { canvasMode: 'demand', axBackend: 'ax' } : {}),
  checks: SHOWCASE_CHECKS[scenario === 'svg-filters' ? 'svg' : platform].map((name) => ({
    name,
    passed: true,
  })),
})

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-showcase-release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = path.join(root, 'artifacts/showcase-input')
  for (const [platform, scenario, artifact] of [
    ['Android', 'full', 'hozo-native-showcase-android-evidence'],
    ['Android', 'svg-filters', 'hozo-native-showcase-android-svg-evidence'],
    ['iOS', 'full', 'hozo-native-showcase-ios-evidence'],
    ['iOS', 'svg-filters', 'hozo-native-showcase-ios-svg-evidence'],
  ]) {
    mkdirSync(path.join(input, artifact), { recursive: true })
    writeJson(path.join(input, artifact, 'evidence.json'), proof(platform, scenario))
  }
  const android = path.join(input, 'hozo-native-showcase-android-apk')
  const ios = path.join(input, 'hozo-native-showcase-ios-simulator-app')
  mkdirSync(android)
  mkdirSync(ios)
  writeFileSync(path.join(android, 'app-release.apk'), 'fixture signed APK')
  writeFileSync(path.join(ios, 'HozoShowcase-simulator.zip'), 'fixture simulator archive')
  const signing = {
    mode: 'release',
    commit: identity.commit,
    run: identity.run,
    certificateSha256: 'b'.repeat(64),
    apkSha256: hash('fixture signed APK'),
  }
  writeJson(path.join(android, 'signing.json'), signing)
  const simulator = {
    commit: identity.commit,
    run: identity.run,
    architectures: ['arm64'],
    minimumOSVersion: '15.1',
    version: identity.version,
    archiveSha256: hash('fixture simulator archive'),
  }
  writeJson(path.join(ios, 'build.json'), simulator)
  mkdirSync(path.join(root, 'packages/core'), { recursive: true })
  writeFileSync(
    path.join(root, 'CHANGELOG.md'),
    '# @hozo/core\n\n## 0.2.0\n\n### Minor Changes\n\n- Real curated notes with `backticks`.\n\n## 0.1.0\n\n- Old release.\n',
  )
  return {
    root,
    input,
    signing,
    simulator,
    android,
    ios,
    output: path.join(root, 'artifacts/showcase-release'),
  }
}

test('release identity rejects wrong tags, missing provenance and unsafe versions', () => {
  assert.throws(() => releaseIdentity('../bad', env))
  assert.throws(() => releaseIdentity('0.3.0', env), /disagree/)
  assert.throws(() => releaseIdentity('0.2.0', { ...env, GITHUB_SHA: undefined }))
  assert.deepEqual(releaseIdentity('0.2.0', { ...env, GITHUB_REF: 'refs/heads/main' }), identity)
})

test('every full and SVG proof rejects failure, omissions, partial and reused evidence', () => {
  for (const platform of ['Android', 'iOS'])
    for (const scenario of ['full', 'svg-filters']) {
      validateEvidence(proof(platform, scenario), platform, scenario, identity)
      for (const mutation of [
        { passed: false },
        { diagnostic: true },
        { driverCommit: 'b'.repeat(40) },
        { binaryRun: 'other' },
        { scenario: 'canvas' },
        { error: 'failed' },
        { jsBundleCommit: identity.commit },
        { platform: 'Web' },
        { checks: [] },
        { checks: [...proof(platform, scenario).checks, proof(platform, scenario).checks[0]] },
        { checks: proof(platform, scenario).checks.map((check) => ({ ...check, passed: false })) },
      ])
        assert.throws(() =>
          validateEvidence(
            { ...proof(platform, scenario), ...mutation },
            platform,
            scenario,
            identity,
          ),
        )
    }
  assert.throws(() =>
    validateEvidence({ ...proof('iOS'), canvasMode: 'paced' }, 'iOS', 'full', identity),
  )
  assert.throws(() =>
    validateEvidence({ ...proof('iOS'), axBackend: 'axbridge' }, 'iOS', 'full', identity),
  )
})

test('artifact assembly preserves the measured bytes and records hashes, all proofs and installation instructions', (t) => {
  const { root, output, android } = fixture(t)
  const manifest = prepareAssets(root, identity, true)
  assert.equal(manifest.evidence.length, 4)
  assert.equal(manifest.signing.mode, 'release')
  assert.equal(manifest.evidence[0].checks.length, 10)
  assert.equal(manifest.evidence[2].checks.length, 9)
  assert.deepEqual(
    readFileSync(path.join(output, manifest.assets[0].name)),
    readFileSync(path.join(android, 'app-release.apk')),
  )
  for (const asset of manifest.assets) {
    assert.equal(hash(readFileSync(path.join(output, asset.name))), asset.sha256)
    assert.ok(
      readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').includes(
        `${asset.sha256}  ${asset.name}`,
      ),
    )
  }
  assert.match(
    readFileSync(path.join(output, 'INSTALL.md'), 'utf8'),
    /iOS Simulator \(not iPhone\)/,
  )
  assert.match(installNotes(identity, false, manifest.simulator), /DEBUG-SIGNED PREVIEW ONLY/)
  assert.throws(() => prepareAssets(root, identity, true), /already exists/)
})

test('bad or missing artifacts fail closed without any shipping output', (t) => {
  const cases = [
    (f) =>
      writeJson(path.join(f.input, 'hozo-native-showcase-ios-evidence/evidence.json'), {
        ...proof('iOS'),
        passed: false,
      }),
    (f) => rmSync(path.join(f.ios, 'HozoShowcase-simulator.zip')),
    (f) =>
      writeFileSync(
        path.join(f.android, 'app-release.apk'),
        'tampered after signature verification',
      ),
    (f) => writeJson(path.join(f.android, 'signing.json'), { ...f.signing, mode: 'debug-preview' }),
    (f) =>
      writeJson(path.join(f.android, 'signing.json'), { ...f.signing, commit: 'b'.repeat(40) }),
    (f) => writeFileSync(path.join(f.ios, 'HozoShowcase-simulator.zip'), ''),
    (f) => writeFileSync(path.join(f.ios, 'HozoShowcase-simulator.zip'), 'tampered archive'),
    (f) => writeJson(path.join(f.ios, 'build.json'), { ...f.simulator, version: '0.1.0' }),
    (f) => writeFileSync(path.join(f.root, 'CHANGELOG.md'), '## 0.1.0\n\nOld notes only.\n'),
  ]
  for (const mutate of cases) {
    const f = fixture(t)
    mutate(f)
    assert.throws(() => prepareAssets(f.root, identity, true))
    assert.equal(existsSync(f.output), false)
  }
})

test('signing fails before compiling when secrets are missing; private material never appears in error text', () => {
  assert.throws(() => signingCredentials({}), /SHOWCASE_ANDROID_KEYSTORE_BASE64/)
  assert.throws(() => signingCredentials({ SHOWCASE_ANDROID_KEYSTORE_BASE64: 'a2V5' }), /PASSWORD/)
  assert.throws(
    () =>
      signingCredentials({
        SHOWCASE_ANDROID_KEYSTORE_BASE64: 'not_a_secret!',
        SHOWCASE_ANDROID_KEYSTORE_PASSWORD: 'pw',
      }),
    (error) => !error.message.includes('not_a_secret!'),
  )
  assert.throws(() => signingCredentials({ HOZO_REUSE_BUILD_RUN: '123' }), /fresh build/)
  assert.deepEqual(
    signingCredentials({
      SHOWCASE_ANDROID_KEYSTORE_BASE64: 'a2V5\n',
      SHOWCASE_ANDROID_KEYSTORE_PASSWORD: 'pw',
    }),
    Buffer.from('key'),
  )
})

test('signing fingerprints support numbered and SDK-scoped signers but refuse ambiguous certificates', () => {
  const fingerprint = 'b'.repeat(64)
  assert.equal(
    signingCertificateSha256(`Signer #1 certificate SHA-256 digest: ${fingerprint}\r\n`),
    fingerprint,
  )
  assert.equal(
    signingCertificateSha256(
      [
        `Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${fingerprint.toUpperCase()}`,
        `Signer (minSdkVersion=28 (dev release=true), maxSdkVersion=32) certificate SHA-256 digest: ${fingerprint}`,
      ].join('\n'),
    ),
    fingerprint,
  )
  assert.throws(
    () =>
      signingCertificateSha256(
        [
          `Signer #1 certificate SHA-256 digest: ${fingerprint}`,
          `Signer #2 certificate SHA-256 digest: ${'c'.repeat(64)}`,
        ].join('\n'),
      ),
    /single signing certificate/,
  )
  for (const output of [
    '',
    `Source Stamp Signer certificate SHA-256 digest: ${fingerprint}`,
    `Signer #1 public key SHA-256 digest: ${fingerprint}`,
    `Signer #1 certificate SHA-256 digest: ${fingerprint}ff`,
    `Signer #1 certificate SHA-256 digest: ${'z'.repeat(64)}`,
  ])
    assert.throws(() => signingCertificateSha256(output), /fingerprint is missing/)
})

test('Android re-signs before fingerprinting, uses env passwords and removes only its temporary key directory', (t) => {
  const { root } = fixture(t)
  const apk = path.join(
    root,
    'examples/native-showcase/android/app/build/outputs/apk/release/app-release.apk',
  )
  mkdirSync(path.dirname(apk), { recursive: true })
  writeFileSync(apk, 'debug signed')
  const sdk = path.join(root, 'sdk')
  mkdirSync(path.join(sdk, 'build-tools/36.0.0'), { recursive: true })
  writeFileSync(path.join(sdk, 'build-tools/36.0.0/apksigner'), 'fixture signer')
  const temporary = path.join(root, 'runner-temp')
  mkdirSync(temporary)
  const calls = []
  const run = (_command, args) => {
    calls.push(args)
    if (args[0] === 'sign') {
      assert.equal(readFileSync(args[args.indexOf('--ks') + 1], 'utf8'), 'key')
      assert.ok(args.includes('env:SHOWCASE_ANDROID_KEYSTORE_PASSWORD'))
      writeFileSync(args[args.indexOf('--out') + 1], 'fixed signed')
    } else if (args.includes('--print-certs')) {
      assert.equal(readFileSync(apk, 'utf8'), 'fixed signed')
      return `Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${'b'.repeat(64)}\n`
    }
    return ''
  }
  prepareAndroid(
    root,
    {
      ...env,
      ANDROID_HOME: sdk,
      RUNNER_TEMP: temporary,
      HOZO_RELEASE_SIGNING: '1',
      SHOWCASE_ANDROID_KEYSTORE_BASE64: 'a2V5',
      SHOWCASE_ANDROID_KEYSTORE_PASSWORD: 'never-in-argv',
    },
    run,
  )
  assert.deepEqual(
    calls.map((args) => args[0]),
    ['sign', 'verify', 'verify'],
  )
  assert.ok(!JSON.stringify(calls).includes('never-in-argv'))
  assert.deepEqual(readdirSync(temporary), [])
  assert.equal(
    JSON.parse(readFileSync(path.join(path.dirname(apk), 'signing.json'))).apkSha256,
    hash('fixed signed'),
  )
})

test('showcase runtime version follows the library without changing application identities; build codes advance', () => {
  const app = {
    expo: {
      name: 'Hozo Showcase',
      android: { package: 'dev.hozo.showcase' },
      ios: { bundleIdentifier: 'dev.hozo.showcase' },
    },
  }
  const next = configureVersion(app, identity, '123')
  assert.equal(next.expo.version, '0.2.0')
  assert.equal(next.expo.android.versionCode, 123)
  assert.equal(next.expo.ios.buildNumber, '123')
  assert.equal(next.expo.android.package, app.expo.android.package)
  for (const bad of ['0', '-1', '1.5', 'abc', '2100000001'])
    assert.throws(() => configureVersion(app, identity, bad))
})

test('iOS metadata records the actual compiled architecture and minimum runtime rather than assuming the runner', (t) => {
  const { root } = fixture(t)
  const directory = path.join(root, 'examples/native-showcase/ios')
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'HozoShowcase-simulator.zip'), 'built archive')
  const metadata = {
    CFBundleExecutable: 'HozoShowcase',
    MinimumOSVersion: '15.1',
    CFBundleShortVersionString: '0.2.0',
  }
  prepareIos(root, env, (command, args) =>
    command === 'xcrun' ? 'arm64\n' : metadata[args[1].slice('Print :'.length)],
  )
  const result = JSON.parse(readFileSync(path.join(directory, 'build.json')))
  assert.deepEqual(result.architectures, ['arm64'])
  assert.equal(result.minimumOSVersion, '15.1')
  assert.equal(result.archiveSha256, hash('built archive'))
})

test('publication preserves curated changelog text and attaches all five files before exposing the release', (t) => {
  const { root, output } = fixture(t)
  prepareAssets(root, identity, true)
  const calls = []
  publishAssets(root, identity, (_command, args) => {
    calls.push(args)
    return args[0] === 'api' ? '[[]]' : ''
  })
  assert.deepEqual(
    calls.map((args) => args.slice(0, 2)),
    [
      ['api', 'repos/iray-tno/hozo/releases'],
      ['release', 'create'],
      ['release', 'upload'],
      ['release', 'edit'],
    ],
  )
  assert.ok(
    calls[1].includes('--draft') &&
      calls[1].includes('--verify-tag') &&
      calls[1].includes('--prerelease'),
  )
  assert.equal(calls[2].filter((arg) => arg.startsWith(output)).length, 5)
  assert.ok(calls[3].includes('--draft=false'))
  const notes = readFileSync(path.join(output, 'release-notes.md'), 'utf8')
  assert.ok(notes.includes('Real curated notes with `backticks`.'))
  assert.ok(!notes.includes('Old release.'))
})

test('publication refuses existing public releases and tampered files; a failed upload leaves the release draft', (t) => {
  const { root, output } = fixture(t)
  const manifest = prepareAssets(root, identity, true)
  const calls = []
  assert.throws(
    () =>
      publishAssets(root, identity, (_command, args) => {
        calls.push(args)
        return JSON.stringify([[{ tag_name: identity.tag, draft: false }]])
      }),
    /already published/,
  )
  assert.equal(calls.length, 1)
  calls.length = 0
  assert.throws(
    () =>
      publishAssets(root, identity, (_command, args) => {
        calls.push(args)
        if (args[0] === 'api') return '[[]]'
        if (args[1] === 'upload') throw new Error('upload failed')
        return ''
      }),
    /upload failed/,
  )
  assert.ok(!calls.some((args) => args[1] === 'edit'))
  writeFileSync(path.join(output, manifest.assets[0].name), 'tampered')
  assert.throws(() => publishAssets(root, identity, () => assert.fail('no remote call permitted')))
})

test('only a same-source draft can recover an interrupted asset upload', (t) => {
  const { root } = fixture(t)
  prepareAssets(root, identity, true)
  const calls = []
  publishAssets(root, identity, (_command, args) => {
    calls.push(args)
    return args[0] === 'api'
      ? JSON.stringify([
          [{ tag_name: identity.tag, draft: true, body: `Source: ${identity.commit}` }],
        ])
      : ''
  })
  assert.deepEqual(
    calls.map((args) => args[1]),
    ['repos/iray-tno/hozo/releases', 'upload', 'edit'],
  )
  assert.throws(
    () =>
      publishAssets(root, identity, () =>
        JSON.stringify([[{ tag_name: identity.tag, draft: true, body: 'unknown source' }]]),
      ),
    /source is not verified/,
  )
})
