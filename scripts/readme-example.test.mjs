// The README shows a component and says the build writes the output below
// it, unedited. That is a claim about the compiler, so it is checked
// against the compiler: a change to lowering that moves a class hash or a
// declaration fails here, and the fix is to paste the new output in.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler } from '../packages/compiler/src/index.ts'
import { lowerModule } from '../packages/compiler/src/lower.ts'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const section = readme.slice(readme.indexOf('## What it does'), readme.indexOf('## Try it'))
const blocks = [...section.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map(([, lang, body]) => ({
  lang,
  body: body.trim(),
}))

test('the README example output is what the compiler writes', () => {
  const [source, html, css] = blocks
  assert.deepEqual(
    blocks.map(({ lang }) => lang),
    ['tsx', 'tsx', 'css'],
    'the README example is a source, its markup and its CSS, in that order',
  )
  const lowered = lowerModule(source.body, 'Welcome.tsx', 'Welcome.tsx', createCompiler(), '')
  assert.ok(lowered, 'the README example did not lower')
  const markup = lowered.code.match(/<section[\s\S]*<\/section>/)?.[0]
  assert.equal(html.body, markup, 'README markup differs from compiler output')
  // The README puts each rule on one line; only the whitespace differs.
  const rules = [...lowered.css.matchAll(/^(\.hozo-[^{]+)\{([^}]*)\}/gm)]
    .map(
      ([, selector, body]) =>
        `${selector.trim()} { ${body
          .trim()
          .split(/\s*\n\s*/)
          .join(' ')} }`,
    )
    .join('\n')
  assert.equal(css.body, rules, 'README CSS differs from compiler output')
})

// The docs' overview renders the same component, compiled when the site is
// built (apps/landing/src/examples/Welcome.tsx). One example, so the README
// and the docs cannot come to show two different things.
test('the docs render the README example, not a copy that drifted', () => {
  const docs = readFileSync(
    new URL('../apps/landing/src/examples/Welcome.tsx', import.meta.url),
    'utf8',
  )
  // Biome formats the file and not the README, so a JSX child may wrap
  // in one and not the other; whitespace is not what this is about.
  const words = (source) =>
    source.replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/\s+/g, ' ').trim()
  assert.equal(words(docs), words(blocks[0].body))
})
