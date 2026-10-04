import { setTimeout as pause } from 'node:timers/promises'
import { openShowcaseConfirmation } from './ios-evidence.mjs'

// Read-only AX polling may be repeated; a possibly delivered HID action may not.
// A matching control behind an OS confirmation is not an actionable result.
export async function waitForIosControl(
  predicate,
  description,
  {
    readNodes,
    tapConfirmation,
    observation,
    timeout = 60_000,
    allowOpenConfirmation = false,
    now = Date.now,
    sleep = pause,
  },
) {
  let deadline = now() + timeout
  let lastError
  let confirmed = false
  do {
    let tree
    try {
      tree = readNodes()
    } catch (error) {
      lastError = error
    }
    if (tree) {
      const confirmation = openShowcaseConfirmation(tree)
      if (confirmation) {
        if (allowOpenConfirmation && !confirmed) {
          // Let input errors propagate: do not retry a potentially delivered tap.
          tapConfirmation(confirmation)
          confirmed = true
          observation.openConfirmations = (observation.openConfirmations ?? 0) + 1
          // Preserve the existing, once-only post-confirmation route budget.
          deadline = now() + timeout
        }
        // The snapshot predates the tap. Even if it includes the requested
        // control, discard it and wait for a fresh, unobstructed app tree.
      } else {
        const found = tree.find(predicate)
        if (found) return found
      }
    }
    await sleep(1_000)
  } while (now() < deadline)
  throw new Error(`Timed out: ${description}`, { cause: lastError })
}
