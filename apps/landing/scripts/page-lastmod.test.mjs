import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lastModified, parseGitLog } from './page-lastmod.mjs'

const log = [
  '',
  '2026-11-24T05:00:00+09:00\n\napps/landing/src/pages/index.astro\napps/landing/src/content/docs/docs/a.mdx\n',
  '2026-11-20T05:00:00+09:00\n\napps/landing/src/content/docs/docs/a.mdx\napps/landing/src/content/docs/docs/b.md\n',
  '2026-11-18T05:00:00+09:00\n\npackages/tailwind-conformance/snapshot.json\n',
].join('\0')

test('a path takes the date of the newest commit that touched it', () => {
  assert.deepEqual(
    [...parseGitLog(log)],
    [
      ['apps/landing/src/pages/index.astro', '2026-11-24T05:00:00+09:00'],
      ['apps/landing/src/content/docs/docs/a.mdx', '2026-11-24T05:00:00+09:00'],
      ['apps/landing/src/content/docs/docs/b.md', '2026-11-20T05:00:00+09:00'],
      ['packages/tailwind-conformance/snapshot.json', '2026-11-18T05:00:00+09:00'],
    ],
  )
})

const fakeGit = (shallow) => (args) => {
  if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return `${shallow}\n`
  if (args[0] === 'rev-parse' && args[1] === '--show-prefix') return 'apps/landing/\n'
  if (args[0] === 'log') return log
  throw new Error(`unexpected git ${args.join(' ')}`)
}

test('dates come back keyed by the paths as given, relative to the package', () => {
  const dates = lastModified(
    ['src/pages/index.astro', './src/content/docs/docs/b.md', 'src/pages/new.astro'],
    { git: fakeGit(false) },
  )
  assert.deepEqual(
    [...dates],
    [
      ['src/pages/index.astro', '2026-11-24T05:00:00+09:00'],
      ['./src/content/docs/docs/b.md', '2026-11-20T05:00:00+09:00'],
    ],
    'a file with no history yet has no date rather than a guessed one',
  )
})

test('a path outside the package, such as the data a page shows, is dated too', () => {
  const dates = lastModified(['../../packages/tailwind-conformance/snapshot.json'], {
    git: fakeGit(false),
  })
  assert.deepEqual(
    [...dates],
    [['../../packages/tailwind-conformance/snapshot.json', '2026-11-18T05:00:00+09:00']],
  )
})

test('a shallow clone or a missing git gives no dates, not wrong ones', () => {
  assert.equal(lastModified(['src/pages/index.astro'], { git: fakeGit(true) }).size, 0)
  const broken = () => {
    throw new Error('git: not found')
  }
  assert.equal(lastModified(['src/pages/index.astro'], { git: broken }).size, 0)
})

test('this checkout dates its own sources, unless it is shallow', () => {
  const dates = lastModified(['scripts/page-lastmod.mjs'], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  })
  // CI's ordinary checkout is shallow; a full clone has a real date.
  for (const date of dates.values()) assert.match(date, /^\d{4}-\d{2}-\d{2}T/)
})
