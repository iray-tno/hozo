import { setTimeout as pause } from 'node:timers/promises'

export class PresentedImageTimeout extends Error {}

// Wait for presented pixels, not a JS label or a fixed delay. This retries only
// read-only captures; it cannot re-mount a story or re-run a failed interaction.
export async function waitForImage(
  read,
  accept,
  description,
  { timeout = 15_000, interval = 500, now = Date.now, sleep = pause } = {},
) {
  const deadline = now() + timeout
  do {
    const image = await read()
    if (accept(image)) return image
    if (now() >= deadline) break
    await sleep(interval)
  } while (now() <= deadline)
  throw new PresentedImageTimeout(`Timed out waiting for presented Canvas pixels: ${description}`)
}

// Diagnostic only, called AFTER a quality-gate timeout. Returns observations,
// never a passing test result. The caller must rethrow its original failure.
export async function observeLateImage(read, accept, options = {}) {
  const now = options.now ?? Date.now
  const started = now()
  let latest
  let captures = 0
  try {
    const observation = await waitForImage(
      async () => {
        captures++
        latest = await read()
        return latest
      },
      accept,
      'post-failure diagnostic only',
      { timeout: 300_000, interval: 2_000, ...options },
    )
    return { observed: true, elapsedMs: now() - started, captures, observation }
  } catch (error) {
    return {
      observed: false,
      elapsedMs: now() - started,
      captures,
      observation: latest,
      error: String(error),
    }
  }
}
