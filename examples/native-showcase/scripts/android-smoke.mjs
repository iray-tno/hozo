import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { centre, changedFraction, imageRegion, matchLabel, parseNodes } from './device-evidence.mjs'

const app = 'dev.hozo.showcase'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? resolve(root, '../../artifacts/native-showcase'))
mkdirSync(output, { recursive: true })
const evidence = { platform: 'Android', device: 'emulator', checks: [], passed: false }
const adb = (...args) => execFileSync('adb', args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
const label = (value) => (node) => matchLabel(node, value)
let latestXml = ''

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
  await waitFor(label('日本語の表示'), 'Typography story rendered')
  screenshot('03-typography')
  record('Storybook selector switches stories')

  await story('primitives-shared-showcase--disabled', 'Add one')
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

  await story('three-kumimono--assembly', '組物: timber bracket assembly')
  const canvas = await assembly('assembled')
  const assembled = imageRegion(screenshot('06-assembled'), canvas.rect)
  assert.ok(assembled.colours >= 40, `GL surface appears blank: ${assembled.colours} colours`)
  await tap(label('分解'), 'disassemble')
  await assembly('disassembled')
  const disassembled = imageRegion(screenshot('07-disassembled'), canvas.rect)
  const difference = changedFraction(assembled, disassembled)
  assert.ok(difference >= 0.01, `GL image did not change: ${difference}`)
  await tap(label('組み立て'), 'assemble')
  await assembly('assembled')
  const reassembled = imageRegion(screenshot('08-reassembled'), canvas.rect)
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

  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
  await pause(1_000)
  // Resume the activity without selecting the story again: a deep link could
  // recreate it and hide a broken existing GL context behind a fresh mount.
  adb('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`)
  const resumedCanvas = await assembly('assembled')
  const resumed = imageRegion(screenshot('09-resumed'), resumedCanvas.rect)
  assert.ok(resumed.colours >= 40, 'GL surface blank after resume')
  await tap(label('分解'), 'disassemble after resume')
  await assembly('disassembled')
  const resumedChanged = imageRegion(screenshot('10-resumed-disassembled'), resumedCanvas.rect)
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
