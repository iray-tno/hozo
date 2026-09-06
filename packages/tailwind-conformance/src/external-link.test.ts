// The two implementations of what `external` means, compared.
//
// `external` is Hozo's own spelling, not the DOM's: it stands for a
// `target="_blank"` and a `rel` that severs `window.opener`, so the page
// that opens cannot navigate the one it came from. That derivation exists
// twice -- in `@hozo/runtime`'s `externalLinkAttributes`, which is what
// `@hozo/core`'s `Button` and `@hozo/typography`'s `Link` render through
// when a project has not turned the compiler on, and in `hozo_web`, which
// is what a project that has gets instead.
//
// It existed once until now. The Web backend passed `external` through as
// a raw attribute and emitted neither `target` nor `rel`, so the compiled
// half of a component was missing a security property its uncompiled half
// had, silently, with no diagnostic (#290).
//
// A three-line rule in two languages is a rule that will be changed in
// one of them. This compiles each shape, renders it, and asks the other
// implementation what it should have got.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile } from '@hozo/compiler'
import { externalLinkAttributes } from '@hozo/runtime'

import { renderWeb } from './render.ts'

/**
 * A case, written as the author would write it.
 *
 * `props` is the JSX; the three fields beside it are the same thing as
 * `externalLinkAttributes` takes, so the two implementations are being
 * given one input rather than two that a reader has to check agree.
 */
interface Case {
  props: string
  external?: boolean
  target?: string
  rel?: string
}

const STATIC: Case[] = [
  { props: '' },
  { props: 'external', external: true },
  { props: 'external={true}', external: true },
  { props: 'external={false}', external: false },
  { props: 'external rel="me"', external: true, rel: 'me' },
  // `external` and a `target` that says otherwise. One of them has to
  // win; `external` does, in both implementations, and this is here so
  // that stays a decision rather than a coincidence.
  { props: 'external target="_self"', external: true, target: '_self' },
  { props: 'target="_blank"', target: '_blank' },
  { props: 'target="_self"', target: '_self' },
  { props: 'target="_blank" rel="me"', target: '_blank', rel: 'me' },
]

/** The `target` and `rel` a rendered anchor ended up with. */
function anchor(html: string) {
  return {
    target: /target="([^"]*)"/.exec(html)?.[1],
    rel: /rel="([^"]*)"/.exec(html)?.[1],
  }
}

function compiledAnchor(props: string, scope: Record<string, unknown> = {}) {
  const source = `
    import { Link } from '@hozo/core'
    export function C({ leaves, where }) {
      return <Link href="https://example.com" ${props}>Docs</Link>
    }
  `
  const [web] = compile(source, 'C.tsx')
  if (web === undefined) throw new Error(`nothing compiled for: ${props}`)
  const [rendered] = renderWeb([{ name: 'C', jsx: web.jsx }], scope)
  if (rendered === undefined) throw new Error(`nothing rendered for: ${props}`)
  return { html: rendered.html, ...anchor(rendered.html) }
}

for (const testCase of STATIC) {
  test(`the backend and the runtime agree on <Link ${testCase.props || 'href>'}`, () => {
    const compiled = compiledAnchor(testCase.props)
    const expected = externalLinkAttributes(testCase.external, testCase.target, testCase.rel)
    assert.deepEqual(
      { target: compiled.target, rel: compiled.rel },
      { target: expected.target, rel: expected.rel },
      compiled.html,
    )
  })
}

test('external is consumed rather than emitted', () => {
  // It is Hozo's word, not the DOM's, and the compiler used to emit it
  // as an attribute anyway.
  //
  // Asserted on the generated JSX rather than on the rendered HTML,
  // because React drops an unknown prop whose value is `true` before it
  // reaches the document -- so the rendered markup looked clean while
  // the generated file carried `<a href="..." external>`. The attribute
  // was never the harm; the missing `rel` was. This keeps the output
  // honest, and the comparisons above are the ones that matter.
  for (const props of ['external', 'external={false}', 'external={leaves}']) {
    const source = `
      import { Link } from '@hozo/core'
      export function C({ leaves }) {
        return <Link href="https://example.com" ${props}>Docs</Link>
      }
    `
    const [web] = compile(source, 'C.tsx')
    assert.doesNotMatch((web as { jsx: string }).jsx, /\sexternal[=\s>]/, props)
  }
})

test('an external that is only known at runtime is carried rather than decided', () => {
  // Hozo's answer to an expression it cannot read is a ternary in the
  // output, not a guess and not a refusal -- the shape `focusable` and
  // `disabled` already use. Both branches are checked, because a rule
  // that only ever fired one way would pass a single-value test.
  for (const leaves of [true, false]) {
    const compiled = compiledAnchor('external={leaves}', { leaves, where: undefined })
    const expected = externalLinkAttributes(leaves, undefined, undefined)
    assert.deepEqual({ target: compiled.target, rel: compiled.rel }, expected, compiled.html)
  }
})

test('a target that is only known at runtime still earns its rel', () => {
  // The uncompiled half compares the value at render time, so a `_blank`
  // arriving through a variable gets the same `rel` as one written out.
  // The compiled half has to emit that comparison to match.
  for (const where of ['_blank', '_self']) {
    const compiled = compiledAnchor('target={where}', { where, leaves: undefined })
    const expected = externalLinkAttributes(undefined, where, undefined)
    assert.deepEqual({ target: compiled.target, rel: compiled.rel }, expected, compiled.html)
  }
})

test('a button that navigates gets the same treatment as a link', () => {
  // `<Button href>` lowers to the same element, through a different arm.
  const source = `
    import { Button } from '@hozo/core'
    export function C() {
      return <Button href="https://example.com" external>Docs</Button>
    }
  `
  const [web] = compile(source, 'C.tsx')
  const [rendered] = renderWeb([{ name: 'C', jsx: (web as { jsx: string }).jsx }])
  const html = (rendered as { html: string }).html
  assert.deepEqual(anchor(html), { target: '_blank', rel: 'noreferrer noopener' }, html)
  assert.match(html, /role="button"/, html)
})
