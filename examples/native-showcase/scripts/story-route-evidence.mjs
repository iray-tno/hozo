// A returned OS command is not evidence that Storybook selected a story.
// Keep both phases, including the original failed attempt; never resend a
// possibly delivered route or turn a diagnostic observation into a pass.
export async function observeStoryRoute(
  { id, expected, url, dispatch, waitForExpected, now = Date.now },
  evidence,
) {
  const route = { id, expected, url, phase: 'delivery', passed: false }
  evidence.storyRoutes ??= []
  evidence.storyRoutes.push(route)
  const started = now()
  route.delivery = { startedAt: started, acknowledged: false }
  try {
    const response = await dispatch()
    route.delivery.acknowledged = true
    route.delivery.elapsedMs = now() - started
    route.delivery.response = response?.toString().trim() ?? ''
    route.phase = 'ui-ready'
    const uiStarted = now()
    route.ui = { startedAt: uiStarted, observed: false }
    await waitForExpected()
    route.ui.elapsedMs = now() - uiStarted
    route.ui.observed = true
    route.phase = 'ready'
    route.passed = true
    return route
  } catch (error) {
    // Preserve child-process output even without diagnostic mode. The route
    // URI is fixture data, not a credential; commands themselves are unchanged.
    route.error = {
      message: error.message ?? String(error),
      code: error.code,
      status: error.status,
      signal: error.signal,
      cause: error.cause?.message,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString(),
      blockingDialog: error.blockingDialog,
    }
    if (route.phase === 'delivery') route.delivery.elapsedMs = now() - started
    else route.ui.elapsedMs = now() - route.ui.startedAt
    throw error
  } finally {
    route.elapsedMs = now() - started
  }
}
