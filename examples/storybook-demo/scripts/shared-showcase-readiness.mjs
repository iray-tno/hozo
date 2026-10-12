export const INTERACTION_TIMEOUT = 60_000

export const EXPECTED_SCENARIOS = [
  'preferences and disabled state',
  'tabs, keyboard roving and disabled selection',
  'dialog keyboard activation, cancel, confirmation and restored focus',
  'five shared SVG scenes with reversible filter references',
  'shared Video controls, local MP4 and lifetime cleanup',
  'shared timed captions follow observations, language selection, Off and source removal',
  'shared Audio gain, independent mute, paused updates and source remount',
  'shared poster initial cover, explicit seek reveal and source remount',
  'popover focus moves into the panel and back',
]

// Serialized into the browser by the driver: keep this function self-contained.
// Tests use injected clocks/scheduling, not another copy of the waiting rule.
export function createReadiness(
  frame,
  {
    deadline,
    onStage = () => {},
    now = Date.now,
    delay = (ms = 16) => new Promise((resolve) => setTimeout(resolve, ms)),
    afterRender = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  },
) {
  function find(selector, name) {
    return [...(frame.contentDocument?.querySelectorAll(selector) ?? [])].find(
      (node) => (node.getAttribute('aria-label') || node.textContent.trim()) === name,
    )
  }
  async function wait(predicate, description) {
    onStage(description)
    for (;;) {
      if (now() >= deadline) throw new Error(`Timed out waiting for ${description}`)
      const observed = predicate()
      if (observed) return observed
      await delay()
    }
  }
  function storyReady(id, predicate) {
    const doc = frame.contentDocument
    // A previous frame's similarly named control must not satisfy a new story.
    return (
      doc &&
      new URL(doc.URL).searchParams.get('id') === id &&
      doc.readyState === 'complete' &&
      predicate()
    )
  }
  function metadataReady(media) {
    if (media?.error) throw new Error(`Media failed: ${media.error.message || media.error.code}`)
    // A paused metadata-preloaded movie may never emit canplay/loadeddata.
    // Clock/caption readiness is not decoder or frame evidence.
    return !!media && !!media.currentSrc && media.readyState >= 1
  }
  function coverReady(image) {
    return !!image && image.complete && image.naturalWidth === 320
  }
  async function clickEnabled(name) {
    // Metadata can arrive before seekable ranges and the control's rendered
    // enabled state. A click on a disabled button is silently discarded.
    const control = await wait(() => {
      const node = find('button', name)
      return node && !node.matches(':disabled') && node.getAttribute('aria-disabled') !== 'true'
        ? node
        : null
    }, `enabled control ${name}`)
    control.click()
  }
  async function settle() {
    await afterRender()
    // An unchanged state has no positive completion signal. Retain the old
    // 250ms observation horizon for inert/disabled/no-autoplay assertions,
    // without using that delay as proof that a story or media is ready.
    await delay(250)
  }
  return { find, wait, storyReady, metadataReady, coverReady, clickEnabled, settle }
}

export function validateCompletion(result, pageErrors = []) {
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`)
  if (result?.state !== 'passed' || result.error)
    throw new Error(result?.error ?? 'browser did not complete interactions')
  if (
    !Array.isArray(result.passed) ||
    result.passed.length !== EXPECTED_SCENARIOS.length ||
    result.passed.some((name, index) => name !== EXPECTED_SCENARIOS[index])
  )
    throw new Error('browser did not complete all nine distinct scenarios in order')
  return result
}
