import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { posterFixture } from '../../../examples/showcase/scripts/generate-poster-fixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const poster = readFileSync(
  new URL('../../../examples/showcase/assets/hozo-video-poster.png', import.meta.url),
)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))

test('owned poster PNG is reproducible and independent of the video sample', () => {
  assert.deepEqual(poster, posterFixture())
  assert.equal(poster.readUInt32BE(16), 320)
  assert.equal(poster.readUInt32BE(20), 180)
})

async function visiblePixels(page) {
  // Screenshot the composed viewport, not drawImage(video), which bypasses
  // the cover and could falsely report a decoded frame behind an opaque image.
  const screenshot = await page.locator('video').screenshot()
  return page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    let teal = 0
    let purple = 0
    for (let index = 0; index < data.length; index += 4) {
      const [r, g, b] = data.subarray(index, index + 3)
      if (r < 40 && g > 160 && b > 140) teal++
      if (r >= 95 && r <= 165 && g >= 105 && g <= 175 && b >= 215 && b - r >= 70) purple++
    }
    const area = image.width * image.height
    return { teal: teal / area, purple: purple / area }
  }, screenshot.toString('base64'))
}

/**
 * Samples until the decoded frame shows, within a bound. Removing the cover
 * and the compositor presenting the paused frame are separate steps, and on a
 * loaded runner a screenshot can fall between them and see neither the poster
 * nor the frame (#1066). A frame that never appears still fails, with the
 * last sample.
 */
