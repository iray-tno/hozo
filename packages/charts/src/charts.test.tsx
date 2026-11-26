import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarChart, DEFAULT_PALETTE, LineChart, NO_VALUE } from './index.tsx'

const data = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null },
  { month: 'Mar', online: 90, store: 60 },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store', color: '#123456' },
]

test('a Bar chart draws one rect per value, in the series colours, at a fixed width', () => {
  const html = renderToStaticMarkup(
    <BarChart
      accessibilityLabel="Sales"
      data={data}
      x={{ key: 'month' }}
      series={series}
      width={320}
      height={200}
    />,
  )
  assert.match(html, /<svg[^>]*width="320"[^>]*height="200"/)
  assert.match(html, /aria-label="Sales"/)
  const rects = [...html.matchAll(/<rect [^>]*fill="([^"]+)"/g)].map((match) => match[1])
  assert.equal(rects.length, 5, 'no rect for the missing February value')
  assert.equal(rects.filter((fill) => fill === DEFAULT_PALETTE[0]).length, 3)
  assert.equal(rects.filter((fill) => fill === '#123456').length, 2)
  for (const label of ['Jan', 'Feb', 'Mar', '0', '200'])
    assert.match(html, new RegExp(`>${label}</text>`))
})

test('a Line chart draws a broken path at the gap, and dots only when asked', () => {
  const props = {
    accessibilityLabel: 'Sales',
    data,
    x: { key: 'month' },
    series,
    width: 320,
    height: 200,
  }
  const plain = renderToStaticMarkup(<LineChart {...props} />)
  const paths = [...plain.matchAll(/<path [^>]*d="([^"]+)"/g)].map((match) => match[1] as string)
  assert.equal(paths.length, 2)
  assert.equal(paths[1]?.split('M').length, 3, 'the store line is two segments')
  assert.doesNotMatch(plain, /<circle/)
  const dotted = renderToStaticMarkup(<LineChart {...props} points />)
  assert.equal([...dotted.matchAll(/<circle/g)].length, 5)
})

test('without a width the server draws nothing until the box is measured', () => {
  const html = renderToStaticMarkup(
    <BarChart
      accessibilityLabel="Sales"
      data={data}
      x={{ key: 'month' }}
      series={series}
      height={200}
    />,
  )
  assert.doesNotMatch(html, /<svg/)
  assert.match(html, /height:200px/)
  assert.match(html, /<table aria-label="Sales">/, 'the table does not wait for the measurement')
})

test('a reader gets the named table of the data, and the drawing is hidden from it', () => {
  const html = renderToStaticMarkup(
    <BarChart
      accessibilityLabel="Sales"
      data={data}
      x={{ key: 'month', label: 'Month' }}
      y={{ format: (value) => `$${value}` }}
      series={series}
      width={320}
      height={200}
    />,
  )
  assert.match(html, /<div aria-hidden="true"[^>]*><svg/, 'the drawing sits inside aria-hidden')
  const table = html.slice(html.indexOf('<table'))
  const cells = [...table.matchAll(/<t[hd][^>]*>([^<]*)<\/t[hd]>/g)].map((match) => match[1])
  assert.deepEqual(cells, [
    'Month',
    'Online',
    'In store',
    'Jan',
    '$120',
    '$80',
    'Feb',
    '$200',
    NO_VALUE,
    'Mar',
    '$90',
    '$60',
  ])
  assert.match(table, /<th scope="row">Jan<\/th>/)
  assert.match(html, /position:absolute;width:1px;height:1px/, 'hidden from sight by default')
  const shown = renderToStaticMarkup(
    <BarChart
      accessibilityLabel="Sales"
      data={data}
      x={{ key: 'month' }}
      series={series}
      width={320}
      height={200}
      showTable
    />,
  )
  // The live region is hidden either way; the table only by default.
  const hidden = (markup: string) => markup.split('position:absolute;width:1px').length - 1
  assert.equal(hidden(html), 2)
  assert.equal(hidden(shown), 1, 'showTable puts the table on screen')
  assert.match(shown, /<th scope="col">Category<\/th>/, 'a default header when x has no label')
})

test('the drawing is one named tab stop, with a polite live region beside it', () => {
  const html = renderToStaticMarkup(
    <LineChart
      accessibilityLabel="Trend"
      data={data}
      x={{ key: 'month' }}
      series={series}
      width={320}
      height={200}
    />,
  )
  assert.match(
    html,
    /<div role="group" aria-roledescription="chart" aria-label="Trend" tabindex="0"/,
  )
  assert.match(html, /aria-live="polite" aria-atomic="true"/)
  assert.ok(
    html.indexOf('tabindex') < html.indexOf('aria-hidden="true"'),
    'the hidden drawing is inside the tab stop',
  )
})

test('the default palette keeps 3:1 against white and near-black', () => {
  const luminance = (hex: string) => {
    const channel = (i: number) => {
      const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  }
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  for (const color of DEFAULT_PALETTE) {
    assert.ok(contrast(luminance(color), 1) >= 3, `${color} on white`)
    assert.ok(contrast(luminance(color), luminance('#0a0a0a')) >= 3, `${color} on #0a0a0a`)
  }
})
