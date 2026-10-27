import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, type Plugin } from 'vite'
import { hozo } from './index.ts'

const source = (classes = 'p-4 p-2') =>
  `import {View} from '@hozo/core';export const App=()=> <View className="${classes}"/>`
function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-default-order-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'entry.tsx'), source())
  writeFileSync(path.join(root, 'tokens.css'), '@theme {--spacing:.25rem;} @tailwind utilities;')
  return root
}
async function tinyBuild(root: string, extra: Plugin[] = []) {
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [hozo({ root, css: 'tokens.css' }), ...extra],
    build: {
      write: false,
      lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], cssFileName: 'fixture' },
      rolldownOptions: { external: ['react/jsx-runtime'] },
    },
  })
}
function assetCss(output) {
  return (Array.isArray(output) ? output : [output])
    .flatMap(({ output }) => output)
    .filter((asset) => asset.type === 'asset' && asset.fileName.endsWith('.css'))
    .map((asset) => String(asset.source))
    .join('\n')
}

test('default production assets contain the shared scalar winner in both class orders without shadow publication', async (t) => {
  const root = fixture(t)
  for (const classes of ['p-4 p-2', 'p-2 p-4']) {
    writeFileSync(path.join(root, 'entry.tsx'), source(classes))
    const output = await tinyBuild(root)
    assert.match(readFileSync(path.join(root, 'entry.tsx.hozo.css'), 'utf8'), /padding-top: 16px/)
    assert.match(assetCss(output), /padding(?:-top)?:16px/)
    assert.doesNotMatch(assetCss(output), /padding(?:-top)?:8px/)
    assert.equal(existsSync(path.join(root, 'node_modules/.hozo/final-styles-client.json')), false)
    assert.doesNotMatch(JSON.stringify(output), /scalar-order-v\d+:|nativePlanFingerprint/)
  }
})

test('cached source facts do not prevent CSS epoch replacement or preserve removed module styles', async (t) => {
  const root = fixture(t)
  writeFileSync(path.join(root, 'other.tsx'), source('w-8 w-4').replaceAll('App', 'Other'))
  writeFileSync(path.join(root, 'entry.tsx'), `export {Other} from './other';${source()}`)
  assert.match(assetCss(await tinyBuild(root)), /width:32px/)
  writeFileSync(path.join(root, 'entry.tsx'), source())
  writeFileSync(path.join(root, 'tokens.css'), '@theme {--spacing:.5rem;} @tailwind utilities;')
  const next = assetCss(await tinyBuild(root))
  assert.match(next, /padding(?:-top)?:32px/)
  assert.doesNotMatch(next, /width:32px/)
})

test('actual transformed query modules publish their scalar winners during transform', async (t) => {
  const root = fixture(t)
  writeFileSync(path.join(root, 'post.mdx'), '# not JSX')
  writeFileSync(
    path.join(root, 'entry.tsx'),
    `export {App as Other} from './post.mdx?variant';${source()}`,
  )
  const output = await tinyBuild(root, [
    {
      name: 'produce-mdx',
      enforce: 'pre',
      transform(_code, id) {
        if (id.split('?')[0]!.endsWith('post.mdx')) return source('w-8 w-4')
      },
    },
  ])
  assert.match(assetCss(output), /width:32px/)
  assert.doesNotMatch(assetCss(output), /width:16px/)
})

test('snapshot-unavailable lowering remains warned and does not reuse prior ordered output', async (t) => {
  const root = fixture(t)
  await tinyBuild(root)
  writeFileSync(path.join(root, 'tokens.css'), '@import "./missing.css";')
  assert.match(assetCss(await tinyBuild(root)), /padding(?:-top)?:8px/)
})

test('late bundle errors remain failures; there is no shadow certificate to mistake for success', async (t) => {
  const root = fixture(t)
  await assert.rejects(
    tinyBuild(root, [
      {
        name: 'late-output-error',
        generateBundle() {
          throw new Error('late output failed')
        },
      },
    ]),
    /late output failed/,
  )
})
