import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { centre } from './device-evidence.mjs'
import { visualTextControl } from './ios-evidence.mjs'
import { waitForIosControl } from './ios-ui-wait.mjs'

// Visible text is not proof that an animated drawer has settled. In the failed
// run, Typography's old y=724 coincided with Form in the settled drawer; the
// captured drawer was 26pt lower than the successful comparison sample.
// Observe geometry before input; never retry a possibly delivered HID action.
export async function selectStableIosText(
  text,
  screenRect,
  { readBoxes, tapControl, observation, timeout = 60_000, now = Date.now, sleep = pause },
) {
  const deadline = now() + timeout
  observation.samples = []
  let anchor
  let stableSince
  let stableSamples = 0
  do {
    const capturedAt = now()
    const control = visualTextControl(readBoxes(), text, screenRect)
    const recognizedAt = now()
    if (!control) {
      anchor = undefined
      stableSamples = 0
    } else if (
      !anchor ||
      control.rect.some((coordinate, index) => Math.abs(coordinate - anchor.rect[index]) > 2)
    ) {
      anchor = control
      stableSince = capturedAt
      stableSamples = 1
    } else {
      stableSamples++
    }
    observation.samples.push({ capturedAt, recognizedAt, rect: control?.rect, stableSamples })
    // Compare to the start of the stable interval, not just the previous sample:
    // slow cumulative movement must not be mistaken for OCR rounding noise.
    if (
      control &&
      stableSamples >= 3 &&
      capturedAt - stableSince >= 1_000 &&
      recognizedAt < deadline
    ) {
      observation.tapPoint = centre(control)
      observation.tapStartedAt = now()
      tapControl(control)
      observation.tapCompletedAt = now()
      return control
    }
    if (now() >= deadline) break
    await sleep(Math.min(500, deadline - now()))
  } while (now() < deadline)
  throw new Error(`Timed out: stable visible text ${text}`)
}

export async function waitForIosStorySelection(previousStory, expectedStory, options) {
  assert.equal(typeof previousStory, 'string', 'missing previous Storybook selection')
  assert.notEqual(previousStory, expectedStory, 'selector must switch to a different story')
  return waitForIosControl(
    (node) => {
      if (node.AXUniqueId !== 'mobile-menu-button') return false
      const selected = node.AXLabel
      if (!selected || selected === previousStory) return false
      assert.equal(selected, expectedStory, `Storybook selected the wrong story: ${selected}`)
      return true
    },
    `Storybook selection ${expectedStory}`,
    options,
  )
}
