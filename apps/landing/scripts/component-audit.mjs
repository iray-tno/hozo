import assert from 'node:assert/strict'
import { observePageRequests } from '../../../scripts/browser-audit-diagnostics.mjs'

export async function auditComponentPage(page, { name, url, exercise }) {
  // The audited build is a production build, so it carries the site's
  // analytics tags. A component audit judges the components, not the network
  // to a third party: its requests are answered empty, here, rather than
  // sent. Sending them recorded a visit per audited page, and one dropped
  // POST to Google Analytics failed the audit on radio-group (#1872).
  // Answered rather than aborted, because an aborted script is itself a
  // console error, and those fail the audit too.
  const origin = new URL(url).origin
  const offline = (route) =>
    new URL(route.request().url()).origin === origin
      ? route.fallback()
      : route.fulfill({ status: 204 })
  await page.route('**/*', offline)
  const requests = observePageRequests(page)
  const errors = []
  const onError = (error) => errors.push(String(error))
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(message.text())
  }
  page.on('pageerror', onError)
  page.on('console', onConsole)
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    // The island is `display: contents`, and Playwright judges its
    // visibility by its first child, which for some previews is the
    // `<style>` of the View base. Scroll to the first child that renders.
    await page.locator('astro-island > :not(style)').first().scrollIntoViewIfNeeded()
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))
    await exercise(page)
    assert.deepEqual(errors, [], `${name}: the page logged errors`)
    return { name, url, status: 'passed' }
  } catch (error) {
    // Snapshot before closing the page; close-induced cancellations describe
    // cleanup rather than the failure that stopped the audit.
    const failure = error instanceof Error ? error : new Error(String(error), { cause: error })
    // An exercise can attach what its page looked like when it gave up
    // (`failure.diagnostics.state`); it is kept beside the page's own.
    failure.diagnostics = {
      ...failure.diagnostics,
      name,
      url,
      consoleErrors: [...errors],
      requests: requests.snapshot(),
    }
    throw failure
  } finally {
    requests.stop()
    page.off('pageerror', onError)
    page.off('console', onConsole)
    // A crashed page cannot unroute; that must not replace the verdict.
    await page.unroute('**/*', offline).catch(() => {})
  }
}
