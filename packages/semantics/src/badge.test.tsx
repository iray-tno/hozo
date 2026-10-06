import assert from 'node:assert/strict'
import test from 'node:test'
import { HozoI18nProvider } from '@hozo/behaviors'
import { renderToStaticMarkup } from 'react-dom/server'

import { Badge, Meter, Skeleton } from './index.tsx'

test('a word badge is the word, in a span with no role', () => {
  const html = renderToStaticMarkup(<Badge className="b">Draft</Badge>)
  assert.equal(html, '<span class="b">Draft</span>')
})

test('a count draws the digit and is read as its label, without naming a span', () => {
  const html = renderToStaticMarkup(
    <Badge count={3} accessibilityLabel="3 unread messages" className="b" />,
  )
  // The digit is drawn and hidden from assistive technology; the sentence is
  // read and not drawn. No `aria-label` on the span, which ARIA prohibits.
  assert.match(html, /<span aria-hidden="true">3<\/span>/)
  assert.match(html, /3 unread messages<\/span>/)
  assert.doesNotMatch(html, /aria-label/)
})

test('above max the badge shows max+ and says so', () => {
  const html = renderToStaticMarkup(<Badge count={120} max={99} />)
  assert.match(html, /<span aria-hidden="true">99\+<\/span>/)
  assert.match(html, /more than 99<\/span>/)
})

test('the overflow sentence comes from the project’s i18n', () => {
  const html = renderToStaticMarkup(
    <HozoI18nProvider
      value={{
        translate: (key, params) => (key === 'hozo.badge.overflow' ? `${params.max}件以上` : ''),
      }}
    >
      <Badge count={120} max={99} />
    </HozoI18nProvider>,
  )
  assert.match(html, /99件以上<\/span>/)
})

test('a meter is the meter element with its range as written', () => {
  const html = renderToStaticMarkup(<Meter value={0.6} low={0.3} aria-label="Strength" />)
  assert.equal(html, '<meter value="0.6" low="0.3" aria-label="Strength"></meter>')
})

test('a skeleton is hidden from assistive technology and marked for the reduced-motion rule', () => {
  const html = renderToStaticMarkup(<Skeleton className="s" />)
  assert.equal(html, '<div class="s" aria-hidden="true" data-hozo-skeleton=""></div>')
})