async function decodedPixels(page) {
  const deadline = Date.now() + 2000
  for (;;) {
    const pixels = await visiblePixels(page)
    if (pixels.purple > 0.02 || Date.now() > deadline) return pixels
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
}

for (const fallback of [false, true]) {
  test(`real browser poster pixels, stable controls/host, source reset and image failure (${fallback ? 'decoded-data fallback' : 'compositor callback'})`, async (t) => {
    if (!executablePath) {
      if (process.env.CI) throw new Error('Poster evidence requires Chrome; set CHROME_PATH')
      t.skip('Chrome unavailable; this is not poster pixel evidence')
      return
    }
    const built = await build({
      stdin: {
        contents: `
        import React, {useState} from 'react'
        import {createRoot} from 'react-dom/client'
        import {Video} from './src/index.ts'
        window.ref = React.createRef(); window.statuses=[]; window.posterErrors=[]
        function App() {
          const [options, setOptions] = useState({src:'/clip.mp4', poster:'/poster.png'})
          window.configure = changes => setOptions(previous => ({...previous,...changes}))
          return <Video ref={window.ref} {...options} accessibilityLabel="Clip" muted
            style={{width:320,height:180,backgroundColor:'#0f172b'}}
            onStatusChange={status => window.statuses.push(status)}
            onPosterError={error => window.posterErrors.push(error)}/>
        }
        createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
      `,
        resolveDir: root,
        sourcefile: 'poster-browser.tsx',
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      metafile: true,
    })
    assert.ok(!Object.keys(built.metafile.inputs).some((file) => /expo-|react-native/.test(file)))
    const clip = readFileSync(
      new URL('../../../examples/showcase/assets/hozo-video.mp4', import.meta.url),
    )
    const server = createServer((request, response) => {
      const url = request.url.split('?')[0]
      if (url === '/app.js')
        response
          .writeHead(200, { 'Content-Type': 'text/javascript' })
          .end(built.outputFiles[0].contents)
      else if (url === '/poster.png')
        response.writeHead(200, { 'Content-Type': 'image/png' }).end(poster)
      else if (url === '/clip.mp4')
        response
          .writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': clip.length })
          .end(clip)
      else if (url === '/missing.png') response.writeHead(404).end()
      else
        response
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end('<!doctype html><div id="root"></div><script src="/app.js"></script>')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    let browser
    let page
    try {
      browser = await chromium.launch({ executablePath, headless: true })
      page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      if (fallback)
        await page.addInitScript(() => {
          HTMLVideoElement.prototype.requestVideoFrameCallback = undefined
        })
      else
        await page.addInitScript(() => {
          window.realFrames = []
          const request = HTMLVideoElement.prototype.requestVideoFrameCallback
          HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
            return request.call(this, (time, metadata) => {
              window.realFrames.push({ src: this.currentSrc, mediaTime: metadata.mediaTime })
              callback(time, metadata)
            })
          }
        })
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.waitForFunction(
        () =>
          window.ref.current?.getStatus().status === 'ready' &&
          document.querySelector('video').readyState >= 2 &&
          document.querySelector('img')?.naturalWidth === 320,
      )
      if (!fallback) await page.waitForFunction(() => window.realFrames.length > 0)
      const cover = await visiblePixels(page)
      assert.ok(cover.teal > 0.08 && cover.purple < 0.001, JSON.stringify(cover))
      assert.equal(await page.evaluate(() => document.querySelector('video').controls), false)
      assert.equal(
        await page.getByRole('img').count(),
        0,
        'decorative poster has no second accessible name',
      )
      await page.evaluate(() => {
        window.originalVideo = document.querySelector('video')
        window.handle = window.ref.current
      })
      await page.evaluate(async () => {
        const video = document.querySelector('video')
        const play = video.play
        video.play = () => Promise.reject(new Error('Deliberate play denial'))
        try {
          await window.ref.current.play()
        } catch {
          /* Denial is expected, not retried. */
        }
        video.play = play
      })
      assert.equal(await page.locator('img').count(), 1)
      const play = page.getByRole('button', { name: 'Play video', exact: true })
      await play.focus()
      await page.keyboard.press('Enter')
      await page.waitForFunction(
        () => window.ref.current.getStatus().playing && !document.querySelector('img'),
      )
      await page.keyboard.press('Space')
      await page.waitForFunction(() => !window.ref.current.getStatus().playing)
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        'Play video',
        'cover removal cannot retire the focused controls',
      )
      const decoded = await decodedPixels(page)
      assert.ok(decoded.purple > 0.02 && decoded.teal < 0.001, JSON.stringify(decoded))
      await page.evaluate(() => window.configure({ poster: '/poster.png?changed', fit: 'cover' }))
      await page.waitForFunction(() => document.querySelector('video').style.objectFit === 'cover')
      assert.equal(await page.locator('img').count(), 0)
      assert.equal(
        await page.evaluate(
          () =>
            window.ref.current === window.handle &&
            document.querySelector('video') === window.originalVideo,
        ),
        true,
      )
      await page.evaluate(() => window.configure({ src: '/clip.mp4?replacement' }))
      await page.waitForFunction(
        () =>
          window.ref.current.getStatus().src === '/clip.mp4?replacement' &&
          window.ref.current.getStatus().status === 'ready' &&
          document.querySelector('img')?.naturalWidth === 320,
      )
      const replaced = await visiblePixels(page)
      assert.ok(replaced.teal > 0.08 && replaced.purple < 0.001, JSON.stringify(replaced))
      assert.equal(
        await page.evaluate(
          () => window.originalVideo.paused && !window.originalVideo.hasAttribute('src'),
        ),
        true,
      )
      await page.evaluate(() => window.ref.current.seekTo(0))
      await page.waitForFunction(() => !document.querySelector('img'))
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
      const atZero = await decodedPixels(page)
      assert.ok(atZero.purple > 0.02 && atZero.teal < 0.001, JSON.stringify(atZero))
      await page.evaluate(() =>
        window.configure({ src: '/clip.mp4?missingPoster', poster: '/missing.png' }),
      )
      await page.waitForFunction(
        () => window.posterErrors.length === 1 && window.ref.current.getStatus().status === 'ready',
      )
      assert.equal(await page.locator('img').count(), 0)
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().error), null)
      assert.equal(await page.evaluate(() => window.posterErrors[0].src), '/clip.mp4?missingPoster')
      assert.equal(await page.evaluate(() => window.posterErrors[0].poster), '/missing.png')
      assert.deepEqual(errors, [])
      console.log(
        `[media poster] ${fallback ? 'decoded-data fallback' : 'compositor callback'} composed cover/video pixels ${JSON.stringify({ cover, decoded, replaced, atZero })}; not Native pixel or AT evidence`,
      )
    } catch (error) {
      console.error(
        '[poster failure]',
        await page?.evaluate(() => ({
          status: window.ref.current?.getStatus(),
          frames: window.realFrames,
          poster: document.querySelector('img')?.src,
          errors: window.posterErrors,
        })),
      )
      throw error
    } finally {
      await browser?.close()
      await new Promise((resolve) => server.close(resolve))
    }
  })
}
