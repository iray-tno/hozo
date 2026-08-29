// The search, checked.
//
// `buildVariantCatalog` takes minutes, so the part of it that decides
// whether a candidate was found at all cannot be verified by running it --
// and when that part is wrong the failure is silent by construction: a
// candidate whose rule is not found is dropped for producing none, the
// total goes down, and the report says "0 mismatches" about a smaller set
// than it did yesterday.
//
// That happened. Nine variants -- every one with a bracket in its name,
// plus `*` and `**` -- were missing from the denominator at once, because
// one function was doing two escapes.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classNamesIn } from './extract.ts'
import { classNamePattern, cssClassName } from './variants.ts'

test('a class name is escaped the way Tailwind writes it', () => {
  // One backslash, because that is what is in the stylesheet.
  assert.equal(cssClassName('hover:flex'), 'hover\\:flex')
  assert.equal(cssClassName('nth-[2n+1]:flex'), 'nth-\\[2n\\+1\\]\\:flex')
  assert.equal(cssClassName('*:flex'), '\\*\\:flex')
  assert.equal(cssClassName('@sm/main:flex'), '\\@sm\\/main\\:flex')
  // Word characters and hyphens are not escaped, which is most of a name.
  assert.equal(cssClassName('motion-safe'), 'motion-safe')
})

test('a leading digit is written as a code point, not a backslash', () => {
  // CSS cannot start an identifier with a digit, so a backslash does not
  // help: the character becomes its hex code point followed by a space
  // that terminates it. `2xl` is a default Tailwind breakpoint, and it is
  // the only variant in this file that starts with one.
  assert.equal(cssClassName('2xl:flex'), '\\32 xl\\:flex')
  assert.equal(cssClassName('2xl:hover:flex'), '\\32 xl\\:hover\\:flex')
  // Only when it leads. `hover:2xl:flex` starts with an `h`, and that is
  // exactly why the hole stayed open: the coverage guard is per variant,
  // so a stacked case marked `2xl` covered while every candidate with it
  // in front was missing.
  assert.equal(cssClassName('hover:2xl:flex'), 'hover\\:2xl\\:flex')
})

test('a code point escape is one name, not a name that stops at the digits', () => {
  // The half that actually emptied the bucket. Reading `\\` plus one
  // character as a unit ends the name at `\\32`, so `.\\32 xl\\:flex` was
  // indexed under `\\32` -- a key nothing looks up -- and 261 cases were
  // dropped for producing no rule.
  assert.deepEqual(classNamesIn('.\\32 xl\\:flex'), ['\\32 xl\\:flex'])
  assert.deepEqual(classNamesIn('.hover\\:flex'), ['hover\\:flex'])
  // The pattern has to find what the index stores, or the fix is half a fix.
  const selector = `.${cssClassName('2xl:flex')}`
  assert.match(selector, new RegExp(classNamePattern('2xl:flex')))
})

test('the pattern finds that name and is not read as syntax', () => {
  // The bug, one case per character that means something to a regex.
  // `\\[` opened a character class; `\\*` and `\\+` were quantifiers on
  // the backslash. Each of these matched nothing at all.
  for (const candidate of [
    'hover:flex',
    'nth-[2n+1]:flex',
    'data-[state=open]:flex',
    'has-[:focus]:flex',
    'supports-[display:grid]:flex',
    'min-[500px]:flex',
    '@min-[400px]:flex',
    '*:flex',
    '**:flex',
  ]) {
    const selector = `.${cssClassName(candidate)}`
    assert.match(selector, new RegExp(classNamePattern(candidate)), candidate)
  }
})

test('the pattern is anchored to the whole name', () => {
  // `*` matching `**` would put one variant's rules in the other's case,
  // which is worse than finding nothing: it would compare two different
  // selectors and call the difference a mismatch.
  const single = new RegExp(`\\.${classNamePattern('*:flex')}(?![\\w-])`)
  assert.ok(!single.test(`.${cssClassName('**:flex')}`))
  const short = new RegExp(`\\.${classNamePattern('sm:flex')}(?![\\w-])`)
  assert.ok(!short.test(`.${cssClassName('sm:flex-col')}`))
})
