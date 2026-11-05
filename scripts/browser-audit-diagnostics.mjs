// Subscribe before navigation: a console resource error alone loses the URL.
// These observations explain a verdict; they never replace an audit's checks.
export function observePageRequests(page) {
  const pending = new Map()
  const failed = []
  const httpErrors = []
  const describe = (request) => ({
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
  })
  const request = (value) => pending.set(value, { ...describe(value), started: performance.now() })
  const finished = (value) => pending.delete(value)
  const failure = (value) => {
    // A reused page can finish cancelling the previous navigation after a
    // new observer starts. Only requests this observer saw belong to its case.
    if (!pending.has(value)) return
    failed.push({
      ...describe(value),
      error: value.failure()?.errorText ?? 'unknown request failure',
    })
    pending.delete(value)
  }
  const response = (value) => {
    if (pending.has(value.request()) && value.status() >= 400)
      httpErrors.push({ ...describe(value.request()), status: value.status() })
  }
  page.on('request', request)
  page.on('requestfinished', finished)
  page.on('requestfailed', failure)
  page.on('response', response)
  return {
    snapshot() {
      return {
        pending: [...pending.values()].map(({ started, ...value }) => ({
          ...value,
          elapsedMs: Math.round(performance.now() - started),
        })),
        failed: failed.map((value) => ({ ...value })),
        httpErrors: httpErrors.map((value) => ({ ...value })),
      }
    },
    stop() {
      page.off('request', request)
      page.off('requestfinished', finished)
      page.off('requestfailed', failure)
      page.off('response', response)
    },
  }
}

// Failure-only capture. An unresponsive renderer must not hold up reporting;
// missing evidence stays explicitly unavailable rather than looking empty.
export async function captureAuditState(page) {
  let timer
  try {
    return await Promise.race([
      page.evaluate(() => {
        const root = document.getElementById('storybook-root')
        const animations = document.getAnimations()
        const preparation = window.__hozoAuditPreparation
        return {
          url: location.href,
          readyState: document.readyState,
          visibility: document.visibilityState,
          phase: preparation?.failurePhase ?? preparation?.phase ?? null,
          phaseAtCapture: preparation?.phase ?? null,
          stateAtFailure: preparation?.failureState ?? null,
          captureDelayMs:
            preparation?.failedAt == null
              ? null
              : Math.round(performance.now() - preparation.failedAt),
          rootPresent: Boolean(root),
          rootChildren: root?.childElementCount ?? null,
          fonts: document.fonts.status,
          stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
            url: link.href,
            loaded: Boolean(link.sheet),
          })),
          animationCount: animations.length,
          animationsTruncated: Math.max(0, animations.length - 50),
          animations: animations.slice(0, 50).map((animation) => {
            const timing = animation.effect?.getComputedTiming()
            const target = animation.effect?.target
            return {
              playState: animation.playState,
              pending: animation.pending,
              currentTime: animation.currentTime == null ? null : String(animation.currentTime),
              endTime: timing?.endTime == null ? null : String(timing.endTime),
              target: target ? { tag: target.tagName, id: target.id } : null,
            }
          }),
        }
      }),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ captureError: 'browser state capture exceeded 1000ms' }),
          1000,
        )
      }),
    ])
  } catch (error) {
    return { captureError: error.message }
  } finally {
    clearTimeout(timer)
  }
}
