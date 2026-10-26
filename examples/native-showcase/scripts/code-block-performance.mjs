import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, platform, release } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { prepareAndroid } from './android-startup.mjs'
import { waitForAndroidControl } from './android-ui-wait.mjs'
import { assertReusableCodeInputs, frameSummary, timingRecords } from './code-block-frames.mjs'
import { centre, matchLabel, parseNodes } from './device-evidence.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(process.argv[2] ?? 'artifacts/native-showcase-code-block')
const app = 'dev.hozo.showcase'
const apk = resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')
mkdirSync(output, { recursive: true })
const adb = (...args) =>
  execFileSync('adb', args, { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }).toString()
const save = (name, value) => writeFileSync(resolve(output, name), value)
const json = (name, value) => save(name, `${JSON.stringify(value, null, 2)}\n`)
const logs = () => adb('logcat', '-d', '-v', 'brief', '-s', 'ReactNativeJS:*')
const evidence = {
  platform: 'Android',
  environment: 'emulator',
  source: process.env.GITHUB_SHA,
  binaryRun: process.env.HOZO_BINARY_RUN,
  passed: false,
  cases: [],
  host: { platform: platform(), release: release(), cpus: cpus().length, model: cpus()[0]?.model },
  runtime: Object.fromEntries(
    ['react', 'react-native'].map((name) => [
      name,
      createRequire(import.meta.url)(`${name}/package.json`).version,
    ]),
  ),
  build: 'standalone release / Hermes; SwiftShader emulator GPU in CI',
}

async function control(name) {
  return waitForAndroidControl((node) => matchLabel(node, name), name, {
    readNodes: () => {
      adb('shell', 'uiautomator', 'dump', '/sdcard/code-block.xml')
      return parseNodes(adb('exec-out', 'cat', '/sdcard/code-block.xml'))
    },
    timeout: 60_000,
  })
}
async function waitForTiming(name) {
  const started = Date.now()
  while (Date.now() - started < 60_000) {
    const samples = timingRecords(logs()).filter((sample) => sample.name === name)
    if (samples.length) return samples.at(-1)
    await pause(100)
  }
  throw new Error(`no completed JS observation for ${name}`)
}
async function measure(name, action, timingName) {
  const sample = { name, passed: false }
  evidence.cases.push(sample)
  adb('logcat', '-c')
  save(`${name}-reset.txt`, adb('shell', 'dumpsys', 'gfxinfo', app, 'reset'))
  const started = Date.now()
  try {
    await action()
    if (timingName) sample.js = await waitForTiming(timingName)
    await pause(150)
    sample.driverWindowMs = Date.now() - started
    const dump = adb('shell', 'dumpsys', 'gfxinfo', app, 'framestats')
    save(`${name}-gfxinfo.txt`, dump)
    sample.frames = frameSummary(dump, evidence.refreshHz)
    sample.passed = true
    console.log(
      `${name}: ${sample.frames.ordinaryFrames} frames, p95 ${sample.frames.p95Ms.toFixed(2)}ms, ${sample.frames.overBudgetFrames} over ${sample.frames.budgetMs.toFixed(2)}ms`,
    )
  } catch (error) {
    sample.error = String(error.stack)
    // Keep the actual failed window, including empty or invalid observations.
    save(`${name}-failed-gfxinfo.txt`, adb('shell', 'dumpsys', 'gfxinfo', app, 'framestats'))
    throw error
  } finally {
    json('evidence.json', evidence)
    try {
      save(`${name}-logcat.txt`, logs())
    } catch (error) {
      save(`${name}-logcat-error.txt`, String(error))
    }
  }
}

