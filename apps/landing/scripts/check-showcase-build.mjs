import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// A separate output avoids collisions with turbo's ordinary app build/test.
// The mock catalogue is a prerelease: GitHub's `latest` endpoint omits it.
execFileSync(
  process.execPath,
  [
    '--import',
    './scripts/showcase-release-fixture.mjs',
    './node_modules/astro/bin/astro.mjs',
    'build',
    '--outDir',
    'dist-showcase-test',
  ],
  { cwd: root, env: { ...process.env, HOZO_SHOWCASE_DOWNLOADS: '1' }, stdio: 'inherit' },
)
const html = readFileSync(new URL('../dist-showcase-test/index.html', import.meta.url), 'utf8')
const tag = 'v0.2.1'
const base = `https://github.com/iray-tno/hozo/releases/download/${tag}`
for (const [name, text] of [
  [`hozo-showcase-${tag}-android.apk`, 'Download Android APK'],
  [`hozo-showcase-${tag}-ios-simulator.app.zip`, 'Download Simulator app'],
  ['INSTALL.md', 'Installation instructions'],
]) {
  assert.ok(
    html.includes(`href="${base}/${name}"`),
    `missing actual rendered release href: ${name}`,
  )
  assert.ok(html.includes(text), `missing action: ${text}`)
}
assert.ok(html.replaceAll('<!-- -->', '').includes(`${tag} release notes &amp; checksums`))
assert.ok(!html.includes('Check native releases'))
assert.equal((html.match(/<astro-island\b/g) ?? []).length, 1, 'downloads added a client island')
// Test the real rendered release actions, not an isolated JSX/text fixture.
execFileSync(process.execPath, ['scripts/check-landing.mjs', 'dist-showcase-test'], {
  cwd: root,
  stdio: 'inherit',
})
console.log(
  'Showcase release build: all pinned links rendered and responsive keyboard/actions checks passed (mock catalogue, no published files)',
)
