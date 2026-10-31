import assert from 'node:assert/strict'
import { observePageRequests } from '../../../scripts/browser-audit-diagnostics.mjs'

export async function auditComponentPage(page, { name, url, exercise }) {
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
    failure.diagnostics = { name, url, consoleErrors: [...errors], requests: requests.snapshot() }
    throw failure
  } finally {
    requests.stop()
    page.off('pageerror', onError)
    page.off('console', onConsole)
  }
}
