import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import {
  colorPickerContrast,
  colorPickerFixture,
  mountColorPicker,
} from './color-picker-contrast.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise ColorPicker contrast')

test('compiled ColorPicker markers remain visible on real gradients and alpha backdrops', {
  skip: !executablePath,
}, async () => {
  const fixture = await colorPickerFixture()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 500 } })
    for (const dark of [false, true])
      for (const dir of ['ltr', 'rtl']) {
        await mountColorPicker(page, fixture, dark, dir)
        for (const value of [
          '#ffffff',
          '#000000',
          '#808080',
          '#ffff00',
          '#0000ff',
          '#00ff00',
          '#ff0000',
          '#ffffff00',
          '#00000000',
          '#0000ff80',
        ]) {
          await page.evaluate((value) => window.renderColorPicker({ value }), value)
          await page.waitForFunction(
            (value) => document.querySelector('input').value === value,
            value,
          )
          for (const marker of await colorPickerContrast(page)) {
            assert.ok(marker.contrast >= 3, JSON.stringify({ dark, dir, value, ...marker }))
          }
        }
      }
    await mountColorPicker(page, fixture)
    await page.evaluate(() => window.renderColorPicker({ defaultValue: '#ffffff' }))
    const lightness = page.getByRole('slider', { name: 'Lightness' })
    const original = await lightness.evaluate((node) => getComputedStyle(node).borderTopColor)
    await lightness.focus()
    await lightness.press('Home')
    assert.equal(await lightness.getAttribute('aria-valuenow'), '0')
    assert.notEqual(
      await lightness.evaluate((node) => getComputedStyle(node).borderTopColor),
      original,
    )
    assert.equal(await lightness.evaluate((node) => document.activeElement === node), true)
    assert.equal(await lightness.evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
    const hex = page.locator('input')
    await hex.fill('#ffffff')
    await hex.blur()
    assert.equal(await lightness.getAttribute('aria-valuenow'), '100')
    assert.equal(
      await lightness.evaluate((node) => getComputedStyle(node).borderTopColor),
      original,
    )
    await page.evaluate(() => window.renderColorPicker({ value: '#000000', disabled: true }))
    assert.equal(await lightness.getAttribute('aria-disabled'), 'true')
    assert.equal(await lightness.getAttribute('tabindex'), '-1')
    assert.equal(await lightness.getAttribute('aria-valuenow'), '0')
  } finally {
    await browser.close()
  }
})
