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
    failed.push({
      ...describe(value),
      error: value.failure()?.errorText ?? 'unknown request failure',
    })
    pending.delete(value)
  }
  const response = (value) => {
    if (value.status() >= 400)
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
