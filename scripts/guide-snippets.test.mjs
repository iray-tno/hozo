import assert from 'node:assert/strict'
import test from 'node:test'
import { GUIDE_STARTERS, guideOutputProblems } from './check-packed-consumer.mjs'
import { BUILT_GUIDES, parseGuide, readGuide } from './guide-snippets.mjs'

test('a titled block is a file, an npm install block is a dependency, the rest is prose', () => {
  const guide = parseGuide(
    [
      '```sh',
      'npm install --save-dev @hozo/vite @hozo/compiler',
      'npm install @hozo/core react',
      '```',
      '',
      '```ts title="vite.config.ts"',
      'export default {}',
      '```',
      '',
      '```ts',
      'plugins: [hozo()] // a fragment, not a file',
      '```',
      '',
      '```sh',
      'npm run dev',
      '```',
    ].join('\n'),
  )
  assert.deepEqual(guide.files, [{ path: 'vite.config.ts', content: 'export default {}\n' }])
  assert.deepEqual(guide.devDependencies, ['@hozo/vite', '@hozo/compiler'])
  assert.deepEqual(guide.dependencies, ['@hozo/core', 'react'])
})

test('a file named twice is an error, not a silent overwrite', () => {
  const block = '```ts title="a.ts"\nx\n```\n'
  assert.throws(() => parseGuide(block + block), /a\.ts appears twice/)
})

// Offline, on every change: a guide edit that drops a title or the install
// line would otherwise go unnoticed until the weekly packed-consumer run.
const expected = {
  vite: ['vite.config.ts', 'src/theme.css', 'src/App.tsx'],
  astro: [
    'astro.config.mjs',
    'src/theme.css',
    'tsconfig.json',
    'src/components/Hello.tsx',
    'src/pages/index.astro',
  ],
}
for (const name of BUILT_GUIDES) {
  test(`the ${name} guide still describes a whole project`, () => {
    const guide = readGuide(name)
    assert.deepEqual(
      guide.files.map((file) => file.path),
      expected[name],
    )
    assert.ok(guide.dependencies.includes('@hozo/core'))
    assert.ok(guide.devDependencies.includes('@hozo/vite'))
    assert.ok(guide.devDependencies.includes('@hozo/compiler'))
    assert.ok(GUIDE_STARTERS[name], `${name} has no starter in check-packed-consumer.mjs`)
  })
}

test('guide output problems name what is missing', () => {
  const good = [
    { file: 'index.html', content: '<h1 class="hozo-x">Hi</h1>' },
    { file: 'a.css', content: '.hozo-x{color:oklch(62% .19 258)}' },
    { file: 'a.js', content: 'import{jsx}from"react/jsx-runtime"' },
  ]
  assert.deepEqual(guideOutputProblems(good), [])
  // Vite's bundle quotes the tag with backticks.
  assert.deepEqual(
    guideOutputProblems([...good.slice(1), { file: 'b.js', content: 'f.jsx(`h1`,{})' }]),
    [],
  )
  assert.deepEqual(
    guideOutputProblems([
      ...good.slice(0, 2),
      { file: 'a.js', content: 'import{View}from"@hozo/core"' },
    ]),
    ['a client chunk still imports @hozo/core'],
  )
  assert.equal(guideOutputProblems(good.slice(1)).length, 1)
  assert.equal(guideOutputProblems([good[0], good[2]]).length, 1)
})
