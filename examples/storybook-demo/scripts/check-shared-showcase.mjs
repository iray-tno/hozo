import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright-core'
import {
  createReadiness,
  INTERACTION_TIMEOUT,
  validateCompletion,
} from './shared-showcase-readiness.mjs'

const directory = path.resolve(process.argv[2] ?? 'storybook-static-check')
const browser = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate))
if (!browser) {
  if (process.env.CI) throw new Error('Shared showcase interaction checks require Chrome')
  console.log('[shared-showcase] no browser; set CHROME_PATH to run locally')
  process.exit(0)
}

// This exercises the built stories, not a separate copy of their components.
// Synthetic keys verify our roving/Pressable handlers, not browser-trusted
// default actions; button clicks and dialog cancel events test those contracts.
// The original virtual DOM dump could exit while paused metadata-preloaded
// movies were still being asked for canplay/loadeddata. Neither frame load
// plus 250ms nor a fast-forwarded clock is a component/decoder readiness signal.
// Observe the required UI states, then explicit completion, in real time.
const started = Date.now()
const deadline = started + INTERACTION_TIMEOUT
writeFileSync(
  path.join(directory, '_shared-interactions.html'),
  `<!doctype html>
<meta charset="utf-8">
<pre id="result">pending</pre><iframe id="story" width="1100" height="900"></iframe>
<script>
const result = document.getElementById('result')
const frame = document.getElementById('story')
const passed = []
function progress(stage, state = 'running', error) {
  const doc = frame.contentDocument
  window.__sharedResult = {
    state, stage, passed:passed.slice(), error,
    frame:frame.src,
    media:[...(doc?.querySelectorAll('video,audio') || [])].map(media => ({
      tag:media.tagName, src:(media.currentSrc || '').slice(0,80),
      preload:media.preload, readyState:media.readyState, networkState:media.networkState,
      paused:media.paused, seeking:media.seeking, currentTime:media.currentTime,
      error:media.error ? {code:media.error.code,message:media.error.message} : null,
    })),
  }
  result.textContent = JSON.stringify(window.__sharedResult)
}
const {find, wait, storyReady, metadataReady, coverReady, settle} =
  (${createReadiness.toString()})(frame, {deadline:${deadline},onStage:progress})
function check(value, message) { if (!value) throw new Error(message) }
function named(selector, name) {
  const node = find(selector, name)
  check(node, 'Missing control: ' + name)
  return node
}
async function loadStory(id, ready) {
  frame.src = '/iframe.html?id=' + id + '&viewMode=story'
  await wait(() => storyReady(id, ready), 'story ' + id)
}
const load = (name, ready) => loadStory('showcase-shared-web-and-native--' + name, ready)
async function run() {
  // Non-ASCII expectations must be decoded like the authored fixture, not
  // mojibake in the harness compared with correctly bundled caption text.
  check(document.characterSet === 'UTF-8', 'Interaction harness requires UTF-8')
  await load('preferences', () => find('[role=checkbox]', 'Email notifications') && find('[role=switch]', 'Automatic updates') && find('[role=checkbox]', 'Required security notices'))
  const email = named('[role=checkbox]', 'Email notifications')
  const updates = named('[role=switch]', 'Automatic updates')
  email.click(); updates.click()
  await wait(() => email.getAttribute('aria-checked') === 'true' && updates.getAttribute('aria-checked') === 'false', 'preference toggle')
  check(email.getAttribute('aria-checked') === 'true', 'Checkbox did not toggle')
  check(updates.getAttribute('aria-checked') === 'false', 'Switch did not toggle')
  const required = named('[role=checkbox]', 'Required security notices')
  required.click(); await settle()
  check(required.disabled && required.getAttribute('aria-checked') === 'true', 'Required notice changed')
  passed.push('preferences and disabled state')

  await load('sections', () => find('[role=tab]', 'Overview') && find('[role=tab]', 'Details') && find('[role=tab]', 'Unavailable'))
  const overview = named('[role=tab]', 'Overview')
  const details = named('[role=tab]', 'Details')
  overview.focus()
  overview.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait(() => frame.contentDocument.activeElement === details, 'ArrowRight roving')
  check(frame.contentDocument.activeElement === details, 'ArrowRight did not rove')
  details.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  await settle()
  check(frame.contentDocument.activeElement === details, 'End did not skip unavailable tab')
  details.click()
  await wait(() => details.getAttribute('aria-selected') === 'true' && frame.contentDocument.body.textContent.includes('Current section: Details'), 'Details panel')
  named('[role=tab]', 'Unavailable').click(); await settle()
  check(details.getAttribute('aria-selected') === 'true', 'Disabled tab selected')
  check(frame.contentDocument.body.textContent.includes('Current section: Details'), 'Tab panel did not update')
  passed.push('tabs, keyboard roving and disabled selection')

  await load('confirmation', () => find('[role=button]', 'Review changes'))
  const opener = named('[role=button]', 'Review changes')
  opener.focus()
  opener.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  const dialog = await wait(() => frame.contentDocument.querySelector('dialog')?.open && frame.contentDocument.querySelector('dialog'), 'dialog keyboard activation')
  check(dialog?.open, 'Enter did not open modal')
  dialog.dispatchEvent(new frame.contentWindow.Event('cancel', { cancelable: true }))
  await wait(() => !dialog.open && frame.contentDocument.activeElement === opener, 'cancel and focus restoration')
  check(!dialog.open && frame.contentDocument.activeElement === opener, 'Cancel did not restore opener')
  opener.click()
  await wait(() => dialog.open && find('button', 'Confirm save'), 'confirmation control')
  named('button', 'Confirm save').click()
  await wait(() => !dialog.open && frame.contentDocument.body.textContent.includes('Changes: saved'), 'saved confirmation')
  check(!dialog.open && frame.contentDocument.body.textContent.includes('Changes: saved'), 'Confirmation did not save')
  passed.push('dialog keyboard activation, cancel, confirmation and restored focus')

  await load('svg-filters', () => frame.contentDocument.querySelectorAll('svg[role=img]').length === 5 && find('button, [role=button]', 'Turn filters off'))
  const images = [...frame.contentDocument.querySelectorAll('svg[role=img]')]
  check(images.length === 5, 'Missing shared filter scenes')
  const painted = images.map(image => image.querySelector('rect:last-child'))
  function checkReferences() {
    for (const rect of painted) {
      const id = /^url\\(#(.+)\\)$/.exec(rect.getAttribute('filter'))?.[1]
      check(id && frame.contentDocument.getElementById(id), 'Unresolved filter reference')
    }
  }
  checkReferences()
  named('button, [role=button]', 'Turn filters off').click()
  await wait(() => painted.every(rect => !rect.hasAttribute('filter')), 'filters off')
  check(painted.every(rect => !rect.hasAttribute('filter')), 'Filters did not turn off')
  named('button, [role=button]', 'Turn filters on').click()
  await wait(() => painted.every(rect => rect.hasAttribute('filter')), 'filters on')
  checkReferences()
  passed.push('five shared SVG scenes with reversible filter references')

  await loadStory('media-video--default', () => frame.contentDocument.querySelector('video') && find('button', 'Play video'))
  const video = frame.contentDocument.querySelector('video')
  check(video?.controls && video.getAttribute('aria-label') === 'Moving square, silent video', 'Missing named video')
  await wait(() => metadataReady(video), 'video metadata')
  named('button', 'Play video').click()
  await wait(() => !video.paused && frame.contentDocument.body.textContent.includes('playing'), 'video playback')
  check(!video.paused && frame.contentDocument.body.textContent.includes('playing'), 'Showcase play did not update')
  named('button', 'Pause video').click()
  await wait(() => video.paused && frame.contentDocument.body.textContent.includes('paused'), 'video pause')
  check(video.paused, 'Showcase pause did not stop')
  named('button', 'Set video speed to 2x').click()
  await wait(() => video.playbackRate === 2, 'video 2x rate')
  await settle()
  check(video.playbackRate === 2 && video.preservesPitch && video.paused, 'Paused video rate update started playback or lost pitch policy')
  named('button', 'Set video speed to 1x').click()
  await wait(() => video.playbackRate === 1, 'video 1x rate')
  await settle()
  check(video.playbackRate === 1 && video.paused, 'Video rate default did not restore')
  named('button', 'Enable video loop').click()
  await wait(() => video.loop, 'video loop')
  check(video.loop, 'Showcase loop did not change')
  named('button', 'Remove video').click()
  await wait(() => !frame.contentDocument.querySelector('video') && video.paused && !video.hasAttribute('src'), 'video retirement')
  check(!frame.contentDocument.querySelector('video') && video.paused && !video.hasAttribute('src'), 'Showcase removal did not clean up')
  named('button', 'Mount video').click()
  await wait(() => frame.contentDocument.querySelector('video'), 'video remount')
  check(frame.contentDocument.querySelector('video'), 'Showcase did not remount')
  passed.push('shared Video controls, local MP4 and lifetime cleanup')

  await loadStory('media-video--timed-captions', () => frame.contentDocument.querySelector('video'))
  const captionVideo = frame.contentDocument.querySelector('video')
  const caption = () => frame.contentDocument.querySelector('[role=group][aria-label="Animation captions"]')
  await wait(() => metadataReady(captionVideo) && caption()?.textContent.includes('A purple square travels toward the center.'), 'first paused caption')
  check(caption()?.textContent.includes('A purple square travels toward the center.'), 'Observed first cue missing')
  const selectCaption = value => {
    const radio = frame.contentDocument.querySelector('input[type=radio][value="' + value + '"]')
    check(radio, 'Missing caption option: ' + value)
    radio.click()
  }
  const captionClock = captionVideo.currentTime
  selectCaption('ja')
  await wait(() => caption()?.textContent.includes('紫の四角が中央に向かって動きます。'), 'Japanese caption')
  await settle()
  check(caption()?.textContent.includes('紫の四角が中央に向かって動きます。'), 'Japanese cue missing')
  check(captionVideo.paused && captionVideo.currentTime === captionClock, 'Selection changed playback')
  selectCaption('')
  await wait(() => !caption(), 'captions Off')
  check(!caption(), 'Captions did not hide')
  selectCaption('en')
  await wait(() => caption()?.textContent.includes('A purple square travels toward the center.'), 'English caption')
  check(caption()?.textContent.includes('A purple square travels toward the center.'), 'English captions did not return')
  named('button', 'Remove video').click()
  await wait(() => !caption() && !frame.contentDocument.querySelector('video'), 'caption source retirement')
  check(!caption(), 'Captions survived source removal')
  passed.push('shared timed captions follow observations, language selection, Off and source removal')

  await loadStory('media-audio--default', () => frame.contentDocument.querySelector('audio') && find('button', 'Set audio speed to 2x'))
  const audio = frame.contentDocument.querySelector('audio')
  check(audio?.volume === 1 && !audio.muted, 'Missing default Audio gain')
  named('button', 'Set audio speed to 2x').click()
  await wait(() => audio.playbackRate === 2, 'audio 2x rate')
  await settle()
  check(audio.playbackRate === 2 && audio.preservesPitch && audio.paused, 'Audio rate update started playback or lost pitch policy')
  named('button', 'Set audio speed to 1x').click()
  await wait(() => audio.playbackRate === 1, 'audio 1x rate')
  await settle()
  check(audio.playbackRate === 1 && audio.paused, 'Audio rate default did not restore')
  named('button', 'Set audio volume to 25%').click()
  await wait(() => audio.volume === 0.25, 'audio gain .25')
  await settle()
  check(audio.volume === 0.25 && audio.paused, 'Volume change must not start playback')
  named('button', 'Mute audio').click()
  await wait(() => audio.muted, 'audio mute')
  check(audio.muted && audio.volume === 0.25, 'Mute discarded the requested gain')
  named('button', 'Set audio volume to 100%').click()
  await wait(() => audio.volume === 1, 'muted gain update')
  await settle()
  check(audio.muted && audio.volume === 1, 'Changing gain unexpectedly unmuted Audio')
  named('button', 'Unmute audio').click()
  await wait(() => !audio.muted, 'audio unmute')
  await settle()
  check(!audio.muted && audio.volume === 1 && audio.paused, 'Unmute did not retain the new gain')
  named('button', 'Set audio volume to 25%').click()
  await wait(() => audio.volume === 0.25, 'audio gain before remount')
  named('button', 'Remove audio').click()
  await wait(() => !frame.contentDocument.querySelector('audio') && !audio.hasAttribute('src'), 'audio retirement')
  check(!frame.contentDocument.querySelector('audio') && !audio.hasAttribute('src'), 'Audio removal did not retire source')
  named('button', 'Remount audio').click()
  await wait(() => frame.contentDocument.querySelector('audio')?.volume === 0.25, 'audio remount gain')
  check(frame.contentDocument.querySelector('audio')?.volume === 0.25, 'Remount lost application gain')
  passed.push('shared Audio gain, independent mute, paused updates and source remount')

  await loadStory('media-video--poster', () => frame.contentDocument.querySelector('video') && find('button', 'Seek forward 1 second'))
  const posterVideo = frame.contentDocument.querySelector('video')
  await wait(() => metadataReady(posterVideo) && coverReady(frame.contentDocument.querySelector('img[aria-hidden=true]')), 'initial cover image')
  check(frame.contentDocument.querySelector('img[aria-hidden=true]')?.naturalWidth === 320, 'Initial cover is missing')
  named('button', 'Seek forward 1 second').click()
  await wait(() => !frame.contentDocument.querySelector('img') && posterVideo.paused, 'explicit seek reveals paused video')
  await settle()
  check(!frame.contentDocument.querySelector('img') && posterVideo.paused, 'Explicit seek did not reveal paused video')
  named('button', 'Remove video').click()
  await wait(() => !frame.contentDocument.querySelector('video'), 'poster source retirement')
  named('button', 'Mount video').click()
  await wait(() => coverReady(frame.contentDocument.querySelector('img[aria-hidden=true]')), 'remounted cover image')
  check(frame.contentDocument.querySelector('img[aria-hidden=true]'), 'Remount did not reset the cover')
  passed.push('shared poster initial cover, explicit seek reveal and source remount')

  // A popover's first focus goes into the panel. FloatingPositioner draws
  // the panel hidden until it has measured, and focus used to be tried in
  // that frame and land on nothing, leaving it on the trigger.
  await loadStory('ui-gallery--default', () => find('button[aria-haspopup=dialog]', 'Shipping'))
  const shipping = named('button[aria-haspopup=dialog]', 'Shipping')
  shipping.focus()
  shipping.click()
  const panel = await wait(() => {
    const panel = frame.contentDocument.querySelector('[role=dialog][aria-label="Shipping"]')
    return panel?.contains(frame.contentDocument.activeElement) && panel
  }, 'popover panel focus')
  check(panel, 'Popover did not open')
  check(panel.contains(frame.contentDocument.activeElement), 'Popover did not move focus into its panel')
  shipping.click()
  await wait(() => frame.contentDocument.activeElement === shipping, 'popover focus restoration')
  check(frame.contentDocument.activeElement === shipping, 'Popover did not restore focus to its trigger')
  passed.push('popover focus moves into the panel and back')
  progress('complete', 'passed')
}
run().catch(error => { progress(window.__sharedResult?.stage || 'startup', 'failed', error.message) })
</script>`,
)

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}
const server = createServer((request, response) => {
  const file = path.resolve(directory, `.${new URL(request.url, 'http://localhost').pathname}`)
  if (!file.startsWith(`${directory}${path.sep}`)) {
    response.writeHead(403).end()
    return
  }
  try {
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
    response.end(readFileSync(file))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let client
let page
let failure
let latest = null
const evidenceErrors = []
const pageErrors = []
const remaining = () => Math.max(1, deadline - Date.now())
// This is the same outer bound as the old execFile timeout, including launch.
const watchdog = setTimeout(() => {
  failure ??= new Error('Shared showcase exceeded its 60-second wall-clock bound')
  void client?.close().catch(() => {})
}, remaining())
try {
  client = await chromium.launch({
    executablePath: browser,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'],
    timeout: remaining(),
  })
  page = await client.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.exposeFunction('__reportSharedProgress', (report) => {
    latest = report
  })
  await page.addInitScript(() => {
    // Keep failure-stage evidence outside the browser if it is closed at the
    // deadline. Only the parent harness publishes, not arbitrary frame globals.
    if (window === window.top) {
      let value
      Object.defineProperty(window, '__sharedResult', {
        get: () => value,
        set: (report) => {
          value = report
          void window.__reportSharedProgress(report).catch(() => {})
        },
      })
    }
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/_shared-interactions.html`, {
    waitUntil: 'domcontentloaded',
    timeout: remaining(),
  })
  await page.waitForFunction(
    () => ['passed', 'failed'].includes(window.__sharedResult?.state),
    null,
    { timeout: remaining() },
  )
  latest = await page.evaluate(() => window.__sharedResult)
  validateCompletion(latest, pageErrors)
  console.log(`[shared-showcase] ${latest.passed.join('; ')}`)
} catch (error) {
  failure ??= error
} finally {
  clearTimeout(watchdog)
  try {
    if (page && !page.isClosed()) {
      try {
        writeFileSync(path.join(directory, '_shared-interactions-dom.html'), await page.content())
      } catch (error) {
        // Closing the browser at the deadline can race a DOM snapshot. Keep
        // the last externally reported stage and the original failure intact.
        evidenceErrors.push(error.message)
      }
    }
    writeFileSync(
      path.join(directory, '_shared-interactions-result.json'),
      JSON.stringify(
        {
          passed: !failure,
          elapsedMs: Date.now() - started,
          report: latest,
          pageErrors,
          evidenceErrors,
          error: failure?.message,
        },
        null,
        2,
      ),
    )
  } finally {
    try {
      await client?.close()
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}
if (failure) {
  console.error(
    '[shared-showcase] failure evidence:',
    JSON.stringify({ report: latest, pageErrors, evidenceErrors }),
  )
  throw failure
}
