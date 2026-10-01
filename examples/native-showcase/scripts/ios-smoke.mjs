import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { centre, changedFraction, imageRegion } from './device-evidence.mjs'
import { parseIosNodes, pixelBounds } from './ios-evidence.mjs'

const app = 'dev.hozo.showcase'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? resolve(root, '../../artifacts/native-showcase-ios'))
mkdirSync(output, { recursive: true })
const evidence = { platform: 'iOS', device: 'simulator', checks: [], passed: false }
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
let logStream

const idb = (...args) => run('idb', [...args, '--udid', udid])

function nodes() {
  latestTree = idb('ui', 'describe-all', '--nested').toString()
  return parseIosNodes(latestTree)
}

async function waitFor(predicate, description, timeout = 60_000) {
  const deadline = Date.now() + timeout
  let lastError
  do {
    try {
      const found = nodes().find(predicate)
      if (found) return found
    } catch (error) {
      lastError = error
    }
    await pause(1_000)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${description}`, { cause: lastError })
}

async function tap(predicate, description) {
  const node = await waitFor(predicate, description)
  idb('ui', 'tap', ...centre(node).map(String))
}

function screenshot(name) {
  const path = resolve(output, `${name}.png`)
  simctl('io', udid, 'screenshot', path)
  writeFileSync(resolve(output, `${name}.json`), latestTree)
  return readFileSync(path)
}

async function story(id, expected) {
  simctl('openurl', udid, `hozo-showcase://storybook?STORYBOOK_STORY_ID=${id}`)
  await waitFor(label(expected), `story ${id}`)
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
  simctl('install', udid, binary)
  logStream = createWriteStream(resolve(output, 'syslog.txt'))
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
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  logger.stdout.pipe(logStream)
  logger.stderr.pipe(logStream, { end: false })
  logger.on('error', (error) => {
    evidence.logError = error.message
  })
  simctl('launch', '--terminate-running-process', udid, app)
  await story('primitives-shared-showcase--buttons', 'Add one')
  await waitFor(label('Pressed 0 times'), 'initial counter')
  await tap(label('Add one'), 'counter button')
  await waitFor(label('Pressed 1 times'), 'incremented counter')
  screenshot('01-counter')
  await tap(label('Reset'), 'reset button')
  await waitFor(label('Pressed 0 times'), 'reset counter')
  record('counter increments and resets')

  await tap((node) => node.AXUniqueId === 'mobile-menu-button', 'Storybook menu')
  await waitFor(label('Typography'), 'Typography in story selector')
  screenshot('02-story-selector')
  await tap(label('Typography'), 'select Typography')
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
  const assembled = canvasImage('10-assembled', canvas)
  assert.ok(assembled.colours >= 40, `GL surface appears blank: ${assembled.colours} colours`)
  await tap(label('分解'), 'disassemble')
  await assembly('disassembled')
  const disassembled = canvasImage('11-disassembled', canvas)
  const difference = changedFraction(assembled, disassembled)
  assert.ok(difference >= 0.01, `GL image did not change: ${difference}`)
  await tap(label('組み立て'), 'assemble')
  await assembly('assembled')
  const reassembled = canvasImage('12-reassembled', canvas)
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
  try {
    if (udid) screenshot('failure')
  } catch {
    /* Preserve original failure. */
  }
  throw error
} finally {
  logger?.kill()
  logStream?.end()
  writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
}
