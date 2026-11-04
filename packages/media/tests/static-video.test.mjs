import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { create } from 'react-test-renderer'

// #1674: a statically rendered page, with no hydration, has to get a video
// that plays, shows its poster and keeps its layout from the markup alone.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))

async function load(entry, resolve) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name) => resolve?.(name) ?? require(name),
    module,
    module.exports,
  )
  return module.exports
}

const STATIC = {
  src: '/clip.mp4',
  accessibilityLabel: 'Walkthrough',
  autoPlay: true,
  muted: true,
  loop: true,
  controls: false,
  poster: '/poster.png',
  preload: 'auto',
  width: 1200,
  height: 800,
  nativeID: 'carousel-video',
  className: 'w-full shrink-0',
}

test('server markup carries what the browser needs to play without hydration', async () => {
  const { Video } = await load('src/index.ts')
  const html = renderToStaticMarkup(React.createElement(Video, STATIC))
  // Case-insensitive: React writes `autoPlay`, and HTML does not mind.
  for (const attribute of [
    'autoplay=""',
    'muted=""',
    'loop=""',
    'poster="/poster.png"',
    'preload="auto"',
    'width="1200"',
    'height="800"',
    'id="carousel-video"',
    'class="w-full shrink-0"',
    'aspect-ratio:1.5',
  ])
    assert.ok(
      html.toLowerCase().includes(attribute.toLowerCase()),
      `${attribute} missing from ${html}`,
    )
  // The overlay is cleared by state a static page never runs.
  assert.doesNotMatch(html, /<img/)
  // The classes size the box, so the inline defaults step aside.
  assert.match(
    html,
    /^<div class="w-full shrink-0" style="position:relative;aspect-ratio:1.5;overflow:hidden">/,
  )

  const plain = renderToStaticMarkup(
    React.createElement(Video, { src: '/clip.mp4', accessibilityLabel: 'Clip' }),
  )
  assert.match(plain, /width:100%;height:180px/, 'the default box is unchanged')
  assert.match(plain, /preload="metadata"/)
  assert.doesNotMatch(plain, /autoplay|poster=|aspect-ratio/)

  for (const width of [0, -1, Number.NaN, Infinity]) {
    assert.throws(
      () => renderToStaticMarkup(React.createElement(Video, { ...STATIC, width })),
      /Video width must be a positive finite number/,
    )
  }
})

test('a static page plays from its markup, and hydrating it observes that playback', async (t) => {
  if (!executablePath) {
    if (process.env.CI) throw new Error('Video playback evidence requires Chrome; set CHROME_PATH')
    t.skip('Chrome not installed; this is not playback evidence')
    return
  }
  const { Video } = await load('src/index.ts')
  const { poster: _, ...props } = STATIC
  const markup = renderToStaticMarkup(React.createElement(Video, props))
  const hydrate = await build({
    stdin: {
      contents: `
        import React from 'react'
        import {hydrateRoot} from 'react-dom/client'
        import {Video} from './src/index.ts'
        window.ref = React.createRef()
        window.hydrationErrors = []
        hydrateRoot(document.getElementById('root'),
          <Video ref={window.ref} {...${JSON.stringify(props)}}/>,
          {onRecoverableError: (error) => window.hydrationErrors.push(String(error))})
      `,
      resolveDir: root,
      sourcefile: 'hydrate-fixture.tsx',
      loader: 'tsx',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  })
  const clip = readFileSync(path.join(root, '../../examples/showcase/assets/hozo-video.mp4'))
  // Hydrate only once the attribute has started playback, as a slow script
  // would. The session then attaches to an element that is already playing,
  // and `play()` on it fires no `play` event to tell it so.
  const HYDRATE_LATE = `<script>document.getElementById('carousel-video').addEventListener('playing', () => {
    const script = document.createElement('script'); script.src = '/hydrate.js'; document.body.append(script)
  }, {once: true})</script>`
  const page = (script) =>
    `<!doctype html><div id="root">${markup}</div>${script ? HYDRATE_LATE : ''}`
  const server = createServer((request, response) => {
    const url = request.url.split('?')[0]
    if (url === '/clip.mp4') {
      response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': clip.length })
      response.end(clip)
    } else if (url === '/hydrate.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' })
      response.end(hydrate.outputFiles[0].text)
    } else {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(page(url === '/hydrated'))
    }
  }).listen(0)
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  })
  try {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const still = await context.newPage()
    await still.goto(`${origin}/static`)
    const video = still.locator('#carousel-video')
    // No script runs here, so only the attribute can have started it.
    await still.waitForFunction(
      () => {
        const element = document.getElementById('carousel-video')
        return element && !element.paused && element.currentTime > 0
      },
      null,
      { timeout: 10000 },
    )
    const box = await still.locator('#root > div').boundingBox()
    assert.ok(box && Math.abs(box.width / box.height - 1.5) < 0.01, `box ${JSON.stringify(box)}`)
    assert.equal(await video.getAttribute('preload'), 'auto')
    await context.close()

    const live = await browser.newPage()
    await live.goto(`${origin}/hydrated`)
    // Read as soon as the handle exists, which is when the session starts:
    // a later loop or `playing` event would correct a wrong answer and hide it.
    await live.waitForFunction(() => window.ref?.current, null, { timeout: 10000 })
    assert.equal(await live.evaluate(() => window.ref.current.getStatus().playing), true)
    assert.deepEqual(await live.evaluate(() => window.hydrationErrors), [])
  } finally {
    await browser.close()
    server.close()
  }
})

test('Native Video sizes its box from the intrinsic size and resolves its classes', async () => {
  const resolved = []
  const exports = await load('src/index.native.ts', (name) => {
    if (name === 'expo-video')
      return {
        VideoView: (props) => React.createElement('ExpoVideoView', props),
        createVideoPlayer: () => ({
          addListener: () => ({ remove() {} }),
          release() {},
          pause() {},
        }),
      }
    if (name === 'react-native') return { View: 'RNView', Text: 'RNText', Pressable: 'RNPressable' }
    if (name === '@hozo/engine/project')
      return {
        hozoClasses: (value) => {
          resolved.push(value)
          return value === undefined ? undefined : { marker: value }
        },
      }
  })
  const { Video } = exports
  let renderer
  await act(async () => {
    renderer = create(
      React.createElement(Video, {
        src: 'a.mp4',
        accessibilityLabel: 'Clip',
        width: 1600,
        height: 900,
        nativeID: 'clip',
        className: 'rounded-xl',
      }),
    )
  })
  const box = renderer.root.findAll((node) => node.type === 'RNView')[0]
  assert.equal(box.props.nativeID, 'clip')
  const [defaults, classes] = box.props.style
  assert.deepEqual(defaults, { width: '100%', aspectRatio: 1600 / 900 })
  assert.deepEqual(classes, { marker: 'rounded-xl' })
  assert.ok(resolved.includes('rounded-xl'))
  await act(async () => {
    renderer.update(React.createElement(Video, { src: 'a.mp4', accessibilityLabel: 'Clip' }))
  })
  const plain = renderer.root.findAll((node) => node.type === 'RNView')[0]
  assert.deepEqual(plain.props.style[0], { width: '100%', height: 180 })
  await act(async () => renderer.unmount())
})
