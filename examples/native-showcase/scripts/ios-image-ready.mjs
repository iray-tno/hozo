import { waitForImage } from './image-ready.mjs'

// The hosted iOS simulator delivered the unmodified 80-frame scene more than
// three minutes after JS completion. This is a functional presentation budget,
// not a performance threshold, fixed sleep, or weaker pixel acceptance rule.
export const IOS_SCENE_IMAGE_TIMEOUT = 300_000

export async function waitForIosSceneImage(read, accept, description, options = {}) {
  const now = options.now ?? Date.now
  const started = now()
  const image = await waitForImage(read, accept, description, {
    timeout: IOS_SCENE_IMAGE_TIMEOUT,
    ...options,
    now,
  })
  return { image, presentedAfterMs: now() - started }
}
