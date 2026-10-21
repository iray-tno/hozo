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
  async tooltip(page) {
    // The trigger is an @hozo/ui Button, which dropped the ref, handlers and
    // aria-describedby the tooltip clones onto it, so it never opened (#1137).
    const save = page.getByRole('button', { name: 'Save' })
    await save.focus()
    const tip = page.getByRole('tooltip').filter({ hasText: 'Saves without leaving the page' })
    await tip.waitFor()
    assert.equal(
      await save.getAttribute('aria-describedby'),
      await tip.getAttribute('id'),
      'tooltip: the button is not described by the bubble',
    )
    await page.keyboard.press('Escape')
    await tip.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Share' }).hover()
    await page.getByRole('tooltip').filter({ hasText: 'Copies a link' }).waitFor()
  },
  async listbox(page) {
    await page.getByRole('option', { name: 'Go' }).click()
    await page.getByText('Chosen: rust, go').waitFor()
    assert.equal(
      await page.getByRole('option', { name: 'COBOL' }).getAttribute('aria-disabled'),
      'true',
      'listbox: the disabled option is not marked',
    )
  },
  async combobox(page) {
    const field = page.getByRole('combobox', { name: 'Country' })
    await field.fill('j')
    // Japan, Jamaica, Jordan: the list narrows to what starts with the text.
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 3)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByText('Chosen: jm').waitFor()
    assert.equal(
      await field.evaluate((el) => el === document.activeElement),
      true,
      'combobox: focus left the field',
    )
  },
  async tree(page) {
    const crates = page.getByRole('treeitem', { name: 'crates' })
    await page.getByRole('treeitem', { name: 'README.md' }).focus()
    await crates.focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await crates.getAttribute('aria-expanded'), 'false', 'tree: Left did not close')
    await page.keyboard.press('ArrowRight')
    assert.equal(await crates.getAttribute('aria-expanded'), 'true', 'tree: Right did not open')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByText('Selected: ir').waitFor()
    // A pointer opens a branch too, and selects it (#1143).
    const packages = page.getByRole('treeitem', { name: 'packages' })
    await packages.click()
    assert.equal(await packages.getAttribute('aria-expanded'), 'true', 'tree: a click did not open')
    await page.getByText('Selected: packages').waitFor()
    await packages.click()
    assert.equal(
      await packages.getAttribute('aria-expanded'),
      'false',
      'tree: a click did not close',
    )
  },
  async calendar(page) {
    const grid = page.getByRole('grid')
    await grid.getByRole('gridcell', { name: /September 28/ }).click()
    await page.getByText('Delivery: 2026-09-28').waitFor()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.getByText('Delivery: 2026-09-29').waitFor()
  },
  async 'date-picker'(page) {
    const trigger = page.getByRole('button', { name: /Delivery day/ })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('gridcell', { name: /September 28/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.match(
      await trigger.innerText(),
      /9\/28\/2026|Sep(tember)? 28/,
      'date-picker: no day shown',
    )
  },
  async 'date-range-picker'(page) {
    const trigger = page.getByRole('button', { name: /Stay/ })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('gridcell', { name: /September 28/ }).click()
    await dialog.getByRole('gridcell', { name: /September 25/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    // Chosen in reverse, shown in order.
    assert.match(
      await trigger.innerText(),
      /25.*28/s,
      'date-range-picker: range not shown in order',
    )
  },
  async 'date-time-picker'(page) {
    const trigger = page.getByRole('button', { name: /Meeting/ })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('gridcell', { name: /September 28/ }).click()
    // A day alone does not close it: the time is still to come.
    await dialog.getByRole('button', { name: 'Done' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.match(await trigger.innerText(), /28/, 'date-time-picker: no day shown')
  },
  async 'time-picker'(page) {
    const hour = page.getByRole('spinbutton', { name: 'Hour' })
    await hour.focus()
    await page.keyboard.press('ArrowUp')
    await page.getByText('Stored as 10:30').waitFor()
    await page.getByRole('spinbutton', { name: 'Minute' }).focus()
    await page.keyboard.press('ArrowUp')
    // A step of fifteen minutes.
    await page.getByText('Stored as 10:45').waitFor()
  },
  async toolbar(page) {
    const bold = page.getByRole('button', { name: 'Bold' })
    const italic = page.getByRole('button', { name: 'Italic' })
    await bold.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await italic.evaluate((el) => el === document.activeElement), true)
    // One tab stop: the one moved to is the only one Tab reaches.
    assert.equal(await italic.getAttribute('tabindex'), '0', 'toolbar: not the tab stop')
    assert.equal(await bold.getAttribute('tabindex'), '-1', 'toolbar: two tab stops')
    await page.keyboard.press('Enter')
    await page.getByText('Pressed: Italic').waitFor()
  },
  async pagination(page) {
    const seven = page.getByRole('button', { name: 'Page 7' })
    await seven.click()
    await page.getByText('Showing page 7 of 20').waitFor()
    assert.equal(await seven.getAttribute('aria-current'), 'page', 'pagination: not current')
    await page.getByRole('button', { name: 'Previous page' }).click()
    await page.getByText('Showing page 6 of 20').waitFor()
  },
  async stepper(page) {
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByText('Step 3 of 4: Payment, current').waitFor({ state: 'attached' })
    await page.getByRole('button', { name: /Step 1 of 4: Cart/ }).click()
    await page.getByText('Step 1 of 4: Cart, current').waitFor({ state: 'attached' })
  },
  async 'color-picker'(page) {
    await page.getByRole('radio', { name: 'red, #ef4444' }).click()
    await page.getByText('Chosen: #ef4444').waitFor()
    const hex = page.locator('.hozo-ui-example input')
    await hex.fill('#10b981')
    await hex.press('Enter')
    await page.getByText('Chosen: #10b981').waitFor()
  },
  async 'command-palette'(page) {
    const opener = page.getByRole('button', { name: 'Open the command palette' })
    await opener.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    // A keyword finds a command its label does not name.
    await page.keyboard.type('colour')
    await dialog.getByRole('option', { name: /Toggle dark mode/ }).waitFor()
    await page.keyboard.press('Enter')
    await dialog.waitFor({ state: 'hidden' })
    await page.getByText('Ran: Toggle dark mode').waitFor()
    assert.equal(
      await opener.evaluate((el) => el === document.activeElement),
      true,
      'command-palette: focus did not return to the button',
    )
  },
  async 'file-dropzone'(page) {
    const input = page.locator('.hozo-ui-example input[type=file]')
    await input.setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from('x') })
    await page.getByText('Chosen: cat.png').waitFor()
    await input.setInputFiles({ name: 'cat.gif', mimeType: 'image/gif', buffer: Buffer.from('x') })
    await page.getByText('Refused: type').waitFor()
  },
  async 'otp-input'(page) {
    await page.getByRole('textbox', { name: 'Verification code' }).click()
    await page.keyboard.type('123456')
    await page.getByText('Checking 123456').waitFor()
  },
  async form(page) {
    const email = page.getByRole('textbox', { name: 'Email' })
    const send = page.getByRole('button', { name: 'Send' })
    await send.click()
    await page
      .locator('.hozo-ui-example')
      .getByText('That does not look like an email address.')
      .waitFor()
    assert.equal(await email.getAttribute('aria-invalid'), 'true', 'form: not marked invalid')
    // It does not submit past the invalid field; it focuses it instead.
    await send.click()
    assert.equal(await email.evaluate((el) => el === document.activeElement), true)
    await email.fill('ada@example.com')
    await send.click()
    await page.getByText('Subscribed ada@example.com').waitFor()
  },
  async stack(page) {
    await page.locator('.hozo-ui-example').getByText('centred').waitFor()
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
