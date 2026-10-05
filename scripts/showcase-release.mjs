// The artifact gate is intentionally offline. It cannot turn a reused binary,
// diagnostic scene or partial check into a release just because a job was green.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOWCASE_CHECKS = {
  Android: [
    'counter increments and resets',
    'Storybook selector switches stories',
    'disabled button does not activate',
    'native keyboard input and save',
    'shared checkbox and switch change state, disabled checkbox stays checked',
    'shared tabs switch panels and reject disabled selection',
    'shared dialog opens, Android Back cancels, confirmation saves',
    'Expo GL renders and animates the actual scene',
    'background/resume preserves interactive rendering',
    'switching away from GPU story keeps the app usable',
  ],
  iOS: [
    'counter increments and resets',
    'Storybook selector switches stories',
    'disabled button does not activate',
    'native keyboard input and save',
    'shared checkbox and switch change state, disabled checkbox does not activate',
    'shared tabs switch panels and reject disabled selection',
    'shared dialog opens, cancels and confirms',
    'Expo GL renders and animates the actual scene',
    'switching away from GPU story keeps the app usable',
  ],
  svg: ['color', 'blur', 'shadow', 'composition', 'blend'].map(
    (kind) => `SVG ${kind} renders its effect and restores unfiltered pixels`,
  ),
}

export function releaseIdentity(version, env) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'invalid library version')
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'missing source SHA')
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/, 'missing run ID')
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[\w.-]+\/[\w.-]+$/, 'missing repository')
  const tag = `v${version}`
  if (env.GITHUB_REF?.startsWith('refs/tags/')) {
    assert.equal(env.GITHUB_REF, `refs/tags/${tag}`, 'tag and package version disagree')
  }
  return {
    version,
    tag,
    commit: env.GITHUB_SHA,
    run: env.GITHUB_RUN_ID,
    repository: env.GITHUB_REPOSITORY,
  }
}

export function validateEvidence(evidence, platform, scenario, identity) {
  assert.equal(evidence.passed, true, `${platform} ${scenario} did not pass`)
  assert.equal(evidence.platform, platform)
  assert.equal(evidence.scenario, scenario)
  assert.equal(evidence.diagnostic, false, 'diagnostic evidence cannot certify a release')
  assert.equal(evidence.driverCommit, identity.commit, 'driver source mismatch')
  assert.equal(String(evidence.binaryRun), identity.run, 'reused binary is not release evidence')
  assert.ok(!evidence.jsBundleCommit, 'rebundled binary is not release evidence')
  assert.ok(!evidence.error, 'evidence contains a failure')
  if (platform === 'iOS' && scenario === 'full') {
    assert.equal(evidence.canvasMode, 'demand', 'only canonical demand mode certifies a release')
    assert.equal(evidence.axBackend, 'ax')
  }
  const required = SHOWCASE_CHECKS[scenario === 'svg-filters' ? 'svg' : platform]
  assert.ok(Array.isArray(evidence.checks))
  assert.ok(
    evidence.checks.every((check) => check.passed === true),
    'failed check',
  )
  const names = evidence.checks.map((check) => check.name)
  assert.equal(new Set(names).size, names.length, 'duplicate check')
  for (const name of required) assert.ok(names.includes(name), `missing ${platform} check: ${name}`)
  return evidence
}

