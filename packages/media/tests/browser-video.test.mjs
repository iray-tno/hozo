import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../', import.meta.url))
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))

test('real browser decodes the local MP4, plays, seeks, loops, errors, changes sources and cleans up under StrictMode', async (t) => {
  if (!executablePath) {
    if (process.env.CI) throw new Error('Video playback evidence requires Chrome; set CHROME_PATH')
    t.skip('Chrome not installed; this is not playback evidence')
    return
  }
  const result = await build({
    stdin: {
      contents: `
        import React, {useState} from 'react'
        import {createRoot} from 'react-dom/client'
        import {Video} from './src/index.ts'
        window.statuses = []; window.errors = []; window.ended = 0
        window.ref = React.createRef()
        function App() {
          const [src, change] = useState('/clip.mp4')
          const [mounted, mount] = useState(true)
          const [options, configure] = useState({muted:true, loop:false})
          window.change = change; window.mount = mount; window.configure = configure
          return mounted && <Video ref={window.ref} src={src} accessibilityLabel="Local silent clip"
            {...options} onStatusChange={s => window.statuses.push(s)}
            onError={e => window.errors.push(e)} onEnded={() => window.ended++}/>
        }
        createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
      `,
      resolveDir: root,
      sourcefile: 'browser-fixture.tsx',
      loader: 'tsx',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    metafile: true,
  })
  assert.equal(
    Object.keys(result.metafile.inputs).some((file) => /expo-video|react-native/.test(file)),
    false,
  )
  const clip = readFileSync(path.join(root, '../../examples/showcase/assets/hozo-video.mp4'))
  const server = createServer((request, response) => {
    const url = request.url.split('?')[0]
    if (url === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(result.outputFiles[0].contents)
    } else if (url === '/clip.mp4') {
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
      const start = range ? Number(range[1]) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1
      if (start > end || start >= clip.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${clip.length}` })
        response.end()
      } else {
        response.writeHead(range ? 206 : 200, {
          'Content-Type': 'video/mp4',
          'Content-Length': end - start + 1,
          'Accept-Ranges': 'bytes',
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}),
        })
        response.end(clip.subarray(start, end + 1))
      }
    } else if (url === '/bad.mp4') {
      response.writeHead(404)
      response.end('Not a movie')
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<!doctype html><div id="root"></div><script src="/app.js"></script>')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page
      .waitForFunction(() => window.ref.current?.getStatus().status === 'ready')
      .catch(async (error) => {
        console.error(
          '[media] loading failure',
          pageErrors,
          await page.evaluate(() => ({
            statuses: window.statuses,
            errors: window.errors,
            ready: document.querySelector('video')?.readyState,
            error: document.querySelector('video')?.error?.message,
          })),
        )
        throw error
      })
    assert.equal(await page.locator('video').getAttribute('aria-label'), 'Local silent clip')
    assert.equal(await page.evaluate(() => document.querySelector('video').controls), true)
    const duration = await page.evaluate(() => window.ref.current.getStatus().duration)
    assert.ok(duration > 3 && duration < 6, `Recorded fixture duration ${duration}`)
    await page.evaluate(() => window.ref.current.play())
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().playing && window.ref.current.getStatus().currentTime > 0.1,
    )
    await page.evaluate(() => window.ref.current.pause())
    await page.waitForFunction(() => !window.ref.current.getStatus().playing)
    await page.evaluate(() => window.ref.current.seekTo(1))
    await page
      .waitForFunction(() => Math.abs(window.ref.current.getStatus().currentTime - 1) < 0.2)
      .catch(async (error) => {
        console.error(
          '[media] seek failure',
          await page.evaluate(() => ({
            statuses: window.statuses.slice(-6),
            errors: window.errors,
            time: document.querySelector('video').currentTime,
            seeking: document.querySelector('video').seeking,
            readyState: document.querySelector('video').readyState,
            seekable: Array.from(
              { length: document.querySelector('video').seekable.length },
              (_, i) => [
                document.querySelector('video').seekable.start(i),
                document.querySelector('video').seekable.end(i),
              ],
            ),
          })),
        )
        throw error
      })
    const pixels = await page.evaluate(() => {
      const video = document.querySelector('video')
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      context.drawImage(video, 0, 0)
      const image = context.getImageData(0, 0, canvas.width, canvas.height).data
      let purple = 0
      for (let index = 0; index < image.length; index += 4) {
        if (
          Math.abs(image[index] - 129) < 20 &&
          Math.abs(image[index + 1] - 140) < 20 &&
          image[index + 2] > 220
        )
          purple++
      }
      return { width: video.videoWidth, height: video.videoHeight, purple }
    })
    assert.equal(pixels.width, 320)
    assert.equal(pixels.height, 180)
    assert.ok(pixels.purple > 800, `Decoded square pixel count ${pixels.purple}`)
    await page.evaluate(() => {
      window.ref.current.seekTo(window.ref.current.getStatus().duration - 0.15)
      return window.ref.current.play()
    })
    await page.waitForFunction(() => window.ended === 1)
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().status), 'ended')
    await page.evaluate(() => window.configure({ muted: false, loop: true }))
    await page.waitForFunction(
      () => document.querySelector('video').loop && !document.querySelector('video').muted,
    )
    await page.evaluate(() => {
      window.ref.current.seekTo(window.ref.current.getStatus().duration - 0.15)
      return window.ref.current.play()
    })
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().playing && window.ref.current.getStatus().currentTime < 1,
    )
    assert.equal(await page.evaluate(() => window.ended), 1, 'looping does not emit terminal end')
    await page.evaluate(() => {
      window.old = document.querySelector('video')
      window.change('/clip.mp4?source=second')
    })
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().src.endsWith('second') &&
        window.ref.current.getStatus().status === 'ready',
    )
    assert.equal(await page.evaluate(() => window.old.getAttribute('src')), null)
    assert.equal(await page.evaluate(() => window.old.paused), true)
    await page.evaluate(() => window.old.dispatchEvent(new Event('ended')))
    assert.equal(await page.evaluate(() => window.ended), 1)
    await page.evaluate(() => window.change('/bad.mp4'))
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'error')
    assert.equal(await page.evaluate(() => window.errors.at(-1).operation), 'load')
    await page.evaluate(() => window.change('/clip.mp4?source=recovered'))
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'ready')
    await page.evaluate(() => window.ref.current.play())
    await page.waitForFunction(() => window.ref.current.getStatus().playing)
    await page.evaluate(() => {
      window.old = document.querySelector('video')
      window.mount(false)
    })
    await page.waitForFunction(() => window.ref.current === null)
    assert.equal(
      await page.evaluate(() => window.old.paused && !window.old.hasAttribute('src')),
      true,
    )
    assert.deepEqual(pageErrors, [])
    console.log(
      '[media] Chromium: local AVC decode, play/pause/seek/end/loop, error recovery, source retirement and StrictMode cleanup passed; not Native device evidence',
    )
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
