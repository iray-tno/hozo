// Tell search engines which docs pages a deploy changed, so they need not
// wait for a crawl to find out.
//
//   node notify-search-engines.mjs prepare --built dist/sitemap.xml --live <url> --out <dir>
//   node notify-search-engines.mjs submit --changes <dir>/changes.json [--dry-run]
//
// `prepare` runs in the build, before the deploy replaces the live site: the
// live sitemap is then the previous one, and comparing its `<lastmod>`s with
// the new build's gives the pages that changed. `submit` runs after a
// successful deploy and sends that list to
//
//   * IndexNow (Bing, Yandex, Naver, Seznam and others), always. Its key is
//     public by design -- a file on the site proves the site owns it -- so
//     nothing here is secret.
//   * Google's Indexing API, only when `GOOGLE_ACCESS_TOKEN` is set. The
//     workflow mints that token through OIDC (workload identity federation),
//     so no long-lived key exists anywhere. Google documents this API for job
//     postings and livestreams; for other pages it may ignore the request or
//     withdraw access, which costs the notification and nothing else.
//
// Nothing here can fail a deploy: every problem is a warning and the exit
// code is 0. The site is already live by the time this runs.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Google allows 200 publish calls a day; leave room for a second deploy. */
export const MAX_PER_RUN = 100
/** Without a readable previous sitemap, pages dated within this many days. */
export const FALLBACK_DAYS = 7

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
const GOOGLE_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish'

/**
 * The pages a sitemap lists, each with its `<lastmod>` or null.
 *
 * @param {string} xml
 * @returns {Map<string, string | null>}
 */
export function parseSitemap(xml) {
  const pages = new Map()
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(body)?.[1]
    if (!loc) continue
    pages.set(loc, /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(body)?.[1] ?? null)
  }
  return pages
}

/**
 * What changed between the live sitemap and the new one.
 *
 * A page is updated when it is new or its `<lastmod>` moved; deleted when it
 * is gone. With no previous sitemap (`previous` null), only pages dated in the
 * last `FALLBACK_DAYS` count, so an unreachable site cannot turn one deploy
 * into a resubmission of everything. At most `max` are kept, newest first,
 * and the rest are reported as skipped rather than silently dropped.
 *
 * @param {Map<string, string | null> | null} previous
 * @param {Map<string, string | null>} next
 * @param {{ max?: number, now?: Date }} [options]
 */
export function diffSitemaps(previous, next, options = {}) {
  const max = options.max ?? MAX_PER_RUN
  const now = options.now ?? new Date()
  const since = now.getTime() - FALLBACK_DAYS * 24 * 60 * 60 * 1000
  const updated = [...next]
    .filter(([loc, lastmod]) => {
      if (previous) return !previous.has(loc) || previous.get(loc) !== lastmod
      return lastmod !== null && Date.parse(lastmod) >= since
    })
    .sort(
      ([a, x], [b, y]) =>
        (Date.parse(y ?? '') || 0) - (Date.parse(x ?? '') || 0) || (a < b ? -1 : 1),
    )
    .map(([loc]) => loc)
  const deleted = previous ? [...previous.keys()].filter((loc) => !next.has(loc)).sort() : []
  const all = [
    ...deleted.map((url) => ({ url, type: 'URL_DELETED' })),
    ...updated.map((url) => ({ url, type: 'URL_UPDATED' })),
  ]
  return {
    basis: previous ? 'previous-sitemap' : `lastmod-within-${FALLBACK_DAYS}-days`,
    changes: all.slice(0, max),
    skipped: all.slice(max).map(({ url }) => url),
  }
}

/** The IndexNow key: the one `<32 hex>.txt` file the site publishes. */
export function findIndexNowKey(publicDir) {
  const keys = readdirSync(publicDir)
    .map((name) => /^([0-9a-f]{32})\.txt$/.exec(name)?.[1])
    .filter(Boolean)
  if (keys.length !== 1) return undefined
  const key = keys[0]
  return readFileSync(path.join(publicDir, `${key}.txt`), 'utf8').trim() === key ? key : undefined
}

