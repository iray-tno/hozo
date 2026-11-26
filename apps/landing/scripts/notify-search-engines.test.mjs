import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  diffSitemaps,
  findIndexNowKey,
  MAX_PER_RUN,
  parseSitemap,
  submitGoogle,
  submitIndexNow,
} from './notify-search-engines.mjs'

const site = 'https://iray-tno.github.io/hozo'
const sitemap = (pages) =>
  `<?xml version="1.0"?>\n<urlset>\n${pages
    .map(
      ([page, lastmod]) =>
        `  <url><loc>${site}/${page}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')}\n</urlset>\n`

test('a sitemap is read as pages and their dates, with no date where there is none', () => {
  assert.deepEqual(
    [
      ...parseSitemap(
        sitemap([
          ['', '2026-11-24T05:00:00+09:00'],
          ['docs/', null],
        ]),
      ),
    ],
    [
      [`${site}/`, '2026-11-24T05:00:00+09:00'],
      [`${site}/docs/`, null],
    ],
  )
})

test('only new, redated and removed pages are sent', () => {
  const previous = parseSitemap(
    sitemap([
      ['', '2026-11-01T00:00:00Z'],
      ['docs/a/', '2026-11-01T00:00:00Z'],
      ['docs/gone/', '2026-11-01T00:00:00Z'],
    ]),
  )
  const next = parseSitemap(
    sitemap([
      ['', '2026-11-01T00:00:00Z'],
      ['docs/a/', '2026-11-25T00:00:00Z'],
      ['docs/new/', '2026-11-24T00:00:00Z'],
    ]),
  )
  const { basis, changes, skipped } = diffSitemaps(previous, next)
  assert.equal(basis, 'previous-sitemap')
  assert.deepEqual(changes, [
    { url: `${site}/docs/gone/`, type: 'URL_DELETED' },
    { url: `${site}/docs/a/`, type: 'URL_UPDATED' },
    { url: `${site}/docs/new/`, type: 'URL_UPDATED' },
  ])
  assert.deepEqual(skipped, [])
  assert.deepEqual(
    diffSitemaps(next, next).changes,
    [],
    'a redeploy of the same site sends nothing',
  )
})

test('the first dated sitemap after an undated one sends every page once', () => {
  const undated = parseSitemap(
    sitemap([
      ['', null],
      ['docs/', null],
    ]),
  )
  const dated = parseSitemap(
    sitemap([
      ['', '2026-10-01T00:00:00Z'],
      ['docs/', '2026-11-01T00:00:00Z'],
    ]),
  )
  assert.equal(diffSitemaps(undated, dated).changes.length, 2)
})

test('without a previous sitemap, only pages dated in the last week are sent', () => {
  const next = parseSitemap(
    sitemap([
      ['old/', '2026-10-01T00:00:00Z'],
      ['recent/', '2026-11-22T00:00:00Z'],
      ['undated/', null],
    ]),
  )
  const { basis, changes } = diffSitemaps(null, next, { now: new Date('2026-11-26T00:00:00Z') })
  assert.equal(basis, 'lastmod-within-7-days')
  assert.deepEqual(
    changes.map(({ url }) => url),
    [`${site}/recent/`],
  )
})

test('more than one run allows keeps the newest and names the rest', () => {
  const pages = Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => [
    `docs/p${String(i).padStart(3, '0')}/`,
    new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
  ])
  const { changes, skipped } = diffSitemaps(new Map(), parseSitemap(sitemap(pages)))
  assert.equal(changes.length, MAX_PER_RUN)
  assert.equal(changes[0].url, `${site}/docs/p${MAX_PER_RUN + 2}/`, 'newest first')
  assert.deepEqual(skipped, [`${site}/docs/p002/`, `${site}/docs/p001/`, `${site}/docs/p000/`])
})

test('the site publishes exactly one IndexNow key, and the file holds that key', () => {
  const key = findIndexNowKey(fileURLToPath(new URL('../public/', import.meta.url)))
  assert.match(key ?? '', /^[0-9a-f]{32}$/)
})

const recorder = (status = 200) => {
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) })
    return { ok: status >= 200 && status < 300, status, text: async () => 'body' }
  }
  return { calls, fetcher }
}

const changes = [
  { url: `${site}/docs/a/`, type: 'URL_UPDATED' },
  { url: `${site}/docs/gone/`, type: 'URL_DELETED' },
]

test('IndexNow gets one call naming the key file under the base path', async () => {
  const { calls, fetcher } = recorder(202)
  assert.match(
    await submitIndexNow(changes, 'k'.repeat(32), fetcher),
    /2 URL\(s\) accepted \(202\)/,
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].body, {
    host: 'iray-tno.github.io',
    key: 'k'.repeat(32),
    keyLocation: `https://iray-tno.github.io/hozo/${'k'.repeat(32)}.txt`,
    urlList: [`${site}/docs/a/`, `${site}/docs/gone/`],
  })
  assert.equal(await submitIndexNow([], 'k', fetcher), 'IndexNow: nothing to send')
})

test('Google gets one call per URL, and stops at the quota without failing', async () => {
  const ok = recorder(200)
  assert.equal(
    await submitGoogle(changes, 'token', ok.fetcher),
    'Google Indexing API: 2 URL(s) sent',
  )
  assert.deepEqual(
    ok.calls.map(({ body }) => body),
    changes,
  )
  assert.equal(ok.calls[0].headers.Authorization, 'Bearer token')
  const limited = recorder(429)
  assert.match(
    await submitGoogle(changes, 'token', limited.fetcher),
    /^::warning::.*quota reached after 0 of 2/,
  )
  assert.equal(limited.calls.length, 1, 'no calls after the quota is spent')
})
