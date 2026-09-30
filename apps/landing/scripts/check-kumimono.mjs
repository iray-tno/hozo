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
  if (process.env.CI) throw new Error('Kumimono: browser required in CI')
  console.log('Kumimono: no browser found; skipped')
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
  const file = path.resolve(dist, relative || 'index.html')
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/hozo/`
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
let browser
try {
  browser = await chromium.launch({ executablePath, args })
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    const section = page.locator('#kumimono')
    await section.scrollIntoViewIfNeeded()
    const button = section.getByRole('button', { name: 'Disassemble', exact: true })
    await button.waitFor()
    await page.waitForFunction(() => !document.querySelector('#kumimono button').disabled)
    assert.equal(await section.locator('canvas').count(), 1)
    await page.waitForFunction(() => document.querySelector('#kumimono canvas')?.width > 0)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    await button.click()
    await page.waitForFunction(
      () => Number(document.querySelector('.kumimono-stage').dataset.progress) < 95,
    )
    await section.getByRole('button', { name: 'Reverse', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.kumimono-stage').dataset.progress === '100',
      null,
      { timeout: 15000 },
    )
    const slider = section.getByRole('slider', { name: 'Assembly', exact: true })
    await slider.focus()
    await slider.press('Home')
    assert.equal(await slider.getAttribute('aria-valuetext'), '0% assembled')
    await slider.press('End')
    assert.equal(await slider.getAttribute('aria-valuetext'), '100% assembled')
    // Reduced motion must not enter an animation loop or require waiting five seconds.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(100)
    await section.getByRole('button', { name: 'Disassemble', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.kumimono-stage').dataset.progress === '0',
    )
    assert.equal(await section.locator('.kumimono-stage').getAttribute('data-playing'), 'false')
    if (process.env.KUMIMONO_SCREENSHOT_DIR) {
      await page.waitForTimeout(200)
      await section.screenshot({
        path: path.join(process.env.KUMIMONO_SCREENSHOT_DIR, `kumimono-exploded-${width}.png`),
      })
    }
    await section.getByRole('button', { name: 'Assemble', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.kumimono-stage').dataset.progress === '100',
    )
    // Read actual screenshot pixels, not just DOM state: demand rendering must
    // show the assembled wooden geometry after an immediate slider/button change.
    await page.waitForTimeout(200)
    const png = await section.locator('canvas').screenshot()
    const timberPixels = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          pixels[i] > 45 &&
          pixels[i] > pixels[i + 1] * 1.3 &&
          pixels[i + 1] > pixels[i + 2] * 1.3
        )
          count++
      }
      return count
    }, png.toString('base64'))
    assert.ok(timberPixels > 1000, `assembled model not rendered: ${timberPixels} timber pixels`)
    if (process.env.KUMIMONO_SCREENSHOT_DIR) {
      await page.waitForTimeout(200)
      await section.screenshot({
        path: path.join(process.env.KUMIMONO_SCREENSHOT_DIR, `kumimono-${width}.png`),
      })
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.waitForTimeout(100)
    await section.getByRole('button', { name: 'Disassemble', exact: true }).click()
    await page.waitForFunction(
      () => Number(document.querySelector('.kumimono-stage').dataset.progress) < 95,
    )
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(
      () => document.querySelector('.kumimono-stage').dataset.playing === 'false',
    )
    const paused = await section.locator('.kumimono-stage').getAttribute('data-progress')
    await page.waitForTimeout(250)
    assert.equal(await section.locator('.kumimono-stage').getAttribute('data-progress'), paused)
    assert.deepEqual(errors, [])
    await page.close()
  }
  await browser.close()
  browser = await chromium.launch({ executablePath, args: [...args, '--disable-webgl'] })
  const page = await browser.newPage()
  await page.goto(url)
  await page.locator('#kumimono').scrollIntoViewIfNeeded()
  await page.getByText('The 3D study needs WebGL.', { exact: false }).waitFor()
  assert.equal(await page.locator('#kumimono button').isDisabled(), true)
  console.log(
    'Kumimono: real WebGL, mobile/desktop, keyboard, reversal, reduced motion, offscreen pause, and fallback passed',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
