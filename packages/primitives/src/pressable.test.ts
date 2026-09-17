import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, createRef, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoPressable } from './pressable.ts'

test('value-level Pressable renders callback children and native-shaped props', () => {
  const html = renderToStaticMarkup(
    createElement(HozoPressable, {
      accessibilityLabel: 'Save draft',
      accessibilityRole: 'button',
      dataSet: { intent: 'save' },
      onPress() {},
      style: ({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.5 }],
      // biome-ignore lint/correctness/noChildrenProp: a render prop is not a ReactNode argument.
      children: ({ hovered, pressed }) => `${hovered}:${pressed}`,
    }),
  )

  assert.match(html, /^<div/)
  assert.match(html, /role="button"/)
  assert.match(html, /aria-label="Save draft"/)
  assert.match(html, /data-intent="save"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /padding:4px/)
  assert.match(html, />false:false<\/div>$/)
})

test('a destination-bearing Pressable remains a semantic anchor', () => {
  const html = renderToStaticMarkup(
    createElement(HozoPressable, { external: true, href: 'https://example.com' }, 'Docs'),
  )
  assert.match(html, /^<a/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noreferrer noopener"/)
})

test('disabled removes activation and exposes both accessibility and styling state', () => {
  const html = renderToStaticMarkup(
    createElement(HozoPressable, { accessibilityRole: 'button', disabled: true, onPress() {} }),
  )
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
  assert.match(html, /tabindex="-1"/)
})

// #464 read `pressable.ts` as destructuring a `forwardedRef` prop that no
// type declares, since `git grep "forwardedRef?:"` finds no such prop. It is
// not a prop: it is the second parameter of the `forwardRef` render function,
// and what `forwardRef<HTMLElement, HozoPressableProps>` produces already
// accepts `ref?: Ref<HTMLElement>`. `ref` is the spelling a caller uses, and
// it works today.
//
// Kept as a test because that is the only way the claim stays true. This one
// is a compile-time proof and barely a runtime one: `tsconfig.test.json`
// covers `src/**/*` and `pnpm test` runs `tsc` before `node --test`, so a
// `ref` that left the type fails here rather than in somebody's application.
// Nothing in this suite has a DOM -- `renderToStaticMarkup` never attaches a
// ref -- so the assertion below is that the element renders with one passed,
// not that it was filled in.
test('Pressable takes a ref, which is what Dialog restoreFocusTo holds (#464)', () => {
  const opener = createRef<HTMLElement>()
  const html = renderToStaticMarkup(
    createElement(
      HozoPressable,
      { accessibilityRole: 'button', onPress() {}, ref: opener },
      'Continue',
    ),
  )
  assert.match(html, /^<div/)
  assert.match(html, />Continue<\/div>$/)

  // The case #464 raised: `Dialog`'s `restoreFocusTo` is
  // `RefObject<HTMLElement | null>` on the Web, and a caller wanting Hozo's
  // own Pressable to be the opener has to be able to hand it this ref. The
  // assignment is the whole test; it stops compiling the day `ref` is not on
  // Pressable.
  const restoreFocusTo: RefObject<HTMLElement | null> = opener
  assert.equal(restoreFocusTo.current, null)
})
