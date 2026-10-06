import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadShowcaseRelease, selectShowcaseRelease } from '../src/lib/showcase-release.ts'

const repo = 'https://github.com/iray-tno/hozo'
function release(tag = 'v0.2.1', date = '2026-10-06T00:00:00Z') {
  return {
    tag_name: tag,
    draft: false,
    prerelease: true,
    published_at: date,
    html_url: `${repo}/releases/tag/${tag}`,
    assets: [
      `hozo-showcase-${tag}-android.apk`,
      `hozo-showcase-${tag}-ios-simulator.app.zip`,
      'INSTALL.md',
      'SHA256SUMS',
      'showcase-manifest.json',
    ].map((name) => ({
      name,
      state: 'uploaded',
      size: 123,
      browser_download_url: `${repo}/releases/download/${tag}/${name}`,
    })),
  }
}

test('a published prerelease with all five assets supplies pinned, same-release links', () => {
  const result = selectShowcaseRelease([release()])!
  assert.equal(result.tag, 'v0.2.1')
  assert.equal(result.android, `${repo}/releases/download/v0.2.1/hozo-showcase-v0.2.1-android.apk`)
  assert.equal(
    result.ios,
    `${repo}/releases/download/v0.2.1/hozo-showcase-v0.2.1-ios-simulator.app.zip`,
  )
  assert.equal(result.instructions, `${repo}/releases/download/v0.2.1/INSTALL.md`)
})

test('package-only releases, drafts, unfinished uploads and missing files never advertise downloads', () => {
  assert.equal(selectShowcaseRelease(undefined), undefined)
  assert.equal(selectShowcaseRelease({}), undefined)
  assert.equal(selectShowcaseRelease([null, 'bad', {}]), undefined)
  assert.equal(selectShowcaseRelease([{ ...release(), draft: true }]), undefined)
  assert.equal(selectShowcaseRelease([{ ...release(), published_at: null }]), undefined)
  assert.equal(selectShowcaseRelease([{ ...release(), assets: [] }]), undefined)
  for (let index = 0; index < 5; index++) {
    const missing = release()
    missing.assets.splice(index, 1)
    assert.equal(selectShowcaseRelease([missing]), undefined)
    for (const invalid of [
      { size: 0 },
      { state: 'new' },
      { browser_download_url: 'https://example.com/file' },
      { browser_download_url: `${repo}/releases/download/v0.1.0/file` },
    ]) {
      const bad = release()
      Object.assign(bad.assets[index], invalid)
      assert.equal(selectShowcaseRelease([bad]), undefined)
    }
  }
})

test('ambiguous names and foreign releases fail closed; selection uses publication date, not API order', () => {
  const duplicate = release()
  duplicate.assets.push(duplicate.assets[0])
  assert.equal(selectShowcaseRelease([duplicate]), undefined)
  assert.equal(
    selectShowcaseRelease([{ ...release(), html_url: 'https://example.com' }]),
    undefined,
  )
  assert.equal(selectShowcaseRelease([{ ...release(), tag_name: '../unsafe' }]), undefined)
  const older = release('v0.2.1', '2026-10-01T00:00:00Z')
  const newer = release('v0.2.2', '2026-10-06T00:00:00Z')
  assert.equal(selectShowcaseRelease([older, newer])?.tag, 'v0.2.2')
  assert.equal(selectShowcaseRelease([{ ...newer, assets: [] }, older])?.tag, 'v0.2.1')
})

test('offline builds make no request; discovery is bounded and HTTP/network/malformed failures retain the fallback', async () => {
  assert.equal(
    await loadShowcaseRelease({ enabled: false, fetcher: async () => assert.fail('offline') }),
    undefined,
  )
  let calls = 0
  const fetcher: typeof fetch = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.github.com/repos/iray-tno/hozo/releases?per_page=20')
    assert.ok(options?.signal)
    return new Response(JSON.stringify([release()]))
  }
  assert.equal((await loadShowcaseRelease({ enabled: true, fetcher }))?.tag, 'v0.2.1')
  assert.equal(calls, 1)
  for (const broken of [
    async () => new Response('{}', { status: 403 }),
    async () => new Response('invalid JSON'),
    async () => {
      throw new Error('network')
    },
  ])
    assert.equal(await loadShowcaseRelease({ enabled: true, fetcher: broken }), undefined)
})

test('Pages refreshes after successful tag releases, not dry runs or failures, and builds trusted main', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/deploy-pages.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /workflow_run:\s+workflows: \[release\]\s+types: \[completed\]/)
  assert.match(
    workflow,
    /workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.event == 'push'/,
  )
  assert.match(workflow, /actions\/checkout@v4\s+with:\s+ref: main/)
  assert.match(workflow, /HOZO_SHOWCASE_DOWNLOADS: '1'/)
})
