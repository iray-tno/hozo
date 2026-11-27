import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarChart, ChartThemeProvider, LineChart, Sparkline } from './index.tsx'
import { barChartModel } from './model.ts'
import { DEFAULT_PALETTE } from './palette.ts'
import { DEFAULT_THEME, mergeTheme, resolveTheme } from './theme.tsx'

const data = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: 60 },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
]
const props = {
  accessibilityLabel: 'Sales',
  data,
  x: { key: 'month' },
  series,
  width: 600,
  height: 240,
}
const pair = { light: ['#111111', '#222222'], dark: ['#aaaaaa', '#bbbbbb'] }
const barFills = (html: string) =>
  [...html.matchAll(/<path d="M[^"]*A[^"]*" fill="([^"]+)"/g)].map((match) => match[1])

test('one palette serves both schemes; a light and dark pair is picked by scheme', () => {
  const shared = ['#123456', '#654321']
  assert.deepEqual(resolveTheme({ palette: shared }, 'light').palette, shared)
  assert.deepEqual(resolveTheme({ palette: shared }, 'dark').palette, shared)
  assert.deepEqual(resolveTheme({ palette: pair }, 'light').palette, pair.light)
  assert.deepEqual(resolveTheme({ palette: pair }, 'dark').palette, pair.dark)
  assert.equal(resolveTheme({}, 'dark').palette, DEFAULT_PALETTE)
  assert.equal(resolveTheme({ palette: [] }, 'light').palette, DEFAULT_PALETTE, 'never no colours')
})

test('a theme changes only what it names, and an inner one goes on top', () => {
  const resolved = resolveTheme({ bar: { radius: 0 }, line: { width: undefined } }, 'light')
  assert.deepEqual(resolved.bar, { ...DEFAULT_THEME.bar, radius: 0 })
  assert.equal(resolved.line.width, DEFAULT_THEME.line.width, 'undefined keeps the default')
  const merged = mergeTheme({ palette: ['#000000'], bar: { gap: 0 } }, { bar: { maxWidth: 40 } })
  assert.deepEqual(merged.palette, ['#000000'])
  assert.deepEqual(merged.bar, { gap: 0, maxWidth: 40 })
})

test('bar shape reaches the model: thickness, gap and square ends', () => {
  const model = barChartModel({ ...props, bar: { maxWidth: 40, gap: 0 } })
  const [online, store] = model.marks.filter((mark) => mark.kind === 'bar')
  assert.ok(online?.kind === 'bar' && store?.kind === 'bar')
  assert.equal(online.width, 40)
  assert.ok(Math.abs(online.x + online.width - store.x) < 1e-9, 'no gap')
  const html = renderToStaticMarkup(<BarChart {...props} theme={{ bar: { radius: 0 } }} />)
  assert.match(html, /A0,0 /, 'a radius of 0 draws square corners')
})

test('a provider themes every chart inside it, and a chart theme goes on top', () => {
  const dark = renderToStaticMarkup(
    <ChartThemeProvider theme={{ palette: pair }} colorScheme="dark">
      <BarChart {...props} />
    </ChartThemeProvider>,
  )
  assert.deepEqual(barFills(dark), ['#aaaaaa', '#bbbbbb', '#aaaaaa', '#bbbbbb'])
  assert.match(dark, /<rect [^>]*rx="2" fill="#aaaaaa"/, 'the key agrees with the bars')
  const inner = renderToStaticMarkup(
    <ChartThemeProvider theme={{ palette: pair }} colorScheme="dark">
      <ChartThemeProvider colorScheme="light">
        <BarChart {...props} theme={{ line: { width: 3 } }} />
        <LineChart {...props} theme={{ palette: ['#ff0000', '#00ff00'], line: { width: 3 } }} />
      </ChartThemeProvider>
    </ChartThemeProvider>,
  )
  assert.deepEqual(barFills(inner).slice(0, 2), ['#111111', '#222222'], 'the inner scheme wins')
  assert.match(inner, /stroke="#ff0000" stroke-width="3"/, 'the chart palette wins')
  const named = renderToStaticMarkup(
    <BarChart
      {...props}
      series={[
        { key: 'online', label: 'Online', color: '#0000ff' },
        { key: 'store', label: 'In store' },
      ]}
      theme={{ palette: pair }}
    />,
  )
  assert.equal(barFills(named)[0], '#0000ff', "a series' own colour wins over every theme")
  assert.equal(barFills(named)[1], '#222222', 'the server renders light')
})

test('a sparkline takes the first colour of the theme', () => {
  const html = renderToStaticMarkup(
    <ChartThemeProvider theme={{ palette: ['#abcdef'] }}>
      <Sparkline accessibilityLabel="Visits" values={[1, 3, 2]} />
    </ChartThemeProvider>,
  )
  assert.match(html, /stroke="#abcdef"/)
})
