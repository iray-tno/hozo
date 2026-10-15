import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  isArchiveFailure,
  ndkVersion,
  prepareAndroidNdk,
  runInstaller,
} from './prepare-android-ndk.mjs'

const version = '27.1.12297006'
const goodResult = { code: 0, signal: null, log: 'Installed NDK' }
const badArchive = {
  code: 1,
  signal: null,
  log: 'Warning: An error occurred while preparing SDK package NDK: Error reading Zip content from a SeekableByteChannel\nCaused by: java.util.zip.ZipException: Archive is not a ZIP archive',
}

function payload(directory, revision = version) {
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'source.properties'), `Pkg.Revision = ${revision}\n`)
  for (const file of [
    'ndk-build',
    'toolchains/llvm/prebuilt/linux-x86_64/bin/clang',
    'toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/include/stdlib.h',
  ]) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    writeFileSync(path.join(directory, file), 'fixture', { mode: 0o755 })
  }
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-ndk-test-'))
  // The exact mkdtemp result is the only tree owned by this test.
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const project = path.join(root, 'project')
  const sdkRoot = path.join(root, 'sdk')
  const output = path.join(root, 'evidence')
  mkdirSync(project)
  mkdirSync(sdkRoot)
  mkdirSync(output)
  mkdirSync(path.join(sdkRoot, 'licenses'))
  writeFileSync(path.join(sdkRoot, 'licenses/android-sdk-license'), 'fixture license')
  writeFileSync(
    path.join(project, 'build.gradle'),
    `buildscript {\n  ndkVersion = "${version}"\n}\n`,
  )
  const warnings = []
  return {
    project,
    sdkRoot,
    output,
    toolSdkRoot: sdkRoot,
    temporaryRoot: root,
    env: { GITHUB_SHA: 'fixture-source', PRESERVE_ME: 'yes' },
    warn: (message) => warnings.push(message),
    warnings,
    report: () => JSON.parse(readFileSync(path.join(output, 'result.json'), 'utf8')),
  }
}

function installer(f, results, visited = []) {
  return async (command, args, { env, logFile }) => {
    assert.equal(command, path.join(f.sdkRoot, 'cmdline-tools/latest/bin/sdkmanager'))
    assert.deepEqual(args.slice(1), ['--verbose', '--install', `ndk;${version}`])
    const stage = args[0].slice('--sdk_root='.length)
    assert.equal(env.ANDROID_USER_HOME, path.join(stage, 'user-home'))
    assert.equal(env.PRESERVE_ME, 'yes')
    assert.equal(
      readFileSync(path.join(stage, 'licenses/android-sdk-license'), 'utf8'),
      'fixture license',
    )
    visited.push(stage)
    const { result, install = false, malformed = false } = results[visited.length - 1]
    if (install) payload(path.join(stage, 'ndk', version))
    if (malformed) {
      mkdirSync(path.join(stage, '.temp'))
      writeFileSync(path.join(stage, '.temp/download.zip'), '<html>upstream error</html>')
    }
    writeFileSync(logFile, result.log)
    return result
  }
}

test('the NDK version comes from the Android project rather than a workflow copy', (t) => {
  const f = fixture(t)
  assert.equal(ndkVersion(f.project), version)
  writeFileSync(path.join(f.project, 'build.gradle'), 'ndkVersion = variable')
  assert.throws(() => ndkVersion(f.project), /one pinned ndkVersion/)
})

test('a valid preinstalled toolchain skips acquisition', async (t) => {
  const f = fixture(t)
  payload(path.join(f.sdkRoot, 'ndk', version))
  await prepareAndroidNdk({ ...f, install: () => assert.fail('must not run installer') })
  assert.equal(f.report().passed, true)
  assert.equal(f.report().reused, true)
  assert.deepEqual(f.report().attempts, [])
})

test('an incomplete preinstall fails without deleting or overwriting it', async (t) => {
  const f = fixture(t)
  const directory = path.join(f.sdkRoot, 'ndk', version)
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'keep.txt'), 'belongs to runner')
  await assert.rejects(prepareAndroidNdk({ ...f, install: () => assert.fail('not a cache hit') }))
  assert.equal(readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'belongs to runner')
  assert.equal(f.report().passed, false)
})

test('a new installation validates payload and records source and attempt evidence', async (t) => {
  const f = fixture(t)
  await prepareAndroidNdk({ ...f, install: installer(f, [{ result: goodResult, install: true }]) })
  assert.equal(f.report().passed, true)
  assert.equal(f.report().reused, false)
  assert.equal(f.report().driverCommit, 'fixture-source')
  assert.equal(f.report().attempts.length, 1)
  assert.equal(f.report().attempts[0].passed, true)
  assert.ok(existsSync(path.join(f.sdkRoot, 'ndk', version, 'source.properties')))
})

test('a malformed response permits only a fresh acquisition and preserves the failed bytes/log', async (t) => {
  const f = fixture(t)
  const visited = []
  await prepareAndroidNdk({
    ...f,
    install: installer(
      f,
      [
        { result: badArchive, malformed: true },
        { result: goodResult, install: true },
      ],
      visited,
    ),
  })
  assert.equal(f.report().passed, true)
  assert.equal(f.report().attempts.length, 2)
  assert.equal(f.report().attempts[0].passed, false)
  assert.equal(f.report().attempts[0].archiveFailure, true)
  assert.notEqual(visited[0], visited[1])
  assert.match(readFileSync(path.join(visited[0], '.temp/download.zip'), 'utf8'), /<html>/)
  assert.ok(
    JSON.stringify(f.report().attempts[0].directories).includes(
      Buffer.from('<html>').toString('hex'),
    ),
  )
  assert.match(
    readFileSync(path.join(f.output, 'attempt-1.log'), 'utf8'),
    /Archive is not a ZIP archive/,
  )
  assert.equal(f.warnings.length, 1)
})

