import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { prepareAndroid } from './android-startup.mjs'
import { waitForAndroidControl } from './android-ui-wait.mjs'
import { centre, matchLabel, parseNodes } from './device-evidence.mjs'
import {
  assertReusableTableInputs,
  TABLE_COUNTS,
  tableSummary,
  tableTimingRecords,
  verifyTableSample,
} from './table-performance-evidence.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(process.argv[2] ?? 'artifacts/native-showcase-table')
const app = 'dev.hozo.showcase'
const apk = resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')
mkdirSync(output, { recursive: true })
const adb = (...args) => execFileSync('adb', args, { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
const read = (...args) => adb(...args).toString()
const save = (name, value) => writeFileSync(resolve(output, name), value)
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const sourcePath = resolve(root, '../../packages/semantics/src/table.native.tsx')
const evidence = {
  passed: false,
  platform: 'Android emulator',
  build: 'release / Hermes',
  source: process.env.GITHUB_SHA,
  binaryRun: process.env.HOZO_BINARY_RUN,
  sourceHash: hash(sourcePath),
  cases: [],
  host: { platform: platform(), release: release(), cpus: cpus().length, model: cpus()[0]?.model },
  boundary:
    'input handler to columns resolved and cell layouts observed; JS quiet-30-rAF reported separately; neither is a presentation fence',
  prototype: {
    widths: [64, 96, 96, 96],
    rowHeight: 32,
    viewportHeight: 240,
    windowSize: 3,
    initialNumToRender: 8,
    maxToRenderPerBatch: 8,
  },
}
const persist = () => save('evidence.json', `${JSON.stringify(evidence, null, 2)}\n`)
const logs = () => read('logcat', '-d', '-v', 'brief', '-s', 'ReactNativeJS:*')
const controls = async (name) =>
  waitForAndroidControl((node) => matchLabel(node, name), name, {
    readNodes: () => {
      adb('shell', 'uiautomator', 'dump', '/sdcard/table-probe.xml')
      return parseNodes(read('exec-out', 'cat', '/sdcard/table-probe.xml'))
    },
  })

try {
  assert.match(evidence.source ?? '', /^[a-f0-9]{40}$/)
  const signing = JSON.parse(
    readFileSync(resolve(root, 'android/app/build/outputs/apk/release/signing.json'), 'utf8'),
  )
  evidence.apkSha256 = hash(apk)
  assert.equal(evidence.apkSha256, signing.apkSha256)
  assert.equal(evidence.binaryRun, signing.run)
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
    assertReusableTableInputs(evidence.changedFromBinary)
  } else assert.equal(signing.commit, evidence.source, 'fresh build source differs from driver')
  evidence.sources = Object.fromEntries(
    [
      'src/TablePerformance.stories.tsx',
      'src/table-performance-observer.ts',
      'scripts/table-performance-source.cjs',
      'scripts/table-performance.mjs',
      'scripts/table-performance-evidence.mjs',
    ].map((name) => [name, hash(resolve(root, name))]),
  )
  await prepareAndroid(
    {
      read: (args) => read(...args),
      install: (timeout) => execFileSync('adb', ['install', '-r', apk], { timeout }),
    },
    evidence,
  )
  evidence.device = read('shell', 'getprop')
  assert.equal(read('shell', 'getprop', 'ro.kernel.qemu').trim(), '1')
  save('display.txt', adb('shell', 'dumpsys', 'display'))
  adb('shell', 'am', 'force-stop', app)
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'hozo-showcase://storybook?STORYBOOK_STORY_ID=diagnostics-table-performance--matrix',
    app,
  )
  await controls('Table performance probe')
  // Resolve controls once before all measured windows. No XML dump, fixture
  // allocation or repeated input is included in the JS observation boundary.
  const buttons = new Map()
  for (const name of [
    'Clear table',
    ...TABLE_COUNTS.flatMap((count) =>
      ['normal', 'windowed'].map((mode) => `Mount ${mode} ${count}`),
    ),
  ]) {
    buttons.set(name, centre(await controls(name)))
  }
  const tap = (name) => adb('shell', 'input', 'tap', ...buttons.get(name).map(String))
  const measure = async (mode, count, round, warmup = false) => {
    tap('Clear table')
    await pause(750)
    adb('logcat', '-c')
    const name = `${warmup ? 'warmup' : `round-${round}`}-${mode}-${count}`
    const entry = { name, mode, count, round, warmup, passed: false }
    evidence.cases.push(entry)
    persist()
    tap(`Mount ${mode} ${count}`)
    const deadline = Date.now() + 45_000
    let record
    while (Date.now() < deadline) {
      const log = logs()
      save(`${name}-logcat.txt`, log)
      record = tableTimingRecords(log).find(
        (sample) => sample.mode === mode && sample.count === count,
      )
      if (record) break
      await pause(250)
    }
    assert.ok(record, `missing completed measurement: ${name}`)
    // Retain a failed observation before validation throws.
    Object.assign(entry, { observation: record })
    persist()
    verifyTableSample(record, { mode, count, sourceHash: evidence.sourceHash })
    Object.assign(entry, record, { name, warmup, round })
    save(`${name}.png`, adb('exec-out', 'screencap', '-p'))
    persist()
    console.log(
      `${name}: boundary ${record.boundaryMs.toFixed(1)}ms; settled ${record.settledMs.toFixed(1)}ms; natural measurements ${record.naturalMeasurements}; peak rows ${record.peakRows}`,
    )
  }
  for (const mode of ['normal', 'windowed']) await measure(mode, 100, 0, true)
  for (let round = 1; round <= 3; round++) {
    for (const count of TABLE_COUNTS) {
      for (const mode of round % 2 ? ['normal', 'windowed'] : ['windowed', 'normal']) {
        await measure(mode, count, round)
      }
    }
  }
  evidence.summary = tableSummary(evidence.cases)
  evidence.passed = true
} finally {
  persist()
  try {
    save('final-logcat.txt', adb('logcat', '-b', 'all', '-d'))
  } catch (error) {
    save('logcat-error.txt', String(error))
  }
}
