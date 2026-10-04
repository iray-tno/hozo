import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FeBlend,
  FeColorMatrix,
  FeComposite,
  FeDropShadow,
  FeFlood,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  FeOffset,
  Filter,
  Svg,
} from './index.tsx'

test('composition exports preserve the namespace ABI and ordered SVG filter graph', () => {
  for (const [name, component] of Object.entries({
    FeBlend,
    FeComposite,
    FeDropShadow,
    FeFlood,
    FeMerge,
    FeMergeNode,
    FeOffset,
  })) {
    assert.equal(Svg[name as keyof typeof Svg], component)
  }
  const html = renderToStaticMarkup(
    <Svg viewBox="0 0 40 40">
      <Svg.Defs>
        <Svg.Filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <Svg.FeGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
          <Svg.FeOffset in="blur" dx={2} dy={3} result="offset" />
          <Svg.FeFlood floodColor="#2563eb" floodOpacity={0.5} result="paint" />
          <Svg.FeComposite in="paint" in2="offset" operator="in" result="shadow" />
          <Svg.FeMerge>
            <Svg.FeMergeNode in="shadow" />
            <Svg.FeMergeNode in="SourceGraphic" />
          </Svg.FeMerge>
        </Svg.Filter>
        <Svg.Filter id="blend">
          <Svg.FeBlend in="SourceGraphic" in2="SourceAlpha" mode="multiply" />
        </Svg.Filter>
        <Svg.Filter id="compact">
          <Svg.FeDropShadow dx={2} dy={3} stdDeviation="2" floodColor="black" floodOpacity={0.5} />
        </Svg.Filter>
      </Svg.Defs>
      <Svg.Rect width={40} height={40} filter="url(#shadow)" />
    </Svg>,
  )
  assert.match(html, /<feOffset in="blur" dx="2" dy="3" result="offset">/)
  assert.match(html, /<feFlood flood-color="#2563eb" flood-opacity="0.5" result="paint">/)
  assert.match(html, /<feComposite in="paint" in2="offset" operator="in" result="shadow">/)
  assert.match(
    html,
    /<feMerge><feMergeNode in="shadow"><\/feMergeNode><feMergeNode in="SourceGraphic"><\/feMergeNode><\/feMerge>/,
  )
  assert.match(html, /<feBlend in="SourceGraphic" in2="SourceAlpha" mode="multiply">/)
  assert.match(
    html,
    /<feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="black" flood-opacity="0.5">/,
  )
  assert.match(html, /filter="url\(#shadow\)"/)
})

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
