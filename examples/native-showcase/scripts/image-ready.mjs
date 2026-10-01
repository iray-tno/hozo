import { setTimeout as pause } from 'node:timers/promises'

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
  throw new Error(`Timed out waiting for presented Canvas pixels: ${description}`)
}
