import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { centre } from './device-evidence.mjs'
import { visualTextControl } from './ios-evidence.mjs'
import { selectStableIosText, waitForIosStorySelection } from './ios-story-selector.mjs'

const screen = [0, 0, 402, 874]
const typography = (y) => ({
  text: '• Typography',
  confidence: 1,
  x: 56 / 402,
  y: 1 - (y + 7) / 874,
  width: 94 / 402,
  height: 14 / 874,
})

function schedule(frames, extra = {}) {
  let time = 0
  let reads = 0
  const taps = []
  const observation = {}
  return {
    reads: () => reads,
    elapsed: () => time,
    taps,
    observation,
    options: {
      readBoxes: () => frames[Math.min(reads++, frames.length - 1)],
      tapControl: (control) => taps.push(centre(control)),
      observation,
      now: () => time,
      sleep: async (ms) => {
        time += ms
      },
      ...extra,
    },
  }
}

test('the real smoke waits for stable OCR and verifies the route before dismissing the drawer', () => {
  const driver = readFileSync(new URL('./ios-smoke.mjs', import.meta.url), 'utf8')
  const selection = driver.slice(
    driver.indexOf('      const menu = await tap('),
    driver.indexOf("      screenshot('03-typography')"),
  )
  assert.match(selection, /await selectStableIosText\('Typography', screen.rect,/)
  assert.match(selection, /await waitForIosStorySelection\(/)
  assert.ok(selection.indexOf('waitForIosStorySelection(') < selection.indexOf('const backdrop ='))
  assert.match(selection, /02-story-selector-\$\{\+\+sample\}/)
  assert.match(selection, /const selectionDeadline = Date.now\(\) \+ 60_000/)
  assert.equal(selection.match(/selectionBudget\(\)/g)?.length, 3)
  assert.doesNotMatch(selection, /\bstory\(/)
})

test('the observed 26pt drawer shift cannot tap Form using the old Typography coordinate', async () => {
  const old = visualTextControl([typography(724)], 'Typography', screen)
  assert.deepEqual(centre(old), [103, 724])
  // In the settled drawer Form occupied y=719..733 in the failed run's
  // comparison sample. The former first-visible selector would hit that row.
  assert.ok(centre(old)[1] >= 719 && centre(old)[1] <= 733)
  const run = schedule([[typography(724)], [typography(698)]])
  const result = await selectStableIosText('Typography', screen, run.options)
  assert.deepEqual(centre(result), [103, 698])
  assert.deepEqual(run.taps, [[103, 698]])
  assert.equal(run.reads(), 4)
  assert.deepEqual(
    run.observation.samples.map((sample) => sample.stableSamples),
    [1, 1, 2, 3],
  )
  assert.equal(run.observation.tapStartedAt, 1_500)
  assert.equal(run.observation.tapCompletedAt, 1_500)
})

test('an already settled target still requires three observations spanning at least 1s', async () => {
  const run = schedule([[typography(698)]])
  await selectStableIosText('Typography', screen, run.options)
  assert.equal(run.reads(), 3)
  assert.equal(run.elapsed(), 1_000)
  assert.equal(run.taps.length, 1)
})

test('small OCR rounding variation is tolerated but the latest measured box supplies the tap', async () => {
  const run = schedule([[typography(698)], [typography(698.5)], [typography(699)]])
  await selectStableIosText('Typography', screen, run.options)
  assert.equal(run.reads(), 3)
  assert.deepEqual(run.taps, [[103, 699]])
})

test('a missing target resets stability and its later fresh coordinates are used', async () => {
  const run = schedule([[typography(724)], [typography(724)], [], [typography(698)]])
  await selectStableIosText('Typography', screen, run.options)
  assert.equal(run.reads(), 6)
  assert.deepEqual(run.taps, [[103, 698]])
  assert.equal(run.observation.samples[2].stableSamples, 0)
})

test('cumulative movement is compared with the anchor, not only adjacent OCR boxes', async () => {
  const run = schedule(
    Array.from({ length: 20 }, (_, index) => [typography(724 - index * 1.1)]),
    {
      timeout: 3_000,
    },
  )
  await assert.rejects(selectStableIosText('Typography', screen, run.options), /Timed out/)
  assert.equal(run.elapsed(), 3_000)
  assert.equal(run.taps.length, 0)
})

test('absent targets and continuously moving drawers fail within the original budget without input', async () => {
  for (const frames of [[[]], [[typography(724)], [typography(698)], [typography(724)]]]) {
    const run = schedule(frames, { timeout: 1_500 })
    await assert.rejects(selectStableIosText('Typography', screen, run.options), /Timed out/)
    assert.equal(run.elapsed(), 1_500)
    assert.equal(run.taps.length, 0)
    assert.equal(run.observation.tapStartedAt, undefined)
  }
})

test('OCR recognition time consumes the budget; a late stable sample cannot trigger input', async () => {
  let time = 0
  let reads = 0
  const run = schedule([], {
    timeout: 3_000,
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
    readBoxes: () => {
      reads++
      time += 900
      return [typography(698)]
    },
  })
  await assert.rejects(selectStableIosText('Typography', screen, run.options), /Timed out/)
  assert.equal(reads, 3)
  assert.equal(run.taps.length, 0)
  assert.equal(run.observation.samples.at(-1).recognizedAt, 3_700)
})

test('ambiguous OCR fails immediately rather than guessing or tapping', async () => {
  const run = schedule([[typography(698), typography(724)]])
  await assert.rejects(selectStableIosText('Typography', screen, run.options), /ambiguous/)
  assert.equal(run.reads(), 1)
  assert.equal(run.taps.length, 0)
})

test('an ambiguous HID failure propagates after exactly one attempt with attempted coordinates retained', async () => {
  const failure = new Error('HID timeout')
  let taps = 0
  const run = schedule([[typography(698)]], {
    tapControl: () => {
      taps++
      throw failure
    },
  })
  await assert.rejects(
    selectStableIosText('Typography', screen, run.options),
    (error) => error === failure,
  )
  assert.equal(taps, 1)
  assert.deepEqual(run.observation.tapPoint, [103, 698])
  assert.equal(run.observation.tapStartedAt, 1_000)
  assert.equal(run.observation.tapCompletedAt, undefined)
})

const previousStory = 'Primitives/Shared showcase/Buttons'
const expectedStory = 'Primitives/Shared showcase/Typography'
const menu = (story) => ({ AXUniqueId: 'mobile-menu-button', AXLabel: story })

test('route verification waits for the actual new breadcrumb, not the previous selection', async () => {
  let reads = 0
  const run = schedule([])
  const selected = await waitForIosStorySelection(previousStory, expectedStory, {
    ...run.options,
    readNodes: () => [menu(reads++ === 0 ? previousStory : expectedStory)],
  })
  assert.equal(selected.AXLabel, expectedStory)
  assert.equal(reads, 2)
  assert.equal(run.taps.length, 0)
})

test('a wrong story fails immediately, without trying to select again or disguising it as a rendering timeout', async () => {
  let reads = 0
  const run = schedule([])
  await assert.rejects(
    waitForIosStorySelection(previousStory, expectedStory, {
      ...run.options,
      readNodes: () => {
        reads++
        return [menu('Primitives/Shared showcase/Form')]
      },
    }),
    /Storybook selected the wrong story: Primitives\/Shared showcase\/Form/,
  )
  assert.equal(reads, 1)
  assert.equal(run.taps.length, 0)
})

test('unchanged selection times out without route input or a larger budget', async () => {
  const run = schedule([], { timeout: 2_000 })
  await assert.rejects(
    waitForIosStorySelection(previousStory, expectedStory, {
      ...run.options,
      readNodes: () => [menu(previousStory)],
    }),
    /Timed out: Storybook selection/,
  )
  assert.equal(run.elapsed(), 2_000)
  assert.equal(run.taps.length, 0)
})