test('two archive failures stop the series without installing a third time', async (t) => {
  const f = fixture(t)
  await assert.rejects(
    prepareAndroidNdk({
      ...f,
      install: installer(f, [{ result: badArchive }, { result: badArchive }]),
    }),
    /attempt 2/,
  )
  assert.equal(f.report().passed, false)
  assert.equal(f.report().attempts.length, 2)
  assert.ok(!existsSync(path.join(f.sdkRoot, 'ndk', version)))
})

for (const result of [
  { code: 1, signal: null, log: 'License for package NDK not accepted' },
  { code: 1, signal: null, log: 'Failed to find package ndk;invalid' },
  { code: 1, signal: null, log: 'Permission denied\nArchive is not a ZIP archive' },
  { code: 1, signal: null, log: 'No space left on device\nArchive is not a ZIP archive' },
  { code: null, signal: 'SIGKILL', log: 'Archive is not a ZIP archive' },
  { code: -2, error: 'spawn ENOENT', log: '' },
  { code: 1, signal: null, log: 'An unrelated installer failure' },
]) {
  test(`non-archive failure is not retried: ${result.error ?? result.signal ?? result.log.split('\n')[0]}`, async (t) => {
    const f = fixture(t)
    assert.equal(isArchiveFailure(result), false)
    await assert.rejects(prepareAndroidNdk({ ...f, install: installer(f, [{ result }]) }))
    assert.equal(f.report().attempts.length, 1)
    assert.equal(f.report().passed, false)
  })
}

test('exit zero without the toolchain is a failure, not a verified install', async (t) => {
  const f = fixture(t)
  await assert.rejects(prepareAndroidNdk({ ...f, install: installer(f, [{ result: goodResult }]) }))
  assert.equal(f.report().passed, false)
  assert.equal(f.report().attempts.length, 1)
})

test('a different preinstalled revision is rejected without modifying it', async (t) => {
  const f = fixture(t)
  payload(path.join(f.sdkRoot, 'ndk', version), '26.1.10909125')
  await assert.rejects(prepareAndroidNdk({ ...f }), /does not match/)
  assert.equal(f.report().passed, false)
})

test('an archive warning with exit zero is still retried, never accepted', async (t) => {
  const f = fixture(t)
  await prepareAndroidNdk({
    ...f,
    install: installer(f, [
      { result: { ...badArchive, code: 0 }, install: true },
      { result: goodResult, install: true },
    ]),
  })
  assert.equal(f.report().attempts[0].passed, false)
  assert.equal(f.report().attempts[1].passed, true)
})

test('the real process wrapper retains stdout/stderr and a failing exit code', async (t) => {
  const f = fixture(t)
  const result = await runInstaller(
    process.execPath,
    [
      '-e',
      'console.log("download started"); console.error("Archive is not a ZIP archive"); process.exitCode=1',
    ],
    { env: process.env, logFile: path.join(f.output, 'process.log') },
  )
  assert.equal(result.code, 1)
  assert.equal(isArchiveFailure(result), true)
  assert.match(readFileSync(path.join(f.output, 'process.log'), 'utf8'), /download started/)
})

test('an installer process timeout cannot turn into an archive retry', async (t) => {
  const f = fixture(t)
  const result = await runInstaller(process.execPath, ['-e', 'setTimeout(()=>{}, 30000)'], {
    env: process.env,
    logFile: path.join(f.output, 'timeout.log'),
    timeout: 100,
  })
  assert.ok(result.signal || result.error)
  assert.equal(isArchiveFailure(result), false)
})

test('every native-demo Android build prepares NDK explicitly and retains its evidence', () => {
  const workflow = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8')
  for (const name of ['canvas-android', 'android', 'talkback']) {
    const job = workflow.split(`\n  ${name}:`)[1]?.split(/\n {2}[\w-]+:/)[0]
    assert.ok(job, name)
    const preparation = job.indexOf('node scripts/prepare-android-ndk.mjs')
    assert.ok(preparation >= 0 && preparation < job.indexOf('run: ./gradlew assembleRelease'), name)
    assert.match(job, /name: Keep NDK preparation evidence\s+if: always\(\)/)
    assert.match(job, new RegExp(`name: android-ndk-${name}`))
    assert.doesNotMatch(job, /continue-on-error|assembleRelease[^\n]*\|\|/)
  }
  assert.match(workflow, /- 'scripts\/prepare-android-ndk\*'/)
  const fresh = readFileSync(
    new URL('../.github/workflows/android-ndk.yml', import.meta.url),
    'utf8',
  )
  assert.match(fresh, /--sdk-root "\$RUNNER_TEMP\/hozo-fresh-sdk"/)
  assert.match(fresh, /assert.equal\(r.reused, false\)/)
  assert.match(fresh, /clang" --version/)
  assert.doesNotMatch(fresh, /continue-on-error|\|\| true/)
})
