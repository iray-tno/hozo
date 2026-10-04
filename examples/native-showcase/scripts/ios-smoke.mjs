import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { centre, changedFraction, imageRegion } from './device-evidence.mjs'
import { observeLateImage, PresentedImageTimeout, waitForImage } from './image-ready.mjs'
import { parseIosNodes, pixelBounds } from './ios-evidence.mjs'
import { enterIosText } from './ios-form-input.mjs'
import { IOS_SCENE_IMAGE_TIMEOUT, waitForIosSceneImage } from './ios-image-ready.mjs'
import { connectIosInput, discoverIosDevices } from './ios-input-connection.mjs'
import { launchIosApp } from './ios-launch.mjs'
import { selectIosSimulator, waitForIosBoot } from './ios-simulator.mjs'
import { selectStableIosText, waitForIosStorySelection } from './ios-story-selector.mjs'
import { waitForIosControl } from './ios-ui-wait.mjs'

const app = 'dev.hozo.showcase'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? resolve(root, '../../artifacts/native-showcase-ios'))
mkdirSync(output, { recursive: true })
const evidence = {
  platform: 'iOS',
  device: 'simulator',
  axBackend: process.env.HOZO_AX_BACKEND || 'ax',
  sidebarSelection: 'visible text (Apple Vision)',
  scenario: process.env.HOZO_IOS_SCENARIO || 'full',
  canvasMode: process.env.HOZO_IOS_CANVAS_MODE || 'demand',
  sceneImageTimeoutMs: IOS_SCENE_IMAGE_TIMEOUT,
  checks: [],
  passed: false,
  binaryRun: process.env.HOZO_BINARY_RUN,
  jsBundleCommit: process.env.HOZO_IOS_BUNDLE_COMMIT || undefined,
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
  // The guest reader failed to resolve even Settings on the reference runner;
  // the host reader reached the showcase's controls. Keep the choice explicit,
  // with no silent fallback to turn a failure into a pass.
  assert.ok(['axbridge', 'ax'].includes(evidence.axBackend), 'unsupported AX backend')
  latestTree = idb('ui', 'describe-all', '--api', evidence.axBackend, '--nested').toString()
  return parseIosNodes(latestTree)
}

async function waitFor(predicate, description, timeout = 60_000, allowOpenConfirmation = false) {
  return waitForIosControl(predicate, description, {
    readNodes: nodes,
    tapConfirmation: (node) => idb('ui', 'tap', ...centre(node).map(String)),
    observation: evidence,
    timeout,
    allowOpenConfirmation,
  })
}

