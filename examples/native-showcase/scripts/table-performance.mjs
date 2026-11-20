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
  tableRunSummary,
  tableTimingRecords,
  verifyTablePixels,
  verifyTableSample,
  verifyTableWindow,
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
  windowedSourceHash: hash(resolve(root, '../../packages/patterns/src/windowed-table.native.tsx')),
  windowedModelHash: hash(resolve(root, '../../packages/patterns/src/windowed-table-types.ts')),
  cases: [],
  windows: [],
  host: { platform: platform(), release: release(), cpus: cpus().length, model: cpus()[0]?.model },
  boundary:
    'input handler to columns resolved and cell layouts observed; JS quiet-30-rAF reported separately; neither is a presentation fence',
  production: {
    widths: [64, 96, 96, 96],
    rowHeight: 32,
    viewportHeight: 240,
    windowSize: 3,
    initialNumToRender: 8,
    maxToRenderPerBatch: 8,
    removeClippedSubviews: false,
    accessibleNativeCells: true,
    fontSize: 16,
    lineHeight: 24,
    instrumentation:
      'source copy plus row/cell observations and a diagnostic backing-list ref; byte-for-byte restoration tested',
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
let originalFontScale

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
  evidence.scope = evidence.reusedBinary ? 'window-only-diagnostic' : 'mount-matrix-and-window'
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
  originalFontScale = read('shell', 'settings', 'get', 'system', 'font_scale').trim()
  evidence.originalFontScale = originalFontScale
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
  const density = read('shell', 'wm', 'density')
  save('density.txt', density)
  evidence.pixelRatio =
    Number(
      (density.match(/Override density: (\d+)/) ?? density.match(/Physical density: (\d+)/))?.[1],
    ) / 160
  assert.ok(evidence.pixelRatio > 0)
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
  await controls('Font scale 1.00, row height 32.0')
  // Resolve controls once before all measured windows. No XML dump, fixture
  // allocation or repeated input is included in the JS observation boundary.
  const buttons = new Map()
  for (const name of [
    'Clear table',
    'Jump to last row',
    'Return to first row',
    'Narrow table',
    'Wide table',
    'Record table window',
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
    verifyTableSample(record, {
      mode,
      count,
      sourceHash: evidence.sourceHash,
      windowedSourceHash: evidence.windowedSourceHash,
      windowedModelHash: evidence.windowedModelHash,
    })
    assert.equal(record.rowHeight, 32)
    assert.equal(record.fontScale, 1)
    Object.assign(entry, record, { name, warmup, round, passed: false })
    adb('shell', 'uiautomator', 'dump', '/sdcard/table-probe.xml')
    const xml = read('exec-out', 'cat', '/sdcard/table-probe.xml')
    save(`${name}-uiautomator.xml`, xml)
    const nodes = parseNodes(xml)
    for (const header of ['ID', 'Name', 'Region', 'Total']) {
      const node = nodes.find((node) => matchLabel(node, header))
      assert.ok(node, `missing header node ${header}: ${name}`)
      centre(node)
    }
    const screenshot = adb('exec-out', 'screencap', '-p')
    save(`${name}.png`, screenshot)
    entry.pixels = verifyTablePixels(screenshot, nodes)
    entry.passed = true
    persist()
    console.log(
      `${name}: boundary ${record.boundaryMs.toFixed(1)}ms; settled ${record.settledMs.toFixed(1)}ms; natural measurements ${record.naturalMeasurements}; peak rows ${record.peakRows}`,
    )
  }
  if (evidence.reusedBinary) {
    // The producer already measured the unchanged mounting paths. Reused
    // diagnostics establish readiness once, then exercise window transitions.
    await measure('windowed', 1000, 0, true)
  } else {
    for (const mode of ['normal', 'windowed']) await measure(mode, 100, 0, true)
    for (let round = 1; round <= 3; round++) {
      for (const count of TABLE_COUNTS) {
        for (const mode of round % 2 ? ['normal', 'windowed'] : ['windowed', 'normal']) {
          await measure(mode, count, round)
        }
      }
    }
  }
  evidence.summary = tableRunSummary(evidence)
  // Both paths leave a settled 1,000-row production mount. Exercise that
  // same instance, keeping scroll observations out of the mount medians.
  const tapCurrent = async (name) =>
    adb('shell', 'input', 'tap', ...centre(await controls(name)).map(String))
  const snapshot = async (phase, index, { columns = [0, 1, 2, 3], excludes = [] } = {}) => {
    const entry = { phase, index, columns, excludes, passed: false }
    evidence.windows.push(entry)
    persist()
    await pause(750)
    adb('logcat', '-c')
    await tapCurrent('Record table window')
    let record
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && !record) {
      record = tableTimingRecords(logs(), '[Hozo Table window]').at(-1)
      if (!record) await pause(100)
    }
    save(`${phase}-logcat.txt`, logs())
    assert.ok(record, `missing ${phase} window snapshot`)
    entry.observation = record
    persist()
    adb('shell', 'uiautomator', 'dump', '/sdcard/table-probe.xml')
    const xml = read('exec-out', 'cat', '/sdcard/table-probe.xml')
    save(`${phase}.xml`, xml)
    const png = adb('exec-out', 'screencap', '-p')
    save(`${phase}.png`, png)
    entry.pixels = verifyTablePixels(png, parseNodes(xml), { index, columns, headers: false })
    verifyTableWindow(record, {
      count: 1000,
      windowedSourceHash: evidence.windowedSourceHash,
      windowedModelHash: evidence.windowedModelHash,
      includes: [index + 1],
      excludes,
    })
    for (const [at, cell] of entry.pixels.entries()) {
      const [left, top, right, bottom] = cell.rect
      assert.ok(
        Math.abs(right - left - evidence.production.widths[columns[at]] * evidence.pixelRatio) <= 2,
        'declared column width changed',
      )
      assert.ok(
        Math.abs(bottom - top - record.rowHeight * evidence.pixelRatio) <= 2,
        'fixed row height changed',
      )
      if (at > 0) {
        assert.ok(
          Math.abs(left - entry.pixels[at - 1].rect[2]) <= 2,
          'columns separated or overlapped',
        )
        assert.ok(Math.abs(top - entry.pixels[0].rect[1]) <= 1, 'cells lost their shared row')
      }
    }
    entry.passed = true
    persist()
    return entry
  }
  const first = await snapshot('initial-window', 0)
  tap('Jump to last row')
  await controls('ID, 999')
  const last = await snapshot('last-window', 999)
  assert.ok(
    last.observation.mountedRows > first.observation.mountedRows,
    'jump did not mount new rows',
  )
  for (let column = 0; column < 4; column++) {
    assert.equal(
      last.pixels[column].rect[0],
      first.pixels[column].rect[0],
      'jump changed column alignment',
    )
  }
  tap('Return to first row')
  await controls('ID, 0')
  await snapshot('returned-window', 0, { excludes: [1000] })
  tap('Narrow table')
  const id = await controls('ID, 0')
  const left = id.rect[0],
    y = Math.round((id.rect[1] + id.rect[3]) / 2)
  adb(
    'shell',
    'input',
    'swipe',
    String(Math.round(left + 210 * evidence.pixelRatio)),
    String(y),
    String(Math.round(left + 10 * evidence.pixelRatio)),
    String(y),
    '800',
  )
  await controls('Total, 0')
  const narrow = await snapshot('horizontal-window', 0, { columns: [2, 3] })
  assert.equal(narrow.observation.narrow, true)
  tap('Wide table')
  tap('Clear table')
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3')
  await controls('Font scale 1.30, row height 41.6')
  await tapCurrent('Mount windowed 1000')
  // Visible full-value names establish readiness after the configuration
  // change, including an Activity recreation if this RN/Android needs one.
  await controls('ID, 0')
  const scaled = await snapshot('font-scale-window', 0)
  assert.ok(scaled.observation.fontScale > 1.25)
  assert.ok(scaled.observation.rowHeight > 40)
  evidence.passed = true
} finally {
  persist()
  try {
    save('final-logcat.txt', adb('logcat', '-b', 'all', '-d'))
  } catch (error) {
    save('logcat-error.txt', String(error))
  }
  if (originalFontScale !== undefined) {
    try {
      if (originalFontScale === 'null') adb('shell', 'settings', 'delete', 'system', 'font_scale')
      else adb('shell', 'settings', 'put', 'system', 'font_scale', originalFontScale)
    } catch (error) {
      evidence.passed = false
      evidence.fontScaleRestoreError = String(error)
      persist()
      process.exitCode = 1
    }
  }
}