try {
  assert.match(evidence.source ?? '', /^[a-f0-9]{40}$/)
  evidence.apkSha256 = createHash('sha256').update(readFileSync(apk)).digest('hex')
  const signing = JSON.parse(
    readFileSync(resolve(root, 'android/app/build/outputs/apk/release/signing.json'), 'utf8'),
  )
  assert.equal(signing.apkSha256, evidence.apkSha256, 'APK differs from its build manifest')
  assert.equal(signing.run, evidence.binaryRun, 'APK build run differs from requested producer')
  assert.match(signing.commit ?? '', /^[a-f0-9]{40}$/)
  evidence.binarySource = signing.commit
  evidence.reusedBinary = evidence.binaryRun !== process.env.GITHUB_RUN_ID
  if (evidence.reusedBinary) {
    assert.equal(process.env.HOZO_DIAGNOSTICS, '1', 'binary reuse must be an explicit diagnostic')
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', signing.commit], {
      cwd: root,
      timeout: 60_000,
    })
    evidence.changedFromBinary = execFileSync(
      'git',
      ['diff', '--name-only', signing.commit, evidence.source, '--'],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
    assertReusableCodeInputs(evidence.changedFromBinary)
  } else assert.equal(signing.commit, evidence.source, 'fresh build source differs from driver')
  evidence.sources = Object.fromEntries(
    [
      'src/CodeBlockPerformance.stories.tsx',
      'src/code-block-fixture.ts',
      'scripts/code-block-performance.mjs',
      'scripts/code-block-frames.mjs',
    ].map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(resolve(root, name)))
        .digest('hex'),
    ]),
  )
  await prepareAndroid(
    {
      read: (args) => {
        const value = adb(...args)
        if (args.includes('services')) save('startup-system-ui.txt', value)
        return value
      },
      install: (timeout) => execFileSync('adb', ['install', '-r', apk], { timeout }),
    },
    evidence,
  )
  evidence.device = adb('shell', 'getprop')
  evidence.emulator = adb('shell', 'getprop', 'ro.kernel.qemu').trim()
  assert.equal(evidence.emulator, '1', 'this run is specifically labelled an emulator measurement')
  const display = adb('shell', 'dumpsys', 'display')
  save('display.txt', display)
  // Use the active display's mode, not a hard-coded 60Hz frame threshold.
  const refresh =
    display.match(/renderFrameRate[= ]+([\d.]+)/) ??
    display.match(/refreshRate[= ]+([\d.]+)/) ??
    display.match(/fps[= ]+([\d.]+)/)
  assert.ok(refresh, 'active display refresh rate missing')
  evidence.refreshHz = Number(refresh[1])
  save('cpuinfo.txt', adb('shell', 'cat', '/proc/cpuinfo'))
  adb('shell', 'am', 'force-stop', app)
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'hozo-showcase://storybook?STORYBOOK_STORY_ID=diagnostics-codeblock-performance--matrix',
    app,
  )
  await control('CodeBlock performance probe')
  // Resolve controls before opening a measured window. XML snapshots are slow
  // and must not become part of the operation's JS/UI timing.
  const buttons = new Map()
  for (const name of [
    'Clear block',
    'Update block',
    'Start scroll measurement',
    'Finish scroll measurement',
    ...[10, 100, 300, 1000].map((count) => `Mount ${count} lines`),
  ])
    buttons.set(name, centre(await control(name)).map(String))
  const tap = (name) => adb('shell', 'input', 'tap', ...buttons.get(name))
  const screen = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/)
  assert.ok(screen)
  const [width, height] = screen.slice(1).map(Number)
  for (const count of [10, 100, 300, 1000]) {
    for (let round = 1; round <= 3; round++) {
      tap('Clear block')
      await control('Block cleared')
      await measure(`${count}-${round}-mount`, () => tap(`Mount ${count} lines`), `mount-${count}`)
      for (let tick = 1; tick <= 3; tick++)
        await measure(
          `${count}-${round}-update-${tick}`,
          () => tap('Update block'),
          `update-${count}-${tick}`,
        )
      tap('Start scroll measurement')
      await pause(200)
      for (let swipe = 0; count > 10 && swipe < 4; swipe++) {
        const down = swipe % 2 === 0
        await measure(`${count}-${round}-scroll-${swipe + 1}`, () => {
          adb(
            'shell',
            'input',
            'swipe',
            String(Math.round(width / 2)),
            String(Math.round(height * (down ? 0.75 : 0.4))),
            String(Math.round(width / 2)),
            String(Math.round(height * (down ? 0.4 : 0.75))),
            '800',
          )
        })
      }
      tap('Finish scroll measurement')
      const scrollTiming = await waitForTiming('scroll')
      // Small baseline may fit; longer fixtures must actually scroll.
      if (count > 10) {
        assert.ok(scrollTiming.rafGapsMs.length > 0, 'missing JS frames during scroll')
        assert.ok(scrollTiming.maxOffset > 0, 'scroll input did not move code content')
      } else scrollTiming.scrollFrames = 'not measured: small baseline fits the viewport'
      json(`${count}-${round}-scroll-js.json`, scrollTiming)
      writeFileSync(
        resolve(output, `${count}-${round}.png`),
        execFileSync('adb', ['exec-out', 'screencap', '-p'], {
          timeout: 30_000,
          maxBuffer: 32 * 1024 * 1024,
        }),
      )
    }
  }
  evidence.passed = true
} catch (error) {
  evidence.error = String(error.stack)
  throw error
} finally {
  json('evidence.json', evidence)
  for (const [name, args] of Object.entries({
    'system-logcat.txt': ['logcat', '-b', 'all', '-d'],
    'system-services.txt': [
      'shell',
      'dumpsys',
      'activity',
      'services',
      'com.android.systemui/.SystemUIService',
    ],
  })) {
    try {
      save(name, adb(...args))
    } catch (error) {
      save(`${name}.error`, String(error))
    }
  }
  try {
    save('logcat-final.txt', logs())
  } catch (error) {
    save('logcat-final-error.txt', String(error))
  }
}