/**
 * @param {{ url: string, type: string }[]} changes
 * @param {string} key
 * @param {typeof fetch} fetcher
 */
export async function submitIndexNow(changes, key, fetcher = fetch) {
  if (changes.length === 0) return 'IndexNow: nothing to send'
  const first = new URL(changes[0].url)
  // The key file sits under the site's base path, which also scopes the URLs
  // it may vouch for: every URL here is under it.
  const base = first.pathname.split('/').slice(0, 2).join('/')
  const response = await fetcher(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: first.host,
      key,
      keyLocation: `${first.origin}${base}/${key}.txt`,
      urlList: changes.map(({ url }) => url),
    }),
  })
  // 200 accepted, 202 accepted and the key is still being checked.
  return response.ok
    ? `IndexNow: ${changes.length} URL(s) accepted (${response.status})`
    : `::warning::IndexNow answered ${response.status}: ${(await response.text()).slice(0, 200)}`
}

/**
 * One call per URL: the batch endpoint is gone. A 429 means the day's quota
 * is spent, so the rest wait for the next deploy rather than fail one by one.
 *
 * @param {{ url: string, type: string }[]} changes
 * @param {string} token
 * @param {typeof fetch} fetcher
 */
export async function submitGoogle(changes, token, fetcher = fetch) {
  let sent = 0
  for (const change of changes) {
    const response = await fetcher(GOOGLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(change),
    })
    if (response.status === 429)
      return `::warning::Google Indexing API quota reached after ${sent} of ${changes.length}`
    if (!response.ok)
      return `::warning::Google Indexing API answered ${response.status} after ${sent} of ${changes.length}: ${(await response.text()).slice(0, 200)}`
    sent++
  }
  return `Google Indexing API: ${sent} URL(s) sent`
}

function option(args, name) {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

async function prepare(args) {
  const built = option(args, '--built')
  const live = option(args, '--live')
  const out = option(args, '--out')
  if (!built || !live || !out) throw new Error('prepare needs --built, --live and --out')
  let previous = null
  try {
    const response = await fetch(live)
    if (response.ok) previous = parseSitemap(await response.text())
    else console.log(`::warning::the live sitemap answered ${response.status}`)
  } catch (error) {
    console.log(`::warning::could not read the live sitemap: ${error.message}`)
  }
  const result = diffSitemaps(previous, parseSitemap(readFileSync(built, 'utf8')))
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'changes.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(
    `${result.changes.length} change(s) found by ${result.basis}; ${result.skipped.length} skipped`,
  )
}

async function submit(args) {
  const file = option(args, '--changes')
  if (!file) throw new Error('submit needs --changes')
  const { changes, skipped } = JSON.parse(readFileSync(file, 'utf8'))
  if (skipped.length)
    console.log(
      `::warning::${skipped.length} change(s) over the per-run limit were not sent: ${skipped.join(' ')}`,
    )
  for (const { type, url } of changes) console.log(`${type} ${url}`)
  if (args.includes('--dry-run')) return console.log('dry run: nothing sent')
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  const key = findIndexNowKey(publicDir)
  console.log(
    key ? await submitIndexNow(changes, key) : '::warning::no IndexNow key file in public/',
  )
  const token = process.env.GOOGLE_ACCESS_TOKEN
  console.log(
    token ? await submitGoogle(changes, token) : 'Google Indexing API: not configured, skipped',
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'prepare') await prepare(args)
    else if (command === 'submit') await submit(args)
    else throw new Error(`unknown command ${command ?? '(none)'}: use prepare or submit`)
  } catch (error) {
    // The deploy has happened or will happen regardless; say what broke.
    console.log(`::warning::search engine notification failed: ${error.message}`)
  }
}
