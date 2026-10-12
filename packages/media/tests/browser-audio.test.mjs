import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { exercisePlaybackRate } from './helpers/playback-rate.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))

test('real Audio decodes PCM, produces non-silent samples, uses keyboard controls and retires source resources', async (t) => {
  if (!executablePath) {
    if (process.env.CI) throw new Error('Audio playback evidence requires Chrome; set CHROME_PATH')
    t.skip('Chrome not installed; this is not audio evidence')
    return
  }
  const built = await build({
    stdin: {
      contents: `
    import React, {useState} from 'react'
    import {createRoot} from 'react-dom/client'
    import {Audio} from './src/audio-index.ts'
    import {useMediaSeek} from './src/seek-index.ts'
    import {Slider} from '../patterns/src/slider.tsx'
    window.ref = React.createRef(); window.statuses = []; window.errors = []; window.ends = 0
    function App() {
      const [src, change] = useState('/tones.wav')
      const [mounted, mount] = useState(true)
      const [options, configure] = useState({muted:false, loop:false})
      const [status, setStatus] = useState(null)
      const seek = useMediaSeek({player:window.ref, status:mounted ? status : null})
      window.change = change; window.mount = mount; window.configure = configure
      return mounted && <><Audio ref={window.ref} src={src} accessibilityLabel="Three tones" {...options}
        onStatusChange={s => {window.statuses.push(s);setStatus(s)}} onError={e => window.errors.push(e)} onEnded={() => window.ends++}/>
        {seek.slider && <Slider key={seek.key} {...seek.slider}/>}</>
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
    window.attachGraph = async () => {
      window.context = new AudioContext()
      window.meter = context.createAnalyser(); meter.fftSize = 1024
      window.node = context.createMediaElementSource(document.querySelector('audio'))
      node.connect(meter); meter.connect(context.destination)
      await context.resume()
    }
    window.rms = () => {
      const values = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(values)
      return Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length)
    }
  `,
      resolveDir: root,
      sourcefile: 'audio-browser.tsx',
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    metafile: true,
  })
  assert.ok(!Object.keys(built.metafile.inputs).some((file) => /expo-|react-native/.test(file)))
  const wav = readFileSync(
    new URL('../../../examples/showcase/assets/hozo-audio.wav', import.meta.url),
  )
  const server = createServer((request, response) => {
    if (request.url.startsWith('/app.js')) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(built.outputFiles[0].contents)
    } else if (request.url.startsWith('/tones.wav')) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
      const start = range ? Number(range[1]) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
      if (start > end || start >= wav.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${wav.length}` })
        response.end()
      } else {
        response.writeHead(range ? 206 : 200, {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
        })
        response.end(wav.subarray(start, end + 1))
      }
    } else if (request.url.startsWith('/bad.wav')) {
      response.writeHead(404)
      response.end('Not audio')
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<!doctype html><div id="root"></div><script src="/app.js"></script>')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  let page
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    page = await browser.newPage()
    const failures = []
    page.on('pageerror', (error) => failures.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.waitForFunction(() => window.ref.current?.getStatus().status === 'ready')
    assert.equal(await page.locator('audio').getAttribute('aria-label'), 'Three tones')
    assert.equal(await page.evaluate(() => document.querySelector('audio').controls), false)
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().duration), 4)
    await page.evaluate(() => {
      window.originalAudio = document.querySelector('audio')
      window.originalHandle = window.ref.current
    })
    for (const [volume, muted] of [
      [0.25, false],
      [0.7, true],
      [0, true],
      [0, false],
      [1, false],
    ]) {
      await page.evaluate(({ volume, muted }) => window.configure({ volume, muted }), {
        volume,
        muted,
      })
      await page.waitForFunction(
        ({ volume, muted }) => {
          const audio = document.querySelector('audio')
          return audio.volume === volume && audio.muted === muted
        },
        { volume, muted },
      )
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('audio') === window.originalAudio &&
            window.ref.current === window.originalHandle,
        ),
        true,
      )
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().currentTime), 0)
      assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
    }
    await exercisePlaybackRate(page, 'audio')
    await page.evaluate(() => window.configure({ muted: false }))
    await page.waitForFunction(() => !document.querySelector('audio').muted)
    const scrubber = page.getByRole('slider', { name: 'Playback position', exact: true })
    await scrubber.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => Math.abs(window.ref.current.getStatus().currentTime - 1) < 0.2)
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().playing), false)
    await page.keyboard.press('Home')
    await page.waitForFunction(() => window.ref.current.getStatus().currentTime < 0.1)
    await page.waitForFunction(() => {
      const ranges = document.querySelector('audio').seekable
      return ranges.length && ranges.end(ranges.length - 1) >= 3.99
    })
    await page.evaluate(() => {
      window.handle = window.ref.current
    })
    await page.getByRole('button', { name: 'Play audio', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.evaluate(() => window.attachGraph())
    await page.waitForFunction(() => window.rms() > 0.02 && window.ref.current.getStatus().playing)
    assert.equal(await page.evaluate(() => window.handle === window.ref.current), true)
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Pause audio')
    await page.keyboard.press('Space')
    await page.waitForFunction(() => !window.ref.current.getStatus().playing)
    await page.evaluate(() => window.ref.current.seekTo(0))
    await page.getByRole('button', { name: 'Seek forward 10 seconds' }).click()
    await page.waitForFunction(() => window.ref.current.getStatus().currentTime >= 3.99)
    await page.evaluate(() => window.ref.current.seekTo(3.7))
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'ended')
    assert.equal(await page.evaluate(() => window.ends), 1)
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().playing && window.ref.current.getStatus().currentTime < 1,
    )
    await page.evaluate(() => window.ref.current.pause())
    await page.evaluate(() => window.configure({ loop: true, muted: true }))
    await page.waitForFunction(
      () => document.querySelector('audio').loop && document.querySelector('audio').muted,
    )
    await page.evaluate(async () => {
      await window.ref.current.seekTo(3.7)
      await window.ref.current.play()
    })
    await page.waitForFunction(
      () =>
        window.ref.current.getStatus().playing && window.ref.current.getStatus().currentTime < 1,
    )
    assert.equal(await page.evaluate(() => window.ends), 1, 'loop must not emit a terminal end')
    await page.evaluate(() => {
      window.retired = document.querySelector('audio')
      window.change('/bad.wav')
    })
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'error')
    assert.equal(
      await page.evaluate(() => window.retired.paused && !window.retired.getAttribute('src')),
      true,
    )
    assert.ok(
      (await page.evaluate(() => window.errors)).some(
        (error) => error.src === '/bad.wav' && error.operation === 'load',
      ),
    )
    await page.evaluate(() => window.change('/tones.wav?replacement'))
    await page.waitForFunction(() => window.ref.current.getStatus().status === 'ready')
    assert.equal(await page.evaluate(() => window.ref.current.getStatus().error), null)
    await page.evaluate(() => {
      window.retired = document.querySelector('audio')
      window.mount(false)
    })
    await page.waitForFunction(() => window.ref.current === null)
    assert.equal(
      await page.evaluate(() => window.retired.paused && !window.retired.getAttribute('src')),
      true,
    )
    await page.evaluate(() => window.context.close())
    assert.deepEqual(failures, [])
    console.log(
      '[media] Chromium Audio: real non-silent samples, keyboard play/pause, bounded seek, end/replay/loop, source recovery and StrictMode retirement; not Native audible-output evidence',
    )
  } catch (error) {
    console.error(
      '[media] Audio failure snapshot',
      await page?.evaluate(() => ({
        status: window.ref.current?.getStatus(),
        observations: window.statuses.slice(-8),
        errors: window.errors,
        clock: document.querySelector('audio')?.currentTime,
        controls: document.getElementById('root')?.textContent,
      })),
    )
    throw error
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
