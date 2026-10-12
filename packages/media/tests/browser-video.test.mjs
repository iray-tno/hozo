import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../', import.meta.url))
const plainWebVTT =
  '\uFEFFWEBVTT Original\n\nNOTE owned test cues\n\nfirst\n00:00.000 --> 00:01.000\nFirst square position\n\nsecond\n00:01.000 --> 00:04.000\n&lt;b&gt;Moving square&lt;/b&gt;\nNo speech\n'
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
        import {Video, VideoControls} from './src/index.ts'
        import {useMediaSeek} from './src/seek-index.ts'
        import {Slider} from '../patterns/src/slider.tsx'
        import {MediaCaptions, useWebVTTCaptions} from './src/captions-index.ts'
        import {parsePlainTextWebVTT} from './src/webvtt-index.ts'
        window.vtt = ${JSON.stringify(plainWebVTT)}
        const cues = parsePlainTextWebVTT(window.vtt)
        window.parsedCues = cues
        window.statuses = []; window.errors = []; window.ended = 0
        window.ref = React.createRef()
        function App() {
          const [src, change] = useState('/clip.mp4')
          const [mounted, mount] = useState(true)
          const [options, configure] = useState({muted:true, loop:false})
          const [status, setStatus] = useState(null)
          const [trackSrc, setTrack] = useState('/captions.vtt')
          const track = useWebVTTCaptions({mediaSrc:src, trackSrc, enabled:mounted})
          const seek = useMediaSeek({player:window.ref, status: mounted ? status : null})
          window.captionState = track; window.setTrack = setTrack
          window.change = change; window.mount = mount; window.configure = configure
          return mounted && <><Video ref={window.ref} src={src} accessibilityLabel="Local silent clip"
            {...options} onStatusChange={s => {window.statuses.push(s); setStatus(s)}}
            onError={e => window.errors.push(e)} onEnded={() => window.ended++}/>
            <VideoControls player={window.ref} status={status} seekStep={1}/>
            {seek.slider && <Slider key={seek.key} {...seek.slider} style={{position:'relative',width:320,height:44}} thumbClassName="seek-thumb"/>}
            <MediaCaptions src={track.mediaSrc} status={status} cues={track.cues} accessibilityLabel="Clip captions"/>
            <p role="status">{track.error ? track.error.message : 'Captions: ' + track.status}</p></>
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
  let retryRequests = 0
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
    } else if (url === '/captions.vtt' || (url === '/retry.vtt' && ++retryRequests > 1)) {
      response.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8' })
      response.end(plainWebVTT)
    } else if (url === '/invalid.vtt') {
      response.writeHead(200, { 'Content-Type': 'text/vtt' })
      response.end('WEBVTT\n\n00:00.000 --> 00:01.000\n<b>Unsupported</b>')
    } else if (url === '/bad.mp4' || url === '/retry.vtt') {
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
    await page.evaluate(() => {
      window.originalVideo = document.querySelector('video')
      window.originalHandle = window.ref.current
    })
    for (const [volume, muted] of [
      [0.25, true],
      [0.7, true],
      [0, false],
      [1, true],
    ]) {
      await page.evaluate(({ volume, muted }) => window.configure({ volume, muted }), {
        volume,
        muted,
      })
      await page.waitForFunction(
        ({ volume, muted }) => {
          const video = document.querySelector('video')
          return video.volume === volume && video.muted === muted
        },
        { volume, muted },
      )
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('video') === window.originalVideo &&
            window.ref.current === window.originalHandle,
        ),
        true,
      )
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().currentTime), 0)
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
    }
    assert.equal(await page.evaluate(() => document.querySelector('video').controls), true)
    const captions = page.getByRole('group', { name: 'Clip captions', exact: true })
    await page.waitForFunction(() => window.captionState.status === 'ready')
    assert.equal(await captions.textContent(), 'First square position')
    assert.equal(await captions.getAttribute('aria-live'), null)
    // Compare against Chromium's actual WebVTT parser, not another handwritten
    // copy of these timing/entity rules. Keep its track hidden: Hozo displays
    // the same converted text and retains the existing playback pixel gates.
    await page.evaluate(() => {
      const video = document.querySelector('video')
      const track = document.createElement('track')
      const url = URL.createObjectURL(new Blob([window.vtt], { type: 'text/vtt' }))
      window.referenceTrack = track
      window.referenceTrackUrl = url
      track.kind = 'captions'
      track.src = url
      track.addEventListener(
        'load',
        () => {
          window.trackResult = Array.from(track.track.cues, (cue) => ({
            start: cue.startTime,
            end: cue.endTime,
            text: cue.getCueAsHTML().textContent,
          }))
        },
        { once: true },
      )
      track.addEventListener(
        'error',
        () => {
          window.trackResult = 'track load failed'
        },
        { once: true },
      )
      video.append(track)
      track.track.mode = 'hidden'
    })
    await page.waitForFunction(() => window.trackResult !== undefined)
    assert.deepEqual(
      await page.evaluate(() => window.trackResult),
      await page.evaluate(() => window.parsedCues),
    )
    assert.deepEqual(
      await page.evaluate(() => window.captionState.cues),
      await page.evaluate(() => window.trackResult),
      'real HTTP acquisition preserves the independently parsed cue text and timing',
    )
    await page.evaluate(() => {
      window.referenceTrack.remove()
      URL.revokeObjectURL(window.referenceTrackUrl)
    })
    await page.evaluate(() => window.setTrack('/retry.vtt'))
    await page.waitForFunction(() => window.captionState.status === 'error')
    assert.equal(await captions.count(), 0)
    assert.equal(await page.getByRole('status').textContent(), 'Caption request failed (HTTP 404)')
    await page.evaluate(() => window.captionState.reload())
    await page.waitForFunction(() => window.captionState.status === 'ready')
    assert.equal(retryRequests, 2, 'only an explicit reload retries a failed track')
    assert.equal(await captions.textContent(), 'First square position')
    await page.evaluate(() => window.setTrack('/invalid.vtt'))
    await page.waitForFunction(() => window.captionState.status === 'error')
    assert.equal(await captions.count(), 0)
    assert.equal(await page.evaluate(() => window.captionState.error.code), 'unsupported-webvtt')
    assert.equal(await page.evaluate(() => window.captionState.error.line), 4)
    assert.match(await page.getByRole('status').textContent(), /WebVTT line 4/)
    await page.evaluate(() => window.setTrack('/captions.vtt'))
    await page.waitForFunction(() => window.captionState.status === 'ready')
    const duration = await page.evaluate(() => window.ref.current.getStatus().duration)
    assert.ok(duration > 3 && duration < 6, `Recorded fixture duration ${duration}`)
    const scrubber = page.getByRole('slider', { name: 'Playback position', exact: true })
    await page.evaluate(() => {
      window.seekRequests = []
      const original = window.ref.current.seekTo
      window.ref.current.seekTo = (time) => {
        window.seekRequests.push(time)
        return original(time)
      }
    })
    const track = page.locator('div[data-hozo-orientation="horizontal"]')
    const box = await track.boundingBox()
    assert.ok(box)
    await track.evaluate((element) => {
      element.addEventListener('pointerdown', (event) => {
        window.seekPointer = event.pointerId
        window.seekCaptureEvents = []
      })
      element.addEventListener('gotpointercapture', () => window.seekCaptureEvents.push('got'))
      element.addEventListener('lostpointercapture', () => window.seekCaptureEvents.push('lost'))
    })
    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + (box.width * 3) / 4, box.y + box.height / 2)
    await page.waitForFunction(() =>
      document
        .querySelector('[role=slider]')
        ?.getAttribute('aria-valuetext')
        ?.startsWith('Seek to '),
    )
    assert.equal(
      await page.evaluate(() => window.ref.current.getStatus().currentTime),
      0,
      'drag is a preview, not a decoder seek',
    )
    await page.mouse.up()
    await page.waitForFunction(() => Math.abs(window.ref.current.getStatus().currentTime - 3) < 0.2)
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
    await scrubber.focus()
    await page.keyboard.press('Home')
    await page.waitForFunction(() => window.ref.current.getStatus().currentTime < 0.1)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    // setPointerCapture takes effect before the next pointer event. Releasing
    // only its pending override is not capture loss and emits no lost event.
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2)
    await page.waitForFunction(() => window.seekCaptureEvents.includes('got'))
    await track.evaluate((element) => element.releasePointerCapture(window.seekPointer))
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2)
    await page.waitForFunction(() => window.seekCaptureEvents.includes('lost'))
    await page.mouse.up()
    assert.deepEqual(
      await page.evaluate(() => window.seekRequests),
      [3, 0],
      'real capture loss sends no seek request',
    )
    assert.equal(
      await page.evaluate(() => window.ref.current.getStatus().currentTime),
      0,
      'capture loss must not commit the preview',
    )
    // A decoder observation and its React-rendered control are separate
    // readiness facts. Do not send a relative key while the UI still shows
    // the retired drag preview; assert that cancellation reached the UI too.
    await page
      .waitForFunction(() => {
        const slider = document.querySelector('[role=slider]')
        return (
          slider?.getAttribute('aria-valuenow') === '0' &&
          slider.getAttribute('aria-valuetext') === '0:00 / 0:04'
        )
      })
      .catch(async (error) => {
        console.error(
          '[media] cancelled seek UI',
          await page.evaluate(() => ({
            observed: window.ref.current.getStatus(),
            value: document.querySelector('[role=slider]')?.getAttribute('aria-valuenow'),
            text: document.querySelector('[role=slider]')?.getAttribute('aria-valuetext'),
          })),
        )
        throw error
      })
    await scrubber.focus()
    await page.keyboard.press('ArrowRight')
    await page
      .waitForFunction(() => Math.abs(window.ref.current.getStatus().currentTime - 1) < 0.2)
      .catch(async (error) => {
        console.error(
          '[media] slider keyboard seek',
          await page.evaluate(() => ({
            requests: window.seekRequests,
            observed: window.ref.current.getStatus(),
            actualTime: document.querySelector('video').currentTime,
            value: document.querySelector('[role=slider]')?.getAttribute('aria-valuenow'),
            text: document.querySelector('[role=slider]')?.getAttribute('aria-valuetext'),
            focus: document.activeElement?.outerHTML,
          })),
        )
        throw error
      })
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'slider')
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
    await page.keyboard.press('Home')
    await page.waitForFunction(() => window.ref.current.getStatus().currentTime < 0.1)
    const toggle = page.getByRole('button', { name: 'Play video', exact: true })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().playing && window.ref.current.getStatus().currentTime > 0.1,
    )
    await page.getByRole('button', { name: 'Pause video', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Pause video')
    await page.keyboard.press('Space')
    await page.waitForFunction(() => !window.ref.current.getStatus().playing)
    await page.evaluate(() => window.ref.current.seekTo(0))
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).find(
          (button) => button.textContent === 'Seek backward 1 second',
        )?.disabled,
    )
    assert.equal(
      await page.getByRole('button', { name: 'Seek backward 1 second' }).isDisabled(),
      true,
    )
    await page.getByRole('button', { name: 'Seek forward 1 second' }).focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.ref.current.getStatus().currentTime >= 1)
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
    assert.equal(await captions.textContent(), '<b>Moving square</b>\nNo speech')
    assert.equal(await captions.locator('b').count(), 0, 'cue markup is literal, never HTML')
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
    assert.equal(
      await captions.count(),
      0,
      'a failed source cannot retain its predecessor captions',
    )
    await page.evaluate(() => window.change('/clip.mp4?source=recovered'))
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'ready')
    await page.evaluate(() => window.ref.current.play())
    await page.waitForFunction(() => window.ref.current.getStatus().playing)
    await page.evaluate(() => {
      window.old = document.querySelector('video')
      window.mount(false)
    })
    await page.waitForFunction(() => window.ref.current === null)
    assert.equal(await captions.count(), 0)
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
