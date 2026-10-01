import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  cpSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { centre, changedFraction, imageRegion } from './device-evidence.mjs'
import { waitForImage } from './image-ready.mjs'
import {
  openShowcaseConfirmation,
  parseIosNodes,
  pixelBounds,
  visualTextControl,
} from './ios-evidence.mjs'

const app = 'dev.hozo.showcase'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? resolve(root, '../../artifacts/native-showcase-ios'))
mkdirSync(output, { recursive: true })
const evidence = {
  platform: 'iOS',
  device: 'simulator',
  axBackend: process.env.HOZO_AX_BACKEND || 'axbridge',
  sidebarSelection: 'visible text (Apple Vision)',
  checks: [],
  passed: false,
  binaryRun: process.env.HOZO_BINARY_RUN,
  driverCommit: process.env.GITHUB_SHA,
  diagnostic: process.env.HOZO_DIAGNOSTICS === '1',
}
const run = (command, args, timeout = 30_000) =>
  execFileSync(command, args, {
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
const simctl = (...args) => run('xcrun', ['simctl', ...args])
const label = (value) => (node) => node.AXLabel?.replace(/\s+/g, ' ').trim() === value
let udid
let latestTree = '[]'
let logger

let commandNumber = 0
const idb = (...args) => {
  if (!evidence.diagnostic) return run('idb', [...args, '--udid', udid])
  const prefix = resolve(output, `idb-${++commandNumber}`)
  const watcher =
    args[0] === 'ui'
      ? spawn(
          process.execPath,
          [resolve(root, 'scripts/ios-input-watch.mjs'), String(process.pid), `${prefix}-stacks`],
          { stdio: 'ignore' },
        )
      : undefined
  const stderrFd = openSync(`${prefix}-stderr.txt`, 'w')
  const started = Date.now()
  const command = [...args, '--udid', udid, '--log', 'DEBUG']
  try {
    const stdout = execFileSync('idb', command, {
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, FBSIMULATORCONTROL_LOG_HID_DETAILS: '1' },
      stdio: ['ignore', 'pipe', stderrFd],
    })
    writeFileSync(
      `${prefix}.json`,
      JSON.stringify({ command, elapsedMs: Date.now() - started, completed: true }),
    )
    return stdout
  } catch (error) {
    writeFileSync(
      `${prefix}.json`,
      JSON.stringify({
        command,
        elapsedMs: Date.now() - started,
        completed: false,
        code: error.code,
      }),
    )
    throw error
  } finally {
    watcher?.kill()
    closeSync(stderrFd)
  }
}

function nodes() {
  // Default to the persistent guest reader. Diagnostics may explicitly compare
  // the host reader; never silently switch readers to turn a failure into a pass.
  assert.ok(['axbridge', 'ax'].includes(evidence.axBackend), 'unsupported AX backend')
  latestTree = idb('ui', 'describe-all', '--api', evidence.axBackend, '--nested').toString()
  return parseIosNodes(latestTree)
}

async function waitFor(predicate, description, timeout = 60_000, allowOpenConfirmation = false) {
  let deadline = Date.now() + timeout
  let lastError
  let confirmed = false
  do {
    let tree
    try {
      tree = nodes()
    } catch (error) {
      lastError = error
    }
    if (tree) {
      const confirmation =
        allowOpenConfirmation && !confirmed ? openShowcaseConfirmation(tree) : undefined
      if (confirmation) {
        // Unlike read-only tree polling, an input error must propagate; never
        // retry a potentially delivered tap. Allow the app its own route budget
        // after the OS confirmation, once only (not an indefinitely reset timer).
        idb('ui', 'tap', ...centre(confirmation).map(String))
        confirmed = true
        evidence.openConfirmations = (evidence.openConfirmations ?? 0) + 1
        deadline = Date.now() + timeout
      }
      const found = tree.find(predicate)
      if (found) return found
    }
    await pause(1_000)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${description}`, { cause: lastError })
}

async function tap(predicate, description) {
  const node = await waitFor(predicate, description)
  idb('ui', 'tap', ...centre(node).map(String))
}

function screenshot(name, includeTree = true) {
  const path = resolve(output, `${name}.png`)
  simctl('io', udid, 'screenshot', path)
  if (includeTree) writeFileSync(resolve(output, `${name}.json`), latestTree)
  return readFileSync(path)
}

async function story(id, expected) {
  simctl('openurl', udid, `hozo-showcase://storybook?STORYBOOK_STORY_ID=${id}`)
  await waitFor(label(expected), `story ${id}`, 60_000, true)
}

function record(name, details = {}) {
  evidence.checks.push({ name, passed: true, ...details })
  console.log(`PASS ${name}`)
}

async function assembly(state) {
  await waitFor(label(`Assembly: ${state}`), `animation completed: ${state}`)
  return waitFor(label('組物: timber bracket assembly'), 'native GL image')
}

function canvasImage(name, canvas) {
  const buffer = screenshot(name)
  const screen = parseIosNodes(latestTree).find((node) => node.type === 'Application')
  assert.ok(screen, 'AX tree must expose the application screen bounds')
  const bounds = pixelBounds(canvas.rect, screen.rect, PNG.sync.read(buffer))
  return imageRegion(buffer, bounds)
}

try {
  const binary = resolve(root, 'ios/build/Build/Products/Release-iphonesimulator/HozoShowcase.app')
  assert.ok(statSync(resolve(binary, 'main.jsbundle')).size > 0, 'standalone JS bundle is missing')
  const recognizer = resolve(output, 'recognize-text')
  run('xcrun', ['swiftc', resolve(root, 'scripts/recognize-text.swift'), '-o', recognizer], 120_000)
  const devices = JSON.parse(simctl('list', 'devices', 'available', '--json')).devices
  // Resolve once, and use the exact UDID for boot, install, input and screenshots.
  // Duplicate device names across installed iOS runtimes must not switch targets.
  const candidates = Object.entries(devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .flatMap(([runtime, entries]) => entries.map((device) => ({ ...device, runtime })))
  const device = process.env.IOS_UDID
    ? candidates.find((candidate) => candidate.udid === process.env.IOS_UDID)
    : candidates.find((candidate) => candidate.name === (process.env.IOS_DEVICE ?? 'iPhone 17'))
  assert.ok(device, 'requested iOS simulator is not available')
  udid = device.udid
  evidence.simulator = device
  if (device.state !== 'Booted') simctl('boot', udid)
  run('xcrun', ['simctl', 'bootstatus', udid, '-b'], 180_000)
  // A fresh hosted simulator may still be preparing its installation service
  // after SpringBoard reports booted. Give installation its own bounded budget,
  // without retrying interactions or weakening their assertions.
  run('xcrun', ['simctl', 'install', udid, binary], 120_000)
  const logFd = openSync(resolve(output, 'syslog.txt'), 'w')
  logger = spawn(
    'xcrun',
    [
      'simctl',
      'spawn',
      udid,
      'log',
      'stream',
      '--level',
      'debug',
      '--predicate',
      'process == "HozoShowcase"',
    ],
    { stdio: ['ignore', logFd, logFd] },
  )
  closeSync(logFd)
  logger.on('error', (error) => {
    evidence.logError = error.message
  })
  if (evidence.diagnostic) {
    run(
      'xcrun',
      ['simctl', 'launch', '--terminate-running-process', udid, 'com.apple.Preferences'],
      120_000,
    )
    await tap(label('General'), 'Settings control: General')
    await waitFor(label('About'), 'Settings control navigates to General')
    screenshot('00-settings-control')
    evidence.settingsControl = { passed: true, action: 'General opens About row' }
  }
  // The cold simulator's launch service can also lag behind bootstatus.
  // Keep one bounded launch attempt, separate from the UI-readiness budget.
  run('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, app], 120_000)
  // Establish the reader against the app's own ready window before openurl
  // introduces an OS confirmation. Launch returning is not UI readiness.
  await waitFor((node) => node.AXUniqueId === 'mobile-menu-button', 'initial Storybook window')
  await story('primitives-shared-showcase--buttons', 'Add one')
  await waitFor(label('Pressed 0 times'), 'initial counter')
  await tap(label('Add one'), 'counter button')
  await waitFor(label('Pressed 1 times'), 'incremented counter')
  screenshot('01-counter')
  await tap(label('Reset'), 'reset button')
  await waitFor(label('Pressed 0 times'), 'reset counter')
  record('counter increments and resets')

  await tap((node) => node.AXUniqueId === 'mobile-menu-button', 'Storybook menu')
  // idb's AX readers omit/stall on this third-party animated portal. Read its
  // visible text instead, with measured boxes, not magic coordinates. All Hozo
  // controls below still use AX. This is not a sidebar accessibility claim.
  const screen = parseIosNodes(latestTree).find((node) => node.type === 'Application')
  assert.ok(screen, 'missing screen bounds for visual selection')
  const deadline = Date.now() + 60_000
  let typography
  do {
    screenshot('02-story-selector', false)
    const boxes = JSON.parse(run(recognizer, [resolve(output, '02-story-selector.png')]).toString())
    writeFileSync(resolve(output, '02-story-selector-ocr.json'), JSON.stringify(boxes, null, 2))
    typography = visualTextControl(boxes, 'Typography', screen.rect)
    if (typography) break
    await pause(500)
  } while (Date.now() < deadline)
  assert.ok(typography, 'Typography is not uniquely visible in the actual menu')
  idb('ui', 'tap', ...centre(typography).map(String))
  const backdrop = await waitFor(label('Bottom sheet backdrop'), 'Storybook selector backdrop')
  const [left, top, right, bottom] = backdrop.rect
  // The persistent drawer covers the bottom 75%; tap the exposed backdrop.
  idb(
    'ui',
    'tap',
    String(Math.floor((left + right) / 2)),
    String(Math.floor(top + (bottom - top) / 10)),
  )
  await waitFor(label('日本語の表示'), 'Typography story rendered')
  screenshot('03-typography')
  record('Storybook selector switches stories')

  await story('primitives-shared-showcase--disabled', 'Add one')
  const disabled = await waitFor(label('Add one'), 'disabled counter button')
  assert.equal(disabled.enabled, false, 'button is not exposed as disabled')
  await tap(label('Add one'), 'disabled counter button')
  await waitFor(label('Pressed 0 times'), 'disabled counter remains unchanged')
  screenshot('04-disabled')
  record('disabled button does not activate')

  await story('primitives-shared-showcase--form', 'Save profile')
  await tap((node) => label('Display name')(node) && /TextField/.test(node.type), 'name input')
  idb('ui', 'text', 'Hozo')
  await tap(label('Save profile'), 'save profile')
  await waitFor(label('Saved: Hozo'), 'saved form value')
  screenshot('05-form')
  record('native keyboard input and save')

  await story('patterns-shared-showcase--preferences', 'Email notifications')
  await tap(label('Email notifications'), 'email checkbox')
  await tap(label('Automatic updates'), 'updates switch')
  await waitFor(label('Preferences: email on, updates off'), 'preference state changes')
  const required = await waitFor(label('Required security notices'), 'required checkbox')
  assert.equal(required.enabled, false, 'required checkbox must be disabled')
  await tap(label('Required security notices'), 'disabled required checkbox')
  await waitFor(label('Preferences: email on, updates off'), 'disabled preference unchanged')
  screenshot('06-preferences')
  record('shared checkbox and switch change state, disabled checkbox does not activate')

  await story('patterns-shared-showcase--sections', 'Current section: Overview')
  await tap(label('Details'), 'details tab')
  await waitFor(label('Current section: Details'), 'selected tab updates')
  await waitFor(label('Workspace details and activity.'), 'selected tab panel')
  await tap(label('Unavailable'), 'disabled tab')
  await waitFor(label('Current section: Details'), 'disabled tab does not select')
  screenshot('07-sections')
  record('shared tabs switch panels and reject disabled selection')

  await story('patterns-shared-showcase--confirmation', 'Review changes')
  await tap(label('Review changes'), 'dialog opener')
  await waitFor(label('Confirm save'), 'dialog opens')
  screenshot('08-confirmation-open')
  await tap(label('Cancel changes'), 'cancel changes')
  await waitFor(label('Changes: not saved'), 'dialog cancels without saving')
  await tap(label('Review changes'), 'reopen dialog')
  await tap(label('Confirm save'), 'confirm changes')
  await waitFor(label('Changes: saved'), 'dialog confirmation result')
  screenshot('09-confirmation-saved')
  record('shared dialog opens, cancels and confirms')

  await story('three-kumimono--assembly', '組物: timber bracket assembly')
  const canvas = await assembly('assembled')
  const assembled = await waitForImage(
    () => canvasImage('10-assembled', canvas),
    (image) => image.colours >= 40,
    'assembled first frame',
  )
  assert.ok(assembled.colours >= 40, `GL surface appears blank: ${assembled.colours} colours`)
  await tap(label('分解'), 'disassemble')
  await assembly('disassembled')
  const disassembled = await waitForImage(
    () => canvasImage('11-disassembled', canvas),
    (image) => image.colours >= 40 && changedFraction(assembled, image) >= 0.01,
    'disassembled frame',
  )
  const difference = changedFraction(assembled, disassembled)
  assert.ok(difference >= 0.01, `GL image did not change: ${difference}`)
  await tap(label('組み立て'), 'assemble')
  await assembly('assembled')
  const reassembled = await waitForImage(
    () => canvasImage('12-reassembled', canvas),
    (image) => image.colours >= 40 && changedFraction(disassembled, image) >= 0.01,
    'reassembled frame',
  )
  const reverseDifference = changedFraction(disassembled, reassembled)
  assert.ok(reverseDifference >= 0.01, `reverse GL image did not change: ${reverseDifference}`)
  record('Expo GL renders and animates the actual scene', {
    colours: assembled.colours,
    changedFraction: difference,
    reverseChangedFraction: reverseDifference,
  })

  await story('primitives-shared-showcase--buttons', 'Add one')
  await tap(label('Add one'), 'counter after GL unmount')
  await waitFor(label('Pressed 1 times'), 'counter after GL unmount works')
  screenshot('13-after-gpu')
  record('switching away from GPU story keeps the app usable')
  evidence.passed = true
} catch (error) {
  evidence.error = error.stack
  evidence.errorCause = error.cause?.message
  try {
    if (udid) screenshot('failure')
  } catch {
    /* Preserve original failure. */
  }
  throw error
} finally {
  logger?.kill()
  if (evidence.diagnostic) {
    try {
      cpSync('/tmp/idb/logs', resolve(output, 'companion-logs'), { recursive: true })
    } catch (error) {
      evidence.companionLogError = String(error)
    }
  }
  writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
}
