// Checks the three things the Astro getting-started page promises: static
// components ship HTML and CSS and no JavaScript, an island hydrates, and
// an MDX page can use primitives inline.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

// Named by `pnpm test`, so that it is not the directory the `build` task is
// writing beside it (#322).
const out = process.argv[2] ?? 'dist'
const files = filesUnder(out).map((file) => ({ file, content: readFileSync(file, 'utf8') }))
const read = (page) => readFileSync(path.join(out, page), 'utf8')
const scripts = files.filter(({ file }) => file.endsWith('.js'))
const styles = files
  .filter(({ file }) => /\.(?:css|html)$/.test(file))
  .map(({ content }) => content)
  .join('\n')

const failures = []
const expect = (ok, message) => ok || failures.push(message)

const index = read('index.html')
expect(/<h1 class="hozo-[^"]+">Hozo \+ Astro<\/h1>/.test(index), 'Welcome did not lower to an <h1>')
expect(
  /<button class="hozo-[^"]+" type="button" aria-label="Add one"/.test(index),
  'Counter did not lower to a labelled <button>',
)
expect(/<astro-island[^>]+component-export="Counter"/.test(index), 'Counter is not an island')
expect(
  styles.includes('oklch(62% .19 258)'),
  "the theme's --color-brand never reached the CSS: `css` was not read",
)
expect(
  scripts.some(({ content }) => content.includes('Pressed')),
  'no client chunk carries Counter, so the island has nothing to hydrate',
)
expect(
  !scripts.some(({ content }) => content.includes('Primitives compiled to semantic HTML')),
  'Welcome reached the client, though nothing asked for it',
)
expect(
  !scripts.some(({ content }) => content.includes('@hozo/core')),
  'a client chunk still imports @hozo/core',
)

const notes = read('notes/index.html')
expect(/<h2 class="hozo-[^"]+">Primitives in MDX<\/h2>/.test(notes), 'the MDX page did not lower')
expect(!notes.includes('<script'), 'the MDX page shipped a script')

if (failures.length > 0) {
  for (const failure of failures) console.error(`[astro-demo] ${failure}`)
  process.exit(1)
}
console.log('[astro-demo] static HTML, an island, and MDX: all lowered')
