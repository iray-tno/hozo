import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { prepareAndroid } from './android-startup.mjs'
import { waitForAndroidControl } from './android-ui-wait.mjs'
import { exerciseAudioOutput } from './audio-output.mjs'
import { exerciseAudioSettingsOutput } from './audio-settings-output.mjs'
import { readCanvasRounds } from './canvas-rounds.mjs'
import { centre, changedFraction, imageRegion, matchLabel, parseNodes } from './device-evidence.mjs'
import { waitForImage } from './image-ready.mjs'
import { observeStoryRoute } from './story-route-evidence.mjs'
import { exerciseSvgFilters, readAndroidScenario } from './svg-filter-evidence.mjs'
import { exerciseTextInheritance, textFrame, textImage } from './text-pixels.mjs'
import {
  exerciseUiDocs,
  UI_LANDSCAPE_OVERLAY_SCENES,
  UI_OVERLAY_SCENES,
  UI_STATE_SCENES,
} from './ui-docs-evidence.mjs'
import {
  exerciseVideo,
  exerciseVideoPoster,
  VIDEO_PROBE_LABEL,
  videoStatus,
} from './video-evidence.mjs'

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
  canvasRounds: readCanvasRounds(process.env.HOZO_ANDROID_CANVAS_ROUNDS),
  scenario: readAndroidScenario(process.env.HOZO_ANDROID_SCENARIO),
}
const adb = (...args) => execFileSync('adb', args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
const label = (value) => (node) => matchLabel(node, value)
let latestXml = ''

function collectSystemState(prefix, force = false) {
  if (!evidence.diagnostic && !force) return
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
  return waitForAndroidControl(predicate, description, { readNodes: nodes, timeout })
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
  const url = `hozo-showcase://storybook?STORYBOOK_STORY_ID=${id}`
  return observeStoryRoute(
    {
      id,
      expected,
      url,
      dispatch: () =>
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url, app),
      waitForExpected: () => waitFor(label(expected), `story ${id}`),
    },
    evidence,
  )
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

async function fullShowcase() {
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

  const videoDriver = {
    story,
    waitFor: (text) => waitFor(label(text), `video control: ${text}`),
    waitStatus: async (accept, description) => {
      const node = await waitFor((node) => {
        const status = videoStatus(node.text || node['content-desc'])
        return status && accept(status)
      }, description)
      return videoStatus(node.text || node['content-desc'])
    },
    tap: (text) => tap(label(text), `video action: ${text}`),
    hasVideo: () => nodes().some(label(VIDEO_PROBE_LABEL)),
    capture: (name, node) => imageRegion(screenshot(name), node.rect),
    waitForImage,
    record,
  }
  await exerciseVideo(videoDriver, evidence)
  await exerciseVideoPoster(videoDriver, evidence)

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
  // Explicit stress coverage after the unchanged full interaction sequence.
  // A failed mount/assertion aborts immediately: later rounds cannot rescue it.
  for (let round = 2; round <= evidence.canvasRounds; round++) {
    evidence.currentCanvasRound = round
    const prefix = `round-${round}`
    await story('three-kumimono--assembly', '組物: timber bracket assembly')
    const bounds = await assembly('assembled')
    const before = await waitForImage(
      () => imageRegion(screenshot(`${prefix}-assembled`), bounds.rect),
      (image) => image.colours >= 40,
      `${prefix} initial frame`,
    )
    await tap(label('分解'), `${prefix} disassemble`)
    await assembly('disassembled')
    const after = await waitForImage(
      () => imageRegion(screenshot(`${prefix}-disassembled`), bounds.rect),
      (image) => image.colours >= 40 && changedFraction(before, image) >= 0.01,
      `${prefix} disassembled frame`,
    )
    await tap(label('組み立て'), `${prefix} reassemble`)
    await assembly('assembled')
    const restored = await waitForImage(
      () => imageRegion(screenshot(`${prefix}-reassembled`), bounds.rect),
      (image) => image.colours >= 40 && changedFraction(after, image) >= 0.01,
      `${prefix} reassembled frame`,
    )
    await story('primitives-shared-showcase--buttons', 'Add one')
    await waitFor(label('Pressed 0 times'), `${prefix} new counter after GPU unmount`)
    await tap(label('Add one'), `${prefix} counter after GPU unmount`)
    await waitFor(label('Pressed 1 times'), `${prefix} counter responds after GPU unmount`)
    record('repeated Canvas mount, both animation directions and usable unmount', {
      round,
      colours: before.colours,
      changedFraction: changedFraction(before, after),
      reverseChangedFraction: changedFraction(after, restored),
    })
  }
}

try {
  evidence.android = adb('shell', 'getprop', 'ro.build.version.release').toString().trim()
  // Preserve cold-boot failures before the normal driver clears logcat.
  collectSystemState('before-app')
  await prepareAndroid(
    {
      read: (args) => adb(...args),
      install: (timeout) =>
        execFileSync(
          'adb',
          ['install', '-r', resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')],
          { timeout, maxBuffer: 16 * 1024 * 1024 },
        ),
    },
    evidence,
  )
  adb('logcat', '-c')
  adb('shell', 'am', 'force-stop', app)
  if (evidence.scenario === 'audio-output' || evidence.scenario === 'audio-settings') {
    assert.equal(process.env.QEMU_AUDIO_DRV, 'wav', 'audio output needs the QEMU WAV backend')
    assert.ok(process.env.QEMU_WAV_PATH, 'missing QEMU output path')
    adb('shell', 'settings', 'put', 'system', 'sound_effects_enabled', '0')
    evidence.audioVolume = {
      requestedMusicIndex: 15,
      // A requested volume is not an observed gain. Retain Android's response
      // (including --get or command errors) alongside the independently captured PCM.
      response: adb(
        'shell',
        'cmd',
        'media_session',
        'volume',
        '--stream',
        '3',
        '--set',
        '15',
        '--get',
      ).toString(),
    }
    const exerciseOutput =
      evidence.scenario === 'audio-settings' ? exerciseAudioSettingsOutput : exerciseAudioOutput
    await exerciseOutput(
      {
        story,
        waitFor: (value) => waitFor(label(value), value),
        tap: (value) => tap(label(value), value),
        record,
      },
      evidence,
      process.env.QEMU_WAV_PATH,
      output,
    )
  } else if (evidence.scenario === 'text-inheritance') {
    const { prepareTextDeviceFixture } = await import(
      '../../../packages/tailwind-conformance/src/text-inheritance-device-source.ts'
    )
    evidence.textFixture = prepareTextDeviceFixture().manifest
    evidence.apkSha256 = createHash('sha256')
      .update(readFileSync(resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')))
      .digest('hex')
    assert.ok(
      evidence.binaryRun && evidence.binaryRun === process.env.GITHUB_RUN_ID,
      'text evidence needs a fresh build from this run',
    )
    assert.match(evidence.driverCommit ?? '', /^[a-f0-9]{40}$/, 'missing driver source commit')
    assert.equal(evidence.diagnostic, false, 'text equivalence is not a diagnostic-mode success')
    const require = createRequire(import.meta.url)
    evidence.androidApiLevel = adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim()
    evidence.installedRuntimeVersions = {
      react: require('react/package.json').version,
      reactNative: require('react-native/package.json').version,
    }
    evidence.textSourceHashes = Object.fromEntries(
      [
        'src/text-inheritance-generated.tsx',
        'src/text-inheritance-probe.tsx',
        'src/text-inheritance-reference.native.ts',
        'src/text-inheritance-opaque.native.tsx',
        'scripts/text-pixels.mjs',
      ].map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(resolve(root, name)))
          .digest('hex'),
      ]),
    )
    await exerciseTextInheritance(
      {
        story,
        tap: (value) => tap(label(value), value),
        waitFor: (value) => waitFor(label(value), value),
        waitForImage,
        record,
        capture: async (name, mode, tick) => {
          const expression = new RegExp(`^${mode} mount [1-9]\\d* tick ${tick}$`)
          const node = await waitFor(
            (node) => expression.test(node['content-desc'] ?? ''),
            `${mode} Text mount identity`,
          )
          const frameNode = await waitFor(label(`Text frame ${mode}`), 'presented mode marker')
          const buffer = screenshot(name)
          return {
            name,
            bounds: node.rect,
            label: node['content-desc'],
            image: textImage(buffer, node.rect),
            frame: textFrame(buffer, frameNode.rect, mode),
          }
        },
      },
      evidence,
    )
  } else if (evidence.scenario === 'svg-filters') {
    evidence.sceneSourceSha256 = createHash('sha256')
      .update(readFileSync(resolve(root, '../showcase/src/svg-filter-scene.tsx')))
      .digest('hex')
    evidence.svgPeerVersion = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ).dependencies['react-native-svg']
    await exerciseSvgFilters(
      {
        story,
        waitFor: (value) => waitFor(label(value), value),
        tap: (value) => tap(label(value), value),
        screenshot,
        waitForImage,
        record,
      },
      evidence,
    )
  } else if (evidence.scenario === 'ui-docs') {
    evidence.uiDocs = await exerciseUiDocs(
      {
        open: (id) =>
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
          ),
        waitForEither: async (labels, timeout) => {
          await waitFor(
            (candidate) => labels.some((value) => matchLabel(candidate, value)),
            labels.join(' or '),
            timeout,
          )
          // The tree the wait just matched, searched in the walk's order.
          const tree = parseNodes(latestXml)
          return labels.find((value) => tree.some((node) => matchLabel(node, value)))
        },
        // Fonts, images and the first layout pass, which the marker can
        // precede by a frame or two.
        settle: () => pause(1500),
        logs: () => adb('logcat', '-d', '-s', 'ReactNativeJS:*').toString(),
        capture: (name) =>
          writeFileSync(resolve(output, `${name}.png`), adb('exec-out', 'screencap', '-p')),
        // Locked rather than left to the accelerometer, which an emulator does
        // not have in any useful sense. Pixel 6's camera cut-out is then on
        // the left.
        rotate: async (landscape) => {
          adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
          adb('shell', 'settings', 'put', 'system', 'user_rotation', landscape ? '1' : '0')
          await pause(2000)
        },
      },
      output,
      {
        states: UI_STATE_SCENES,
        overlays: UI_OVERLAY_SCENES,
        landscape: UI_LANDSCAPE_OVERLAY_SCENES,
      },
    )
  } else {
    await fullShowcase()
  }
  evidence.passed = true
} catch (error) {
  evidence.error = error.stack
  evidence.blockingSystemDialog = error.blockingDialog
  // Collect once on failure even in a functional run; startup/package checks
  // cannot prove that System UI remains responsive after cold installation.
  collectSystemState('failure-system', true)
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