export function signingCredentials(env) {
  assert.ok(!env.HOZO_REUSE_BUILD_RUN, 'release signing requires a fresh build')
  for (const name of ['SHOWCASE_ANDROID_KEYSTORE_BASE64', 'SHOWCASE_ANDROID_KEYSTORE_PASSWORD']) {
    assert.ok(env[name]?.trim(), `Configure the GitHub Actions secret ${name} before releasing`)
  }
  const encoded = env.SHOWCASE_ANDROID_KEYSTORE_BASE64.replace(/\s/g, '')
  assert.ok(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
    'invalid signing keystore encoding',
  )
  const keystore = Buffer.from(encoded, 'base64')
  assert.ok(keystore.length > 0, 'empty signing keystore')
  return keystore
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

export function prepareAssets(root, identity, releaseSigning) {
  const input = path.join(root, 'artifacts/showcase-input')
  const output = path.join(root, 'artifacts/showcase-release')
  const proofs = [
    ['Android', 'full', 'hozo-native-showcase-android-evidence'],
    ['Android', 'svg-filters', 'hozo-native-showcase-android-svg-evidence'],
    ['iOS', 'full', 'hozo-native-showcase-ios-evidence'],
    ['iOS', 'svg-filters', 'hozo-native-showcase-ios-svg-evidence'],
  ].map(([platform, scenario, artifact]) =>
    validateEvidence(
      readJson(path.join(input, artifact, 'evidence.json')),
      platform,
      scenario,
      identity,
    ),
  )
  const signing = readJson(path.join(input, 'hozo-native-showcase-android-apk/signing.json'))
  assert.equal(signing.mode, releaseSigning ? 'release' : 'debug-preview')
  assert.equal(signing.commit, identity.commit)
  assert.equal(String(signing.run), identity.run)
  assert.match(signing.certificateSha256, /^[a-f0-9]{64}$/)
  const simulator = readJson(path.join(input, 'hozo-native-showcase-ios-simulator-app/build.json'))
  assert.equal(simulator.commit, identity.commit)
  assert.equal(String(simulator.run), identity.run)
  assert.ok(simulator.architectures.length > 0)
  assert.ok(simulator.architectures.every((arch) => ['arm64', 'x86_64'].includes(arch)))
  assert.match(simulator.minimumOSVersion, /^\d+(?:\.\d+)*$/)
  assert.equal(simulator.version, identity.version)
  const assets = [
    ['android.apk', 'hozo-native-showcase-android-apk/app-release.apk'],
    ['ios-simulator.app.zip', 'hozo-native-showcase-ios-simulator-app/HozoShowcase-simulator.zip'],
  ].map(([suffix, relative]) => {
    const source = path.join(input, relative)
    const bytes = readFileSync(source)
    assert.ok(bytes.length > 0, `empty ${suffix}`)
    if (suffix === 'android.apk')
      assert.equal(digest(bytes), signing.apkSha256, 'APK changed after signing')
    else
      assert.equal(digest(bytes), simulator.archiveSha256, 'Simulator archive changed after build')
    return {
      name: `hozo-showcase-${identity.tag}-${suffix}`,
      source,
      sha256: digest(bytes),
      bytes: bytes.length,
    }
  })
  const notes = releaseNotes(root, identity)
  // All proofs and files are checked before writing any shipping output.
  assert.ok(
    !existsSync(output),
    'asset output already exists; use a fresh runner, do not overwrite it',
  )
  mkdirSync(output, { recursive: true })
  for (const asset of assets) copyFileSync(asset.source, path.join(output, asset.name))
  const manifest = {
    schemaVersion: 1,
    ...identity,
    signing,
    simulator,
    assets: assets.map(({ source: _, ...asset }) => asset),
    evidence: proofs,
    limits: [
      'iOS Simulator only; no iPhone IPA or TestFlight',
      'Emulator checks are not physical-device or interactive-performance proof',
    ],
  }
  writeJson(path.join(output, 'showcase-manifest.json'), manifest)
  writeFileSync(
    path.join(output, 'SHA256SUMS'),
    `${assets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n')}\n`,
  )
  writeFileSync(path.join(output, 'INSTALL.md'), installNotes(identity, releaseSigning, simulator))
  writeFileSync(path.join(output, 'release-notes.md'), notes)
  return manifest
}

function releaseNotes(root, identity) {
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  const entry = new RegExp(
    `^## ${identity.version.replaceAll('.', '\\.')}\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
    'm',
  ).exec(changelog)?.[1]
  assert.ok(entry?.trim(), 'release changelog entry is missing')
  const linked = entry
    .trim()
    .replace(
      /\]\((?![a-z]+:|#|\/)([^)]+)\)/gi,
      (_match, relative) =>
        `](https://github.com/${identity.repository}/blob/${identity.tag}/${relative})`,
    )
  return `${linked}\n\n## Native showcase\n\nStandalone Android APK and iOS Simulator app are attached. See INSTALL.md and showcase-manifest.json for installation, source, checks and limitations.\n\nSource: ${identity.commit}\nBuild: https://github.com/${identity.repository}/actions/runs/${identity.run}\n`
}

export function installNotes(identity, releaseSigning, simulator) {
  return `# Hozo showcase ${identity.tag}

Source: ${identity.commit}
Build and full Android/iOS verification: https://github.com/${identity.repository}/actions/runs/${identity.run}

## Android

Download hozo-showcase-${identity.tag}-android.apk to an arm64 phone and open it.
Allow installation from that browser/file manager if Android requests it.
The APK includes the JavaScript bundle: no Metro server or Expo Go is needed.
Alternatively, with Android platform tools and USB debugging:

\`\`\`sh
adb install -r hozo-showcase-${identity.tag}-android.apk
\`\`\`

${releaseSigning ? 'Signed with the fixed showcase key; keep that key for future updates.' : 'DEBUG-SIGNED PREVIEW ONLY. Not a public-release APK; future previews may need uninstalling before installation.'}
If a previous CI/debug-signed version is installed, uninstall it before the first
fixed-key version (this removes its saved settings). The APK supports arm64-v8a and x86_64.

## iOS Simulator (not iPhone)

On a Mac with Xcode and a compatible iOS Simulator runtime,
extract hozo-showcase-${identity.tag}-ios-simulator.app.zip and boot a simulator.
Then, from the directory containing HozoShowcase.app:

\`\`\`sh
xcrun simctl install booted HozoShowcase.app
xcrun simctl launch booted dev.hozo.showcase
\`\`\`

Architectures: ${simulator.architectures.join(', ')}. Minimum iOS runtime: ${simulator.minimumOSVersion}.
This archive runs only on compatible Simulator hosts; it is not an iPhone IPA
or TestFlight distribution. The production JS bundle is included.
For a physical iPhone, build the source on a Mac and select your Personal Team
under Xcode Signing & Capabilities. A free Apple Account permits personal testing;
its provisioning expires after seven days. Enable Developer Mode on the iPhone.
See https://developer.apple.com/support/compare-memberships/ and
https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device.

## Integrity and scope

SHA256SUMS lists both binaries; showcase-manifest.json includes their hashes,
Android signing certificate fingerprint, source/run and all full/SVG check results.
The APK was tested after signing. These checks run on emulators/simulators, not
physical phones. Functional Canvas checks do not certify interactive GPU performance.
TestFlight is not configured. See examples/native-showcase/README.md in the source
for local build requirements and stories.
`
}

export function configureVersion(app, identity, runNumber) {
  const code = Number(runNumber)
  assert.ok(
    Number.isInteger(code) && code > 0 && code <= 2100000000,
    'invalid Android version code',
  )
  return {
    ...app,
    expo: {
      ...app.expo,
      version: identity.version,
      android: { ...app.expo.android, versionCode: code },
      ios: { ...app.expo.ios, buildNumber: String(code) },
    },
  }
}

export function prepareAndroid(root, env, run = execFileSync) {
  const apk = path.join(
    root,
    'examples/native-showcase/android/app/build/outputs/apk/release/app-release.apk',
  )
  assert.ok(statSync(apk).size > 0)
  const tools = path.join(env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? '', 'build-tools')
  const candidates = readdirSync(tools)
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  const signer = candidates
    .map((version) => path.join(tools, version, 'apksigner'))
    .find(existsSync)
  assert.ok(signer, 'Android SDK apksigner is required')
  const release = env.HOZO_RELEASE_SIGNING === '1'
  let temporary
  try {
    if (release) {
      const key = signingCredentials(env)
      temporary = mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), 'hozo-showcase-signing-'))
      const store = path.join(temporary, 'showcase.keystore')
      writeFileSync(store, key, { mode: 0o600 })
      const signed = path.join(temporary, 'signed.apk')
      run(
        signer,
        [
          'sign',
          '--ks',
          store,
          '--ks-key-alias',
          'hozo-showcase',
          '--ks-pass',
          'env:SHOWCASE_ANDROID_KEYSTORE_PASSWORD',
          '--key-pass',
          'env:SHOWCASE_ANDROID_KEYSTORE_PASSWORD',
          '--out',
          signed,
          apk,
        ],
        { env, stdio: 'pipe' },
      )
      // Copy only after the fixed-key signature verifies. No test sees the old APK.
      run(signer, ['verify', '--verbose', signed], { env, stdio: 'pipe' })
      copyFileSync(signed, apk)
    }
    const verified = run(signer, ['verify', '--print-certs', apk], { env, encoding: 'utf8' })
    const certificateSha256 = /Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/i
      .exec(verified)?.[1]
      ?.toLowerCase()
    assert.ok(certificateSha256, 'verified signing certificate fingerprint is missing')
    writeJson(path.join(path.dirname(apk), 'signing.json'), {
      mode: release ? 'release' : 'debug-preview',
      commit: env.GITHUB_SHA,
      run: env.GITHUB_RUN_ID,
      certificateSha256,
      apkSha256: digest(readFileSync(apk)),
    })
  } finally {
    // Exactly the temporary directory created above, never a user-supplied path.
    if (temporary) rmSync(temporary, { recursive: true, force: true })
  }
}

