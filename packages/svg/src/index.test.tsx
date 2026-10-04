import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeColorMatrix, FeGaussianBlur, Filter, Svg } from './index.tsx'

test('filter fallback keeps chaining, bounds and correctly cased browser attributes', () => {
  assert.equal(Svg.Filter, Filter)
  assert.equal(Svg.FeColorMatrix, FeColorMatrix)
  assert.equal(Svg.FeGaussianBlur, FeGaussianBlur)
  const html = renderToStaticMarkup(
    <Svg viewBox="0 0 40 40">
      <Svg.Defs>
        <Svg.Filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <Svg.FeColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray" />
          <Svg.FeGaussianBlur in="gray" stdDeviation="2 3" edgeMode="none" />
        </Svg.Filter>
      </Svg.Defs>
      <Svg.Rect width={40} height={40} filter="url(#soft)" />
    </Svg>,
  )
  assert.match(html, /<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">/)
  assert.match(html, /<feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray">/)
  assert.match(html, /<feGaussianBlur in="gray" stdDeviation="2 3" edgeMode="none">/)
  assert.match(html, /filter="url\(#soft\)"/)
})

test('the namespace renders correctly cased intrinsic SVG elements', () => {
  const html = renderToStaticMarkup(
    <Svg viewBox="0 0 10 10">
      <Svg.Defs>
        <Svg.LinearGradient id="paint" />
      </Svg.Defs>
      <Svg.Rect width={10} height={10} fill="url(#paint)" />
      <Svg.TextPath href="#curve">label</Svg.TextPath>
    </Svg>,
  )
  assert.match(html, /^<svg /)
  assert.match(html, /<linearGradient /)
  assert.match(html, /<textPath /)
  assert.doesNotMatch(html, /lineargradient|textpath/)
})

test('Svg.Link is a secure semantic anchor with router intent', () => {
  const html = renderToStaticMarkup(
    <Svg viewBox="0 0 10 10">
      <Svg.Link href="https://example.com/detail" external replace prefetch>
        <Svg.Rect width={10} height={10} />
      </Svg.Link>
    </Svg>,
  )
  assert.match(html, /<a /)
  assert.match(html, /href="https:\/\/example.com\/detail"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noreferrer noopener"/)
  assert.match(html, /data-hozo-navigation-replace=""/)
  assert.match(html, /data-hozo-navigation-prefetch=""/)
})
