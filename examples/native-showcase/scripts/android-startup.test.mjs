import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ANDROID_INSTALL_TIMEOUT_MS, prepareAndroid } from './android-startup.mjs'

function clock() {
  let time = 0
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
    advance: (ms) => {
      time += ms
    },
  }
}

test('the real driver prepares installation before scenarios and retains the action deadline', () => {
  const driver = readFileSync(new URL('./android-smoke.mjs', import.meta.url), 'utf8')
  const prepare = driver.indexOf('await prepareAndroid(')
  const start = driver.search(/try \{\r?\n {2}evidence\.android/)
  assert.ok(start >= 0 && prepare > start)
  assert.ok(prepare < driver.indexOf("adb('logcat', '-c')"))
  assert.match(driver, /const adb = .*timeout: 30_000/)
  assert.doesNotMatch(driver, /adb\('install'/)
})

test('waits for boot animation and package service, then installs exactly once', async () => {
  const timing = clock()
  const evidence = {}
  let installs = 0
  const read = (args) => {
    if (args.at(-1) === 'sys.boot_completed') return '1'
    if (args.at(-1) === 'init.svc.bootanim') return timing.now() < 1_000 ? 'running' : 'stopped'
    assert.deepEqual(args, ['shell', 'pm', 'path', 'android'])
    return timing.now() < 2_000 ? '' : 'package:/system/framework/framework-res.apk'
  }
  await prepareAndroid(
    {
      ...timing,
      read,
      install: (timeout) => {
        assert.equal(timeout, ANDROID_INSTALL_TIMEOUT_MS)
        installs += 1
        timing.advance(40_000)
        return 'Performing Streamed Install\nSuccess'
      },
    },
    evidence,
  )
  assert.equal(installs, 1)
  assert.equal(evidence.startup.passed, true)
  assert.equal(evidence.startup.readinessMs, 2_000)
  assert.equal(evidence.startup.installMs, 40_000)
  assert.equal(evidence.startup.observations.length, 3)
  assert.equal(evidence.startup.observations[0].bootAnimation, 'running')
})

test('an absent boot animation service still requires boot completion and package readiness', async () => {
  const timing = clock()
  const evidence = {}
  let installs = 0
  await prepareAndroid(
    {
      ...timing,
      read: (args) => {
        if (args.at(-1) === 'sys.boot_completed') return timing.now() ? '1' : '0'
        if (args.at(-1) === 'init.svc.bootanim') return ''
        return 'package:/system/framework/framework-res.apk'
      },
      install: () => {
        installs += 1
        return 'Success'
      },
    },
    evidence,
  )
  assert.equal(evidence.startup.readinessMs, 1_000)
  assert.equal(installs, 1)
})

test('transport/readiness failures remain recorded and an unready device cannot install', async () => {
  const timing = clock()
  const evidence = {}
  await assert.rejects(
    prepareAndroid(
      {
        ...timing,
        timeoutMs: 2_000,
        read: () => {
          throw new Error('adb offline')
        },
        install: () => assert.fail('unready device installed'),
      },
      evidence,
    ),
    /framework readiness timed out/,
  )
  assert.equal(evidence.startup.passed, false)
  assert.equal(evidence.startup.phase, 'framework-ready')
  assert.ok(evidence.startup.observations.every((sample) => sample.error.includes('adb offline')))
})

test('a timed-out or rejected installation fails immediately without replaying it', async () => {
  for (const installResult of [
    new Error('spawnSync adb ETIMEDOUT'),
    'Failure [INSTALL_FAILED_TEST]',
  ]) {
    const timing = clock()
    const evidence = {}
    let installs = 0
    await assert.rejects(
      prepareAndroid(
        {
          ...timing,
          read: (args) =>
            args.at(-1) === 'sys.boot_completed'
              ? '1'
              : args.at(-1) === 'init.svc.bootanim'
                ? 'stopped'
                : 'package:/android.apk',
          install: () => {
            installs += 1
            timing.advance(120_000)
            if (installResult instanceof Error) throw installResult
            return installResult
          },
        },
        evidence,
      ),
    )
    assert.equal(installs, 1)
    assert.equal(evidence.startup.phase, 'install')
    assert.equal(evidence.startup.passed, false)
    assert.equal(evidence.startup.installMs, 120_000)
  }
})

test('late successful reads cannot extend the readiness deadline', async () => {
  const timing = clock()
  const evidence = {}
  await assert.rejects(
    prepareAndroid(
      {
        ...timing,
        timeoutMs: 2_000,
        read: (args) => {
          timing.advance(1_000)
          return args.at(-1) === 'sys.boot_completed'
            ? '1'
            : args.at(-1) === 'init.svc.bootanim'
              ? 'stopped'
              : 'package:/android.apk'
        },
        install: () => assert.fail('late-ready device installed'),
      },
      evidence,
    ),
    /framework readiness timed out/,
  )
  assert.equal(evidence.startup.passed, false)
  assert.equal(evidence.startup.observations[0].completedMs, 3_000)
})
