import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebView } from './index.tsx'

test('a web view is a named, lazily loaded iframe', () => {
  const html = renderToStaticMarkup(<WebView src="https://example.com/pay" title="Payment form" />)
  assert.equal(
    html,
    '<iframe src="https://example.com/pay" title="Payment form" loading="lazy"></iframe>',
  )
})

test('the iframe options pass through, and inline HTML takes the place of an address', () => {
  const html = renderToStaticMarkup(
    <WebView
      srcDoc="<p>Hello</p>"
      title="Preview"
      sandbox="allow-scripts"
      allow="clipboard-write"
      referrerPolicy="no-referrer"
      className="w-full h-96"
    />,
  )
  assert.match(html, /srcDoc="&lt;p&gt;Hello&lt;\/p&gt;"/, html)
  assert.match(html, /sandbox="allow-scripts"/, html)
  assert.match(html, /allow="clipboard-write"/, html)
  assert.match(html, /referrerPolicy="no-referrer"/, html)
  assert.match(html, /class="w-full h-96"/, html)
})