export function prepareIos(root, env, run = execFileSync) {
  const directory = path.join(root, 'examples/native-showcase/ios')
  const app = path.join(directory, 'build/Build/Products/Release-iphonesimulator/HozoShowcase.app')
  const info = (key) =>
    run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(app, 'Info.plist')], {
      encoding: 'utf8',
    }).trim()
  const executable = info('CFBundleExecutable')
  assert.equal(path.basename(executable), executable)
  const architectures = run('xcrun', ['lipo', '-archs', path.join(app, executable)], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
  writeJson(path.join(directory, 'build.json'), {
    commit: env.GITHUB_SHA,
    run: env.GITHUB_RUN_ID,
    architectures,
    minimumOSVersion: info('MinimumOSVersion'),
    version: info('CFBundleShortVersionString'),
    archiveSha256: digest(readFileSync(path.join(directory, 'HozoShowcase-simulator.zip'))),
  })
}

export function publishAssets(root, identity, run = execFileSync) {
  const directory = path.join(root, 'artifacts/showcase-release')
  const manifest = readJson(path.join(directory, 'showcase-manifest.json'))
  for (const key of ['tag', 'version', 'commit', 'run', 'repository'])
    assert.equal(manifest[key], identity[key])
  assert.equal(manifest.signing.mode, 'release', 'debug preview must never be published')
  for (const file of ['release-notes.md', 'INSTALL.md', 'SHA256SUMS'])
    assert.ok(statSync(path.join(directory, file)).size > 0)
  for (const asset of manifest.assets) {
    assert.equal(path.basename(asset.name), asset.name)
    assert.equal(digest(readFileSync(path.join(directory, asset.name))), asset.sha256)
  }
  const args = ['--repo', identity.repository]
  // Refuse a published release before making any external change. A draft from
  // an interrupted upload is recoverable only when it belongs to this same source.
  const existing = JSON.parse(
    run('gh', ['api', `repos/${identity.repository}/releases`, '--paginate', '--slurp'], {
      encoding: 'utf8',
    }),
  ).flat()
  const found = existing.find((release) => release.tag_name === identity.tag)
  if (found) {
    assert.equal(found.draft, true, 'release already published; do not overwrite it')
    assert.ok(found.body?.includes(identity.commit), 'existing draft source is not verified')
  } else {
    const notes = path.join(directory, 'release-notes.md')
    run(
      'gh',
      [
        'release',
        'create',
        identity.tag,
        ...args,
        '--verify-tag',
        '--draft',
        '--title',
        `Hozo ${identity.tag}`,
        '--notes-file',
        notes,
        ...(identity.version.startsWith('0.') || identity.version.includes('-')
          ? ['--prerelease']
          : []),
      ],
      { stdio: 'inherit' },
    )
  }
  const files = [
    ...manifest.assets.map((asset) => asset.name),
    'SHA256SUMS',
    'INSTALL.md',
    'showcase-manifest.json',
  ]
  run(
    'gh',
    [
      'release',
      'upload',
      identity.tag,
      ...args,
      ...files.map((file) => path.join(directory, file)),
      '--clobber',
    ],
    { stdio: 'inherit' },
  )
  run('gh', ['release', 'edit', identity.tag, ...args, '--draft=false'], { stdio: 'inherit' })
}

const root = fileURLToPath(new URL('../', import.meta.url))
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env
  const command = process.argv[2]
  if (command === 'check-signing') signingCredentials(env)
  else if (command === 'android') prepareAndroid(root, env)
  else if (command === 'ios') prepareIos(root, env)
  else {
    const identity = releaseIdentity(
      readJson(path.join(root, 'packages/core/package.json')).version,
      env,
    )
    if (command === 'version') {
      assert.ok(!env.HOZO_REUSE_BUILD_RUN, 'release versioning requires a fresh build')
      const file = path.join(root, 'examples/native-showcase/app.json')
      const next = `${JSON.stringify(configureVersion(readJson(file), identity, env.GITHUB_RUN_NUMBER), null, 2)}\n`
      const temporary = `${file}.release-tmp`
      writeFileSync(temporary, next)
      renameSync(temporary, file)
    } else if (command === 'prepare')
      prepareAssets(root, identity, env.HOZO_RELEASE_SIGNING === '1')
    else if (command === 'publish') {
      assert.equal(env.GITHUB_REF, `refs/tags/${identity.tag}`, 'only a release tag can publish')
      publishAssets(root, identity)
    } else throw new Error(`Unknown showcase release command: ${command}`)
  }
}