async function tap(predicate, description) {
  const node = await waitFor(predicate, description)
  idb('ui', 'tap', ...centre(node).map(String))
  return node
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

function launch(appId) {
  const observation = {}
  evidence.launches ??= {}
  evidence.launches[appId] = observation
  // Startup failures happen before the application's own log exists. Retain
  // read-only command/SpringBoard samples even in a normal PR run. This neither
  // launches another app nor retries/extends the existing launch deadline.
  const watcher = spawn(
    process.execPath,
    [
      resolve(root, 'scripts/ios-input-watch.mjs'),
      String(process.pid),
      resolve(output, `launch-${appId}-stacks`),
      'launch',
    ],
    { stdio: 'ignore' },
  )
  watcher.on('error', (error) => {
    observation.samplingError = error.message
  })
  try {
    return launchIosApp(udid, appId, run, observation)
  } finally {
    watcher.kill()
  }
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
  assert.ok(
    ['full', 'canvas', 'gl-control'].includes(evidence.scenario),
    'unsupported iOS scenario',
  )
  assert.ok(
    ['demand', 'continuous', 'instant', 'synchronized', 'paced'].includes(evidence.canvasMode),
    'unsupported Canvas mode',
  )
  const binary = resolve(root, 'ios/build/Build/Products/Release-iphonesimulator/HozoShowcase.app')
  assert.ok(statSync(resolve(binary, 'main.jsbundle')).size > 0, 'standalone JS bundle is missing')
  const recognizer = resolve(output, 'recognize-text')
  run('xcrun', ['swiftc', resolve(root, 'scripts/recognize-text.swift'), '-o', recognizer], 120_000)
  const discovery = discoverIosDevices(run)
  const { devices } = discovery
  evidence.deviceDiscoveryMs = discovery.elapsedMs
  // Resolve once, and use the exact UDID for boot, install, input and screenshots.
  // Duplicate device names across installed iOS runtimes must not switch targets.
  const device = selectIosSimulator(devices, {
    udid: process.env.IOS_UDID,
    name: process.env.IOS_DEVICE,
  })
  udid = device.udid
  evidence.simulator = device
  const preparation = resolve(output, 'simulator-preparation.json')
  if (existsSync(preparation)) {
    evidence.simulatorPreparation = JSON.parse(readFileSync(preparation, 'utf8'))
    assert.equal(evidence.simulatorPreparation.device.udid, udid, 'prepared a different simulator')
  }
  if (device.state === 'Shutdown') simctl('boot', udid)
  evidence.boot = {}
  waitForIosBoot(udid, run, evidence.boot)
  // A fresh hosted simulator may still be preparing its installation service
  // after SpringBoard reports booted. Give installation its own bounded budget,
  // without retrying interactions or weakening their assertions.
  run('xcrun', ['simctl', 'install', udid, binary], 120_000)
  // Discovery and companion startup are tool setup, not an app interaction.
  // A cold CoreSimulator framework load can exceed the UI command deadline.
  evidence.inputConnection = connectIosInput(udid, run)
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
  if (evidence.diagnostic && evidence.scenario === 'full') {
    launch('com.apple.Preferences')
    await tap(label('General'), 'Settings control: General')
    await waitFor(label('About'), 'Settings control navigates to General')
    screenshot('00-settings-control')
    evidence.settingsControl = { passed: true, action: 'General opens About row' }
  }
  // The cold simulator's launch service can also lag behind bootstatus.
  // Keep one bounded launch attempt, separate from the UI-readiness budget.
  launch(app)
  // Establish the reader against the app's own ready window before openurl
  // introduces an OS confirmation. Launch returning is not UI readiness.
  await waitFor((node) => node.AXUniqueId === 'mobile-menu-button', 'initial Storybook window')
  if (evidence.scenario === 'gl-control') {
    await story('diagnostics-expo-gl--color-flip', 'Raw Expo GL surface')
    await waitFor(label('Raw frame: red'), 'raw red frame submitted')
    const surface = await waitFor(label('Raw Expo GL surface'), 'raw GL surface')
    const red = await waitForImage(
      () => canvasImage('gl-control-red', surface),
      (image) =>
        image.pixels.filter(([r, g, b]) => r > 200 && g < 40 && b < 40).length /
          image.pixels.length >
        0.99,
      'raw red pixels presented',
    )
    await tap(label('Draw blue'), 'raw GL blue frame')
    await waitFor(label('Raw frame: blue'), 'raw blue frame submitted')
    const blue = await waitForImage(
      () => canvasImage('gl-control-blue', surface),
      (image) =>
        image.pixels.filter(([r, g, b]) => b > 200 && g < 40 && r < 40).length /
          image.pixels.length >
        0.99,
      'raw blue pixels presented',
    )
    record('direct Expo GL clear reaches screen (diagnostic control only)', {
      changedFraction: changedFraction(red, blue),
    })
  } else {
    if (evidence.scenario === 'full') {
      // Storybook already cold-starts on Buttons. Sending that same deep link
      // can accept the old screen before a delayed OS confirmation appears.
      // Exercise the real initial screen without introducing a pending route.
      await waitFor(label('Add one'), 'initial Buttons story')
      await waitFor(label('Pressed 0 times'), 'initial counter')
      await tap(label('Add one'), 'counter button')
      await waitFor(label('Pressed 1 times'), 'incremented counter')
      screenshot('01-counter')
      await tap(label('Reset'), 'reset button')
      await waitFor(label('Pressed 0 times'), 'reset counter')
      record('counter increments and resets')

      const menu = await tap((node) => node.AXUniqueId === 'mobile-menu-button', 'Storybook menu')
      // idb's AX readers omit/stall on this third-party animated portal. Read its
      // visible text instead, with measured boxes, not magic coordinates. All Hozo
      // controls below still use AX. This is not a sidebar accessibility claim.
      const screen = parseIosNodes(latestTree).find((node) => node.type === 'Application')
      assert.ok(screen, 'missing screen bounds for visual selection')
      const selection = {
        previousStory: menu.AXLabel,
        expectedStory: 'Primitives/Shared showcase/Typography',
      }
      evidence.storySelector = selection
      let sample = 0
      await selectStableIosText('Typography', screen.rect, {
        observation: selection,
        readBoxes: () => {
          const name = `02-story-selector-${++sample}`
          screenshot(name, false)
          const boxes = JSON.parse(run(recognizer, [resolve(output, `${name}.png`)]).toString())
          writeFileSync(resolve(output, `${name}-ocr.json`), JSON.stringify(boxes, null, 2))
          return boxes
        },
        tapControl: (node) => idb('ui', 'tap', ...centre(node).map(String)),
      })
      // Route confirmation and rendered content share the existing 60s UI
      // budget. Extra observations must not give a wrong selection more time.
      const selectionDeadline = Date.now() + 60_000
      const selectionBudget = () => {
        const remaining = selectionDeadline - Date.now()
        assert.ok(remaining > 0, 'Timed out: Typography story selection')
        return remaining
      }
      const selected = await waitForIosStorySelection(
        selection.previousStory,
        selection.expectedStory,
        {
          readNodes: () => {
            const tree = nodes()
            selection.selectedStory = tree.find(
              (node) => node.AXUniqueId === 'mobile-menu-button',
            )?.AXLabel
            return tree
          },
          observation: evidence,
          timeout: selectionBudget(),
        },
      )
      selection.selectedStory = selected.AXLabel
      selection.selectionConfirmedAt = Date.now()
      const backdrop = await waitFor(
        label('Bottom sheet backdrop'),
        'Storybook selector backdrop',
        selectionBudget(),
      )
      const [left, top, right, bottom] = backdrop.rect
      // The persistent drawer covers the bottom 75%; tap the exposed backdrop.
      idb(
        'ui',
        'tap',
        String(Math.floor((left + right) / 2)),
        String(Math.floor(top + (bottom - top) / 10)),
      )
      await waitFor(label('日本語の表示'), 'Typography story rendered', selectionBudget())
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
      const nameField = (node) => label('Display name')(node) && /TextField/.test(node.type)
      await tap(nameField, 'name input')
      await waitFor(
        (node) => nameField(node) && node.traits?.includes('IsEditing'),
        'name input is editing',
      )
      evidence.formInput = {}
      await enterIosText('Hozo', {
        send: (character) => idb('ui', 'text', character),
        waitForValue: (value) =>
          waitFor(
            (node) => nameField(node) && node.AXValue === value,
            `name input contains ${JSON.stringify(value)}`,
          ),
        observation: evidence.formInput,
      })
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
    }

    const canvasRequestedAt = Date.now()
    await story(
      evidence.canvasMode === 'continuous'
        ? 'three-kumimono--assembly-continuous'
        : evidence.canvasMode === 'instant'
          ? 'three-kumimono--assembly-instant'
          : evidence.canvasMode === 'synchronized'
            ? 'three-kumimono--assembly-synchronized'
            : evidence.canvasMode === 'paced'
              ? 'three-kumimono--assembly-paced'
              : 'three-kumimono--assembly',
      '組物: timber bracket assembly',
    )
    const canvas = await assembly('assembled')
    const assembledFrame = await waitForIosSceneImage(
      () => canvasImage('10-assembled', canvas),
      (image) => image.colours >= 40,
      'assembled first frame',
    )
    const assembled = assembledFrame.image
    assert.ok(assembled.colours >= 40, `GL surface appears blank: ${assembled.colours} colours`)
    evidence.canvasObservation = {
      assembledColours: assembled.colours,
      firstFrameWaitMs: assembledFrame.presentedAfterMs,
      firstFrameEndToEndMs: Date.now() - canvasRequestedAt,
    }
    const disassemblyRequestedAt = Date.now()
    await tap(label('分解'), 'disassemble')
    await assembly('disassembled')
    evidence.canvasObservation.disassemblyStateObservedMs = Date.now() - disassemblyRequestedAt
    const acceptDisassembled = (image) => {
      const difference = changedFraction(assembled, image)
      evidence.canvasObservation.disassembledColours = image.colours
      evidence.canvasObservation.disassembledChangedFraction = difference
      return image.colours >= 40 && difference >= 0.01
    }
    let disassembled
    try {
      const frame = await waitForIosSceneImage(
        () => canvasImage('11-disassembled', canvas),
        acceptDisassembled,
        'disassembled frame',
      )
      disassembled = frame.image
      evidence.canvasObservation.disassemblyWaitMs = frame.presentedAfterMs
      evidence.canvasObservation.disassemblyEndToEndMs = Date.now() - disassemblyRequestedAt
    } catch (error) {
      if (evidence.diagnostic && error instanceof PresentedImageTimeout) {
        // Keep the failed primary gate intact, and perform ONLY read-only captures.
        // No GL calls, invalidation, story remount, or repeated input can flush
        // the queue and confound backlog-vs-freeze diagnosis. This adds no check.
        evidence.lateCanvasObservation = await observeLateImage(
          () => {
            const image = canvasImage('11-late-disassembled', canvas)
            return { colours: image.colours, changedFraction: changedFraction(assembled, image) }
          },
          (image) => image.colours >= 40 && image.changedFraction >= 0.01,
        )
      }
      throw error
    }
    const difference = changedFraction(assembled, disassembled)
    assert.ok(difference >= 0.01, `GL image did not change: ${difference}`)
    const reassemblyRequestedAt = Date.now()
    await tap(label('組み立て'), 'assemble')
    await assembly('assembled')
    evidence.canvasObservation.reassemblyStateObservedMs = Date.now() - reassemblyRequestedAt
    const reassembledFrame = await waitForIosSceneImage(
      () => canvasImage('12-reassembled', canvas),
      (image) => image.colours >= 40 && changedFraction(disassembled, image) >= 0.01,
      'reassembled frame',
    )
    const reassembled = reassembledFrame.image
    evidence.canvasObservation.reassemblyWaitMs = reassembledFrame.presentedAfterMs
    evidence.canvasObservation.reassemblyEndToEndMs = Date.now() - reassemblyRequestedAt
    const reverseDifference = changedFraction(disassembled, reassembled)
    assert.ok(reverseDifference >= 0.01, `reverse GL image did not change: ${reverseDifference}`)
    record('Expo GL renders and animates the actual scene', {
      colours: assembled.colours,
      changedFraction: difference,
      reverseChangedFraction: reverseDifference,
      firstFrameWaitMs: assembledFrame.presentedAfterMs,
      disassemblyWaitMs: evidence.canvasObservation.disassemblyWaitMs,
      reassemblyWaitMs: reassembledFrame.presentedAfterMs,
    })

    await story('primitives-shared-showcase--buttons', 'Add one')
    await tap(label('Add one'), 'counter after GL unmount')
    await waitFor(label('Pressed 1 times'), 'counter after GL unmount works')
    screenshot('13-after-gpu')
    record('switching away from GPU story keeps the app usable')
  }
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
