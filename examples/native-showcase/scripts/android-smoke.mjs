import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { centre, changedFraction, imageRegion, matchLabel, parseNodes } from './device-evidence.mjs'
import { waitForImage } from './image-ready.mjs'

const app = 'dev.hozo.showcase'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? resolve(root, '../../artifacts/native-showcase'))
mkdirSync(output, { recursive: true })
const evidence = {
  platform: 'Android',
  device: 'emulator',
  checks: [],
  passed: false,
  binaryRun: process.env.HOZO_BINARY_RUN,
  driverCommit: process.env.GITHUB_SHA,
  systemImage: process.env.HOZO_ANDROID_TARGET,
  diagnostic: process.env.HOZO_DIAGNOSTICS === '1',
}
const adb = (...args) => execFileSync('adb', args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
const label = (value) => (node) => matchLabel(node, value)
let latestXml = ''

function collectSystemState(prefix) {
  if (!evidence.diagnostic) return
  const reads = {
    logcat: ['logcat', '-b', 'all', '-d'],
    cpu: ['shell', 'dumpsys', 'cpuinfo'],
    pressure: ['shell', 'cat', '/proc/pressure/cpu', '/proc/pressure/memory', '/proc/pressure/io'],
    input: ['shell', 'dumpsys', 'input'],
    anr: ['shell', 'dumpsys', 'dropbox', '--print', 'system_app_anr'],
  }
  for (const [name, args] of Object.entries(reads)) {
    try {
      writeFileSync(resolve(output, `${prefix}-${name}.txt`), adb(...args))
    } catch (error) {
      writeFileSync(resolve(output, `${prefix}-${name}-error.txt`), String(error))
    }
  }
}

function nodes() {
  const dump = adb('shell', 'uiautomator', 'dump', '/sdcard/hozo-showcase.xml').toString()
  assert.ok(dump.includes('dumped to:'), `uiautomator did not refresh the tree: ${dump}`)
  latestXml = adb('exec-out', 'cat', '/sdcard/hozo-showcase.xml').toString()
  return parseNodes(latestXml)
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
  adb('shell', 'input', 'tap', ...centre(node).map(String))
}

function screenshot(name) {
  const png = adb('exec-out', 'screencap', '-p')
  writeFileSync(resolve(output, `${name}.png`), png)
  writeFileSync(resolve(output, `${name}.xml`), latestXml)
  return png
}

async function story(id, expected) {
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `hozo-showcase://storybook?STORYBOOK_STORY_ID=${id}`,
    app,
  )
  await waitFor(label(expected), `story ${id}`)
}

function record(name, details = {}) {
  evidence.checks.push({ name, passed: true, ...details })
  console.log(`PASS ${name}`)
}

async function assembly(state) {
  await waitFor(label(`Assembly: ${state}`), `animation completed: ${state}`)
  // The accessible Canvas bounds exclude the changing status/buttons. A blank
  // GL surface or a status-only update cannot satisfy this pixel comparison.
  return waitFor(label('組物: timber bracket assembly'), 'native GL image')
}

