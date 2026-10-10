import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'

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
writeFileSync(
  path.join(directory, '_shared-interactions.html'),
  `<!doctype html>
<pre id="result">pending</pre><iframe id="story" width="1100" height="900"></iframe>
<script>
const result = document.getElementById('result')
const frame = document.getElementById('story')
const pause = () => new Promise(resolve => setTimeout(resolve, 250))
function check(value, message) { if (!value) throw new Error(message) }
function named(selector, name) {
  const node = [...frame.contentDocument.querySelectorAll(selector)].find(node =>
    (node.getAttribute('aria-label') || node.textContent.trim()) === name)
  check(node, 'Missing control: ' + name)
  return node
}
async function loadStory(id) {
  await new Promise(resolve => {
    frame.onload = resolve
    frame.src = '/iframe.html?id=' + id + '&viewMode=story'
  })
  await pause()
}
const load = (name) => loadStory('showcase-shared-web-and-native--' + name)
async function run() {
  const passed = []
  await load('preferences')
  const email = named('[role=checkbox]', 'Email notifications')
  const updates = named('[role=switch]', 'Automatic updates')
  email.click(); updates.click(); await pause()
  check(email.getAttribute('aria-checked') === 'true', 'Checkbox did not toggle')
  check(updates.getAttribute('aria-checked') === 'false', 'Switch did not toggle')
  const required = named('[role=checkbox]', 'Required security notices')
  required.click(); await pause()
  check(required.disabled && required.getAttribute('aria-checked') === 'true', 'Required notice changed')
  passed.push('preferences and disabled state')

  await load('sections')
  const overview = named('[role=tab]', 'Overview')
  const details = named('[role=tab]', 'Details')
  overview.focus()
  overview.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await pause()
  check(frame.contentDocument.activeElement === details, 'ArrowRight did not rove')
  details.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  await pause()
  check(frame.contentDocument.activeElement === details, 'End did not skip unavailable tab')
  details.click(); await pause()
  named('[role=tab]', 'Unavailable').click(); await pause()
  check(details.getAttribute('aria-selected') === 'true', 'Disabled tab selected')
  check(frame.contentDocument.body.textContent.includes('Current section: Details'), 'Tab panel did not update')
  passed.push('tabs, keyboard roving and disabled selection')

  await load('confirmation')
  const opener = named('[role=button]', 'Review changes')
  opener.focus()
  opener.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await pause()
  const dialog = frame.contentDocument.querySelector('dialog')
  check(dialog?.open, 'Enter did not open modal')
  dialog.dispatchEvent(new frame.contentWindow.Event('cancel', { cancelable: true })); await pause()
  check(!dialog.open && frame.contentDocument.activeElement === opener, 'Cancel did not restore opener')
  opener.click(); await pause()
  named('button', 'Confirm save').click(); await pause()
  check(!dialog.open && frame.contentDocument.body.textContent.includes('Changes: saved'), 'Confirmation did not save')
  passed.push('dialog keyboard activation, cancel, confirmation and restored focus')

  await load('svg-filters')
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
  named('button, [role=button]', 'Turn filters off').click(); await pause()
  check(painted.every(rect => !rect.hasAttribute('filter')), 'Filters did not turn off')
  named('button, [role=button]', 'Turn filters on').click(); await pause()
  checkReferences()
  passed.push('five shared SVG scenes with reversible filter references')

  await loadStory('media-video--default')
  const video = frame.contentDocument.querySelector('video')
  check(video?.controls && video.getAttribute('aria-label') === 'Moving square, silent video', 'Missing named video')
  if (video.readyState < 1) await new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', resolve, { once: true })
    video.addEventListener('error', () => reject(new Error('Bundled video could not load')), { once: true })
  })
  named('button', 'Play video').click(); await pause()
  check(!video.paused && frame.contentDocument.body.textContent.includes('playing'), 'Showcase play did not update')
  named('button', 'Pause video').click(); await pause()
  check(video.paused, 'Showcase pause did not stop')
  named('button', 'Enable video loop').click(); await pause()
  check(video.loop, 'Showcase loop did not change')
  named('button', 'Remove video').click(); await pause()
  check(!frame.contentDocument.querySelector('video') && video.paused && !video.hasAttribute('src'), 'Showcase removal did not clean up')
  named('button', 'Mount video').click(); await pause()
  check(frame.contentDocument.querySelector('video'), 'Showcase did not remount')
  passed.push('shared Video controls, local MP4 and lifetime cleanup')

  // A popover's first focus goes into the panel. FloatingPositioner draws
  // the panel hidden until it has measured, and focus used to be tried in
  // that frame and land on nothing, leaving it on the trigger.
  await loadStory('ui-gallery--default')
  const shipping = named('button[aria-haspopup=dialog]', 'Shipping')
  shipping.focus()
  shipping.click(); await pause()
  const panel = frame.contentDocument.querySelector('[role=dialog][aria-label="Shipping"]')
  check(panel, 'Popover did not open')
  check(panel.contains(frame.contentDocument.activeElement), 'Popover did not move focus into its panel')
  shipping.click(); await pause()
  check(frame.contentDocument.activeElement === shipping, 'Popover did not restore focus to its trigger')
  passed.push('popover focus moves into the panel and back')
  result.textContent = JSON.stringify({ passed })
}
run().catch(error => { result.textContent = JSON.stringify({ error: error.message }) })
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
try {
  const { stdout } = await promisify(execFile)(
    browser,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-background-networking',
      '--virtual-time-budget=20000',
      '--dump-dom',
      `http://127.0.0.1:${server.address().port}/_shared-interactions.html`,
    ],
    { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  )
  const output = /<pre id="result">([^<]*)<\/pre>/.exec(stdout)?.[1]
  assert.ok(output && output !== 'pending', 'browser did not complete interactions')
  const result = JSON.parse(output.replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
  assert.equal(result.error, undefined, result.error)
  assert.equal(result.passed.length, 6)
  console.log(`[shared-showcase] ${result.passed.join('; ')}`)
} finally {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
}
