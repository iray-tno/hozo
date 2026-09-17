// Serves the built Storybook to the browser a screen reader drives.
//
//   node serve-static.mjs <port>
//
// Playwright's `webServer` starts this and waits for `index.json`. The
// catalogue is built by `examples/storybook-demo` into
// `storybook-static-check`, the same directory its own checks read.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', 'storybook-demo', 'storybook-static-check')
// Pages that are not stories: an experiment a reader is pointed at directly,
// which a Storybook story would owe a committed golden. See fixtures/.
const fixtures = path.resolve(here, 'fixtures')
const port = Number(process.argv[2] ?? 6180)

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const asFixture = url.pathname.startsWith('/fixtures/')
  const base = asFixture ? fixtures : root
  const within = asFixture ? url.pathname.slice('/fixtures'.length) : url.pathname
  const file = path.join(base, within === '/' ? 'index.html' : decodeURIComponent(within))
  if (!file.startsWith(base)) {
    response.writeHead(403).end()
    return
  }
  try {
    const body = readFileSync(file)
    response.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`)
})
