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
    const values = [
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
    ]
    for (const dark of [false, true]) {
      const byDir = new Map()
      for (const dir of ['ltr', 'rtl']) {
        await mountColorPicker(page, fixture, dark, dir)
        const byValue = new Map()
        for (const value of values) {
          await page.evaluate((value) => window.renderColorPicker({ value }), value)
          await page.waitForFunction(
            (value) => document.querySelector('input').value === value,
            value,
          )
          const markers = await colorPickerContrast(page)
          byValue.set(value, markers)
          for (const marker of markers) {
            assert.ok(marker.contrast >= 3, JSON.stringify({ dark, dir, value, ...marker }))
            assert.ok(
              Math.abs(marker.offset) <= 0.05,
              `thumb center offset in ${dir} for ${value} (${marker.name}): ${JSON.stringify(marker)}`,
            )
          }
          if (value === '#ffff00') {
            const hue = markers.find((marker) => marker.name === 'Hue')
            assert.equal(hue.now, 60)
            assert.ok(
              hue.backdrop[0] >= 240 && hue.backdrop[1] >= 240 && hue.backdrop[2] <= 15,
              `Hue 60 under ${dir} must sample yellow, got ${JSON.stringify(hue)}`,
            )
          }
        }
        byDir.set(dir, byValue)
      }
      for (const value of values) {
        const ltrMarkers = byDir.get('ltr').get(value)
        const rtlMarkers = byDir.get('rtl').get(value)
        for (let i = 0; i < ltrMarkers.length; i++) {
          const ltr = ltrMarkers[i]
          const rtl = rtlMarkers[i]
          for (let channel = 0; channel < 3; channel++) {
            assert.ok(
              Math.abs(ltr.backdrop[channel] - rtl.backdrop[channel]) <= 3,
              `gradient mismatch between LTR and RTL for ${value} (${ltr.name}): ltr=${JSON.stringify(ltr.backdrop)} rtl=${JSON.stringify(rtl.backdrop)}`,
            )
          }
        }
      }
    }

    // RTL pointer, keyboard, swatch navigation, and generic styled Slider alignment.
    await mountColorPicker(page, fixture, false, 'rtl')
    await page.evaluate(() =>
      window.renderColorPicker({
        defaultValue: '#ff0000',
        presets: ['#ff0000', '#ffff00', '#0000ff'],
      }),
    )
    const hue = page.getByRole('slider', { name: 'Hue' })
    const hueTrack = hue.locator('..')
    const box = await hueTrack.boundingBox()
    // In RTL, 60/359 from inline-start (right) lands on hue 60 (#ffff00).
    const targetX = box.x + box.width * (1 - 60 / 359)
    await page.mouse.click(targetX, box.y + box.height / 2)
    const clickedNow = Number(await hue.getAttribute('aria-valuenow'))
    assert.ok(Math.abs(clickedNow - 60) <= 1, `expected hue ~60 from RTL click, got ${clickedNow}`)
    const clickedCenter = await hue.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return rect.x + rect.width / 2
    })
    assert.ok(
      Math.abs(clickedCenter - (box.x + box.width * (1 - clickedNow / 359))) <= 0.05,
      `thumb center ${clickedCenter} did not align with value ${clickedNow}`,
    )
    await hue.focus()
    await hue.press('ArrowLeft')
    assert.equal(Number(await hue.getAttribute('aria-valuenow')), clickedNow + 1)
    await hue.press('ArrowRight')
    assert.equal(Number(await hue.getAttribute('aria-valuenow')), clickedNow)
    const swatches = page.getByRole('radio')
    await swatches.first().focus()
    await swatches.first().press('ArrowLeft')
    assert.equal(await swatches.nth(1).getAttribute('aria-checked'), 'true')
    await swatches.nth(1).press('ArrowRight')
    assert.equal(await swatches.first().getAttribute('aria-checked'), 'true')

    for (const dir of ['ltr', 'rtl']) {
      await mountColorPicker(page, fixture, false, dir)
      for (const value of [0, 25, 50, 100]) {
        await page.evaluate((value) => window.renderSlider({ value }), value)
        const alignment = await page.getByRole('slider', { name: 'Level' }).evaluate((node) => {
          const thumb = node.getBoundingClientRect()
          const track = node.parentElement.getBoundingClientRect()
          const fill = node.parentElement
            .querySelectorAll('[aria-hidden="true"]')[1]
            .getBoundingClientRect()
          const fraction = Number(node.getAttribute('aria-valuenow')) / 100
          const rtl = getComputedStyle(node).direction === 'rtl'
          const expected = rtl
            ? track.right - fraction * track.width
            : track.left + fraction * track.width
          const fillEnd = rtl ? fill.left : fill.right
          return {
            centerOffset: thumb.x + thumb.width / 2 - expected,
            fillOffset: fillEnd - expected,
          }
        })
        assert.ok(
          Math.abs(alignment.centerOffset) <= 0.05,
          `${dir} Slider@${value}: ${JSON.stringify(alignment)}`,
        )
        assert.ok(
          Math.abs(alignment.fillOffset) <= 0.05,
          `${dir} Slider fill@${value}: ${JSON.stringify(alignment)}`,
        )
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
    // The slider commits its value before the effect that mirrors it to the
    // HEX draft. Filling white while that draft still says white need not
    // produce an input change. Begin from the rendered black field, not just
    // the slider's ARIA value; a lost update must fail this readiness check.
    await page.waitForFunction(
      () =>
        document.querySelector('input').value === '#000000' &&
        window.colorChanges.at(-1) === '#000000',
      undefined,
      { timeout: 5_000 },
    )
    const editObservation = async (phase) =>
      page.evaluate(
        (phase) => ({
          phase,
          draft: document.querySelector('input').value,
          lightness: document
            .querySelector('[role=slider][aria-label=Lightness]')
            .getAttribute('aria-valuenow'),
          changes: [...window.colorChanges],
        }),
        phase,
      )
    const editObservations = [await editObservation('before-fill')]
    await hex.fill('#ffffff')
    // Observe the actual notification AND rendered owner before blur can
    // normalize the draft. No retrying input or fixed-frame delay.
    await page.waitForFunction(
      () =>
        window.colorChanges.at(-1) === '#ffffff' &&
        document
          .querySelector('[role=slider][aria-label=Lightness]')
          .getAttribute('aria-valuenow') === '100',
      undefined,
      { timeout: 5_000 },
    )
    editObservations.push(await editObservation('after-fill'))
    await hex.blur()
    await page.waitForFunction(
      () => document.querySelector('input').value === '#ffffff',
      undefined,
      {
        timeout: 5_000,
      },
    )
    editObservations.push(await editObservation('after-blur'))
    console.log(`[color-picker hex edit] ${JSON.stringify(editObservations)}`)
    assert.deepEqual(await page.evaluate(() => window.colorChanges), ['#000000', '#ffffff'])
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
