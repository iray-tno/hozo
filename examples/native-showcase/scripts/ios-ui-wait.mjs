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
  let anchor
  let stableSince
  let confirmationObservation
  do {
    let tree
    try {
      tree = readNodes()
    } catch (error) {
      lastError = error
      anchor = undefined
    }
    if (tree) {
      const confirmation = openShowcaseConfirmation(tree)
      if (confirmation) {
        if (allowOpenConfirmation && !confirmed) {
          confirmationObservation ??= { description, samples: [] }
          observation.routeConfirmations ??= []
          if (!observation.routeConfirmations.includes(confirmationObservation)) {
            observation.routeConfirmations.push(confirmationObservation)
          }
          // A visible AX control need not have finished the OS alert animation.
          // Observe a fresh, stable position before the one permitted HID tap;
          // never interpret a returned tap command as proof of dismissal.
          const sampledAt = now()
          if (
            !anchor ||
            confirmation.rect.some((value, index) => Math.abs(value - anchor[index]) > 2)
          ) {
            anchor = [...confirmation.rect]
            stableSince = sampledAt
          }
          confirmationObservation.samples.push({ sampledAt, rect: [...confirmation.rect] })
          if (sampledAt - stableSince >= 1_000 && sampledAt < deadline) {
            confirmationObservation.tapStartedAt = now()
            confirmationObservation.tapRect = [...confirmation.rect]
            // Let input errors propagate: do not retry a potentially delivered tap.
            tapConfirmation(confirmation)
            confirmationObservation.tapCompletedAt = now()
            confirmed = true
            observation.openConfirmations = (observation.openConfirmations ?? 0) + 1
            // Preserve the existing, once-only post-confirmation route budget.
            deadline = now() + timeout
          }
        }
        // The snapshot predates the tap. Even if it includes the requested
        // control, discard it and wait for a fresh, unobstructed app tree.
      } else {
        anchor = undefined
        if (confirmed && confirmationObservation.dismissedAt === undefined) {
          confirmationObservation.dismissedAt = now()
        }
        const found = tree.find(predicate)
        if (found) return found
      }
    }
    await sleep(1_000)
  } while (now() < deadline)
  throw new Error(`Timed out: ${description}`, { cause: lastError })
}