try {
  evidence.android = adb('shell', 'getprop', 'ro.build.version.release').toString().trim()
  // Preserve cold-boot failures before the normal driver clears logcat.
  collectSystemState('before-app')
  adb('install', '-r', resolve(root, 'android/app/build/outputs/apk/release/app-release.apk'))
  adb('logcat', '-c')
  adb('shell', 'am', 'force-stop', app)
  await story('primitives-shared-showcase--buttons', 'Add one')
  await waitFor(label('Pressed 0 times'), 'initial counter')
  await tap(label('Add one'), 'counter button')
  await waitFor(label('Pressed 1 times'), 'incremented counter')
  screenshot('01-counter')
  await tap(label('Reset'), 'reset button')
  await waitFor(label('Pressed 0 times'), 'reset counter')
  record('counter increments and resets')

  // Exercise Storybook's real story selector, not just deep-link routing.
  await tap((node) => node['resource-id'] === 'mobile-menu-button', 'Storybook menu')
  await waitFor(label('Typography'), 'Typography in story selector')
  screenshot('02-story-selector')
  await tap(label('Typography'), 'select Typography')
  const backdrop = await waitFor(label('Bottom sheet backdrop'), 'Storybook selector backdrop')
  const [left, top, right, bottom] = backdrop.rect
  // The 75%-height drawer stays open after selection. Its backdrop occupies
  // the whole screen, but only the top quarter is unobstructed by the drawer.
  adb(
    'shell',
    'input',
    'tap',
    String(Math.floor((left + right) / 2)),
    String(Math.floor(top + (bottom - top) / 10)),
  )
  await waitFor(label('日本語の表示'), 'Typography story rendered')
  screenshot('03-typography')
  record('Storybook selector switches stories')

  await story('primitives-shared-showcase--disabled', 'Add one')
  const disabledButton = await waitFor(
    (node) => node.class === 'android.widget.Button' && matchLabel(node, 'Add one'),
    'native disabled button',
  )
  assert.equal(disabledButton.enabled, 'false', 'button is not exposed as disabled')
  await tap(label('Add one'), 'disabled counter button')
  await waitFor(label('Pressed 0 times'), 'disabled counter remains unchanged')
  screenshot('04-disabled')
  record('disabled button does not activate')

  await story('primitives-shared-showcase--form', 'Save profile')
  await tap((node) => node.class === 'android.widget.EditText', 'name input')
  adb('shell', 'input', 'text', 'Hozo')
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await tap(label('Save profile'), 'save profile')
  await waitFor(label('Saved: Hozo'), 'saved form value')
  screenshot('05-form')
  record('native keyboard input and save')

  await story('patterns-shared-showcase--preferences', 'Email notifications')
  await tap(label('Email notifications'), 'email checkbox')
  await tap(label('Automatic updates'), 'updates switch')
  await waitFor(label('Preferences: email on, updates off'), 'preference state changes')
  const required = await waitFor(label('Required security notices'), 'required checkbox')
  assert.equal(required.enabled, 'false', 'required checkbox must be disabled')
  assert.equal(required.checked, 'true', 'required checkbox must stay checked')
  await tap(label('Required security notices'), 'disabled required checkbox')
  await waitFor(label('Preferences: email on, updates off'), 'disabled preference unchanged')
  screenshot('12-preferences')
  record('shared checkbox and switch change state, disabled checkbox stays checked')

  await story('patterns-shared-showcase--sections', 'Current section: Overview')
  await tap(label('Details'), 'details tab')
  await waitFor(label('Current section: Details'), 'selected tab updates')
  await waitFor(label('Workspace details and activity.'), 'selected tab panel')
  await tap(label('Unavailable'), 'disabled tab')
  await waitFor(label('Current section: Details'), 'disabled tab does not select')
  screenshot('13-sections')
  record('shared tabs switch panels and reject disabled selection')

  await story('patterns-shared-showcase--confirmation', 'Review changes')
  await tap(label('Review changes'), 'dialog opener')
  await waitFor(label('Confirm save'), 'dialog opens')
  screenshot('14-confirmation-open')
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await waitFor(label('Changes: not saved'), 'Android Back cancels without saving')
  await tap(label('Review changes'), 'reopen dialog')
  await tap(label('Confirm save'), 'confirm changes')
  await waitFor(label('Changes: saved'), 'dialog confirmation result')
  screenshot('15-confirmation-saved')
  record('shared dialog opens, Android Back cancels, confirmation saves')

  await story('three-kumimono--assembly', '組物: timber bracket assembly')
  const canvas = await assembly('assembled')
  const assembled = await waitForImage(
    () => imageRegion(screenshot('06-assembled'), canvas.rect),
    (image) => image.colours >= 40,
    'assembled first frame',
  )
  assert.ok(assembled.colours >= 40, `GL surface appears blank: ${assembled.colours} colours`)
  await tap(label('分解'), 'disassemble')
  await assembly('disassembled')
  const disassembled = await waitForImage(
    () => imageRegion(screenshot('07-disassembled'), canvas.rect),
    (image) => image.colours >= 40 && changedFraction(assembled, image) >= 0.01,
    'disassembled frame',
  )
  const difference = changedFraction(assembled, disassembled)
  assert.ok(difference >= 0.01, `GL image did not change: ${difference}`)
  await tap(label('組み立て'), 'assemble')
  await assembly('assembled')
  const reassembled = await waitForImage(
    () => imageRegion(screenshot('08-reassembled'), canvas.rect),
    (image) => image.colours >= 40 && changedFraction(disassembled, image) >= 0.01,
    'reassembled frame',
  )
  const reverseDifference = changedFraction(disassembled, reassembled)
  assert.ok(
    reverseDifference >= 0.01,
    `reverse GL animation did not change image: ${reverseDifference}`,
  )
  record('Expo GL renders and animates the actual scene', {
    colours: assembled.colours,
    changedFraction: difference,
    reverseChangedFraction: reverseDifference,
  })

  const originalPid = adb('shell', 'pidof', app).toString().trim()
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
  await pause(1_000)
  // Resume the activity without selecting the story again: a deep link could
  // recreate it and hide a broken existing GL context behind a fresh mount.
  adb('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`)
  const resumedCanvas = await assembly('assembled')
  assert.equal(
    adb('shell', 'pidof', app).toString().trim(),
    originalPid,
    'resume replaced the app process',
  )
  const resumed = await waitForImage(
    () => imageRegion(screenshot('09-resumed'), resumedCanvas.rect),
    (image) => image.colours >= 40,
    'resumed frame',
  )
  assert.ok(resumed.colours >= 40, 'GL surface blank after resume')
  await tap(label('分解'), 'disassemble after resume')
  await assembly('disassembled')
  const resumedChanged = await waitForImage(
    () => imageRegion(screenshot('10-resumed-disassembled'), resumedCanvas.rect),
    (image) => image.colours >= 40 && changedFraction(resumed, image) >= 0.01,
    'disassembled frame after resume',
  )
  assert.ok(changedFraction(resumed, resumedChanged) >= 0.01, 'GL animation stopped after resume')
  record('background/resume preserves interactive rendering')

  await story('primitives-shared-showcase--buttons', 'Add one')
  await tap(label('Add one'), 'counter after GL unmount')
  await waitFor(label('Pressed 1 times'), 'counter after GL unmount works')
  screenshot('11-after-gpu')
  assert.ok(adb('shell', 'pidof', app).toString().trim(), 'showcase process exited')
  record('switching away from GPU story keeps the app usable')
  evidence.passed = true
} catch (error) {
  evidence.error = error.stack
  collectSystemState('failure-system')
  try {
    screenshot('failure')
  } catch {
    /* Preserve the original failure. */
  }
  throw error
} finally {
  writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  try {
    writeFileSync(resolve(output, 'logcat.txt'), adb('logcat', '-d'))
  } catch {
    /* Device may have stopped. */
  }
}
