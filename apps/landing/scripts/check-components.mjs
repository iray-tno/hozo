// The /docs/components/ pages, in a real browser: each @hozo/ui preview
// hydrates and does what its page says when pressed or typed into.
//
// check-build only sees the server-rendered HTML, which looks the same
// whether the island works or not. The Input page is why this exists: its
// field rendered, and typing into it did nothing, because the compiler
// dropped the `onChangeText` inside @hozo/ui's prop spread (#1118).

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[2] ?? 'dist',
)
const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) throw new Error('Components: browser required in CI')
  console.log('Components: no browser found; skipped')
  process.exit(0)
}
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
}
const server = createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/hozo\/?/,
    '',
  )
  let file = path.resolve(dist, relative || 'index.html')
  if (existsSync(file) && !path.extname(file)) file = path.join(file, 'index.html')
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/hozo/docs/components`

const pages = {
  async button(page) {
    await page.getByRole('button', { name: 'Danger' }).click()
    await page.getByText('Last pressed: Danger').waitFor()
    assert.equal(
      await page.getByRole('button', { name: 'Disabled' }).isDisabled(),
      true,
      'button: the disabled one is not disabled',
    )
  },
  async input(page) {
    const field = page.getByRole('textbox', { name: 'Email' })
    await field.fill('not-an-email')
    assert.equal(await field.inputValue(), 'not-an-email', 'input: typing did not stick')
    assert.equal(await field.getAttribute('aria-invalid'), 'true', 'input: not marked invalid')
    await page.getByRole('alert').filter({ hasText: 'does not look like an email' }).waitFor()
    await field.fill('a@b.co')
    assert.notEqual(await field.getAttribute('aria-invalid'), 'true', 'input: still invalid')
  },
  async card(page) {
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor()
  },
  async dialog(page) {
    const opener = page.getByRole('button', { name: 'Delete project', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Delete the project' })
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(
      await opener.evaluate((element) => element === document.activeElement),
      true,
      'dialog: focus did not return to the button that opened it',
    )
  },
  async checkbox(page) {
    const all = page.getByRole('checkbox', { name: 'All meals' })
    assert.equal(await all.getAttribute('aria-checked'), 'mixed', 'checkbox: parent not mixed')
    await all.click()
    await page.getByText('Chosen: Breakfast, Lunch, Dinner').waitFor()
    await page.getByRole('checkbox', { name: 'Lunch' }).click()
    assert.equal(
      await all.getAttribute('aria-checked'),
      'mixed',
      'checkbox: parent not mixed again',
    )
  },
  async switch(page) {
    const emails = page.getByRole('switch', { name: 'Email notifications' })
    await emails.click()
    await page.getByText('Emails are off.').waitFor()
    assert.equal(await emails.getAttribute('aria-checked'), 'false', 'switch: still on')
  },
  async 'radio-group'(page) {
    const standard = page.getByRole('radio', { name: 'Standard, two days' })
    await standard.focus()
    await page.keyboard.press('ArrowDown')
    await page.getByText('Shipping: express').waitFor()
    // The disabled option is skipped: one more arrow wraps to the first.
    await page.keyboard.press('ArrowDown')
    await page.getByText('Shipping: standard').waitFor()
  },
  async 'segmented-control'(page) {
    await page.getByRole('radio', { name: 'Month' }).click()
    await page.getByText('Showing one month.').waitFor()
  },
  async slider(page) {
    const slider = page.getByRole('slider', { name: 'Volume' })
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await page.getByText('Volume: 41').waitFor()
    await page.keyboard.press('End')
    await page.getByText('Volume: 100').waitFor()
    assert.equal(await slider.getAttribute('aria-valuetext'), '100 percent', 'slider: value text')
  },
  async 'text-area'(page) {
    const field = page.getByRole('textbox', { name: 'Notes' })
    await field.fill('Ring twice')
    assert.equal(await field.inputValue(), 'Ring twice', 'text-area: typing did not stick')
    await page.getByText('150 of 160 characters left').waitFor()
  },
  async 'native-select'(page) {
    const select = page.getByRole('combobox', { name: 'Courier' })
    await select.selectOption('bike')
    assert.equal(await select.inputValue(), 'bike', 'native-select: choice did not stick')
  },
  async badge(page) {
    // Static, but hydrated all the same: the count is read by its label.
    await page
      .locator('.hozo-ui-example')
      .getByText('3 unread messages')
      .waitFor({ state: 'attached' })
  },
  async alert(page) {
    assert.equal(
      await page.getByRole('status').count(),
      0,
      'alert: announced before anything happened',
    )
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByRole('status').filter({ hasText: 'Draft saved.' }).waitFor()
  },
  async avatar(page) {
    await page.getByRole('img', { name: 'Grace Hopper, busy' }).waitFor()
  },
  async skeleton(page) {
    await page.getByRole('button', { name: 'Finish loading' }).click()
    await page
      .locator('.hozo-ui-example')
      .getByText('Ada Lovelace replied to your comment.')
      .waitFor()
  },
  async tabs(page) {
    const details = page.getByRole('tab', { name: 'Details' })
    await details.focus()
    // Manual activation: the arrow moves focus, and Enter shows the panel.
    await page.keyboard.press('ArrowRight')
    const shipping = page.getByRole('tab', { name: 'Shipping' })
    assert.equal(await shipping.evaluate((el) => el === document.activeElement), true)
    await page.keyboard.press('Enter')
    assert.equal(await shipping.getAttribute('aria-selected'), 'true', 'tabs: Enter did not select')
    await page.getByRole('tabpanel').filter({ hasText: 'Two days' }).waitFor()
  },
  async accordion(page) {
    const returns = page.getByRole('button', { name: 'Can I send it back?' })
    await returns.click()
    await page.locator('.hozo-ui-example').getByText('Within thirty days, unopened.').waitFor()
    assert.equal(
      await page
        .getByRole('button', { name: 'When does it arrive?' })
        .getAttribute('aria-expanded'),
      'false',
      'accordion: opening one did not close the other',
    )
  },
  async popover(page) {
    const trigger = page.getByRole('button', { name: 'Shipping', exact: true })
    await trigger.click()
    const panel = page.getByRole('dialog', { name: 'Shipping' })
    await panel.getByText('Two days, or four to an island.', { exact: false }).waitFor()
    await page.keyboard.press('Escape')
    await panel.waitFor({ state: 'hidden' })
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'popover: still expanded')
  },
  async menu(page) {
    const trigger = page.getByRole('button', { name: 'Actions' })
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const rename = page.getByRole('menuitem', { name: 'Rename' })
    await rename.waitFor()
    assert.equal(await rename.evaluate((el) => el === document.activeElement), true)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByText('Chosen: Duplicate').waitFor()
    assert.equal(
      await trigger.evaluate((el) => el === document.activeElement),
      true,
      'menu: focus did not return to the button',
    )
  },
  async drawer(page) {
    const opener = page.getByRole('button', { name: 'Open navigation' })
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await drawer.waitFor()
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    assert.equal(
      await opener.evaluate((el) => el === document.activeElement),
      true,
      'drawer: focus did not return to the button that opened it',
    )
  },
  async 'bottom-sheet'(page) {
    await page.getByRole('button', { name: 'Filters' }).click()
    const sheet = page.getByRole('dialog', { name: 'Filters' })
    await sheet.waitFor()
    // The grabber is a `before:` box on a class list passed at runtime, so
    // only the candidate stylesheet draws it; without its `content` the bar
    // was missing (#1136).
    assert.equal(
      await sheet
        .getByRole('button', { name: 'Resize' })
        .evaluate((el) => getComputedStyle(el, '::before').content),
      '""',
      'bottom-sheet: the grabber bar is not drawn',
    )
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'hidden' })
  },
}

let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const [name, exercise] of Object.entries(pages)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await page.goto(`${base}/${name}/`, { waitUntil: 'networkidle' })
    // The island is `display: contents`, and Playwright judges its
    // visibility by its first child, which for some previews is the
    // `<style>` of the View base. Scroll to the first child that renders.
    await page.locator('astro-island > :not(style)').first().scrollIntoViewIfNeeded()
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))
    await exercise(page)
    assert.deepEqual(errors, [], `${name}: the page logged errors`)
    await page.close()
  }
  console.log(`Components: ${Object.keys(pages).join(', ')} hydrate and respond in a browser`)
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
