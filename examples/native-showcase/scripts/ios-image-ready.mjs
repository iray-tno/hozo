import { PresentedImageTimeout, waitForImage } from './image-ready.mjs'

// The hosted iOS simulator delivered the unmodified 80-frame scene more than
// three minutes after JS completion. This is a functional presentation budget,
// not a performance threshold, fixed sleep, or weaker pixel acceptance rule.
export const IOS_SCENE_IMAGE_TIMEOUT = 300_000

const TIMED_OUT = Symbol('capture timed out')

// On the same simulator, `simctl io screenshot` itself has stalled past its
// 30 s limit while the scene was still presenting (#2152). A capture that times
// out is counted and treated as a frame not yet accepted, within the same
// budget. Only the read-only capture repeats, never an input; any other capture
// error still fails at once.
const isCaptureTimeout = (error) => error?.code === 'ETIMEDOUT'

export async function waitForIosSceneImage(read, accept, description, options = {}) {
  const now = options.now ?? Date.now
  const started = now()
  let captureTimeouts = 0
  try {
    const image = await waitForImage(
      async () => {
        try {
          return await read()
        } catch (error) {
          if (!isCaptureTimeout(error)) throw error
          captureTimeouts++
          return TIMED_OUT
        }
      },
      (candidate) => candidate !== TIMED_OUT && accept(candidate),
      description,
      {
        timeout: IOS_SCENE_IMAGE_TIMEOUT,
        ...options,
        now,
      },
    )
    return { image, presentedAfterMs: now() - started, captureTimeouts }
  } catch (error) {
    if (error instanceof PresentedImageTimeout && captureTimeouts > 0) {
      error.message += ` (${captureTimeouts} capture(s) timed out)`
    }
    throw error
  }
}
