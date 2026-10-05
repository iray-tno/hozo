import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { svgFilterDelegates, svgFilterScorecard } from './svg-filters.ts'

test('reviewed blur adapters count delegation without hiding broken platform or graph wiring', () => {
  const require = createRequire(import.meta.url)
  const root = require.resolve('@hozo/svg/package.json').replace('package.json', 'src/')
  const facade = readFileSync(`${root}index.native.tsx`, 'utf8')
  const adapters = readFileSync(`${root}blur.native.tsx`, 'utf8')
  for (const [name, adapter] of [
    ['FeGaussianBlur', 'AndroidGaussianBlur'],
    ['FeDropShadow', 'AndroidDropShadow'],
  ]) {
    assert.equal(svgFilterDelegates(name, facade, adapters), true)
    assert.equal(
      svgFilterDelegates(name, facade.replace(`withClassName(${adapter})`, 'Unknown'), adapters),
      false,
    )
    assert.equal(
      svgFilterDelegates(
        name,
        facade.replace(`withClassName(NativeSvg.${name})`, 'Unknown'),
        adapters,
      ),
      false,
    )
    assert.equal(
      svgFilterDelegates(name, facade, adapters.replace(`<NativeSvg.${name}`, '<Unknown')),
      false,
    )
    assert.equal(svgFilterDelegates(name, facade, adapters.replaceAll('ref={ref}', '')), false)
    assert.equal(svgFilterDelegates(name, facade, adapters.replaceAll('{...props}', '')), false)
    assert.equal(
      svgFilterDelegates(
        name,
        facade,
        adapters.replaceAll(
          'androidBlurDeviation(props.stdDeviation, scale)',
          'props.stdDeviation',
        ),
      ),
      false,
    )
  }
  assert.equal(svgFilterDelegates('FeTurbulence', facade, adapters), false)
})

test('the optional Native SVG peer starts after shadow/composite stopped being stubs', () => {
  const require = createRequire(import.meta.url)
  const pkg = JSON.parse(readFileSync(require.resolve('@hozo/svg/package.json'), 'utf8'))
  assert.equal(pkg.peerDependencies['react-native-svg'], '>=15.9.0')
  assert.equal(pkg.peerDependenciesMeta['react-native-svg'].optional, true)
  assert.equal(pkg.dependencies['react-native-svg'], undefined)
})

test('filter API/compiler coverage uses upstream public exports, not the implemented shortlist', () => {
  const score = svgFilterScorecard()
  assert.equal(score.web.total, 26)
  assert.equal(score.native.total, 10)
  assert.equal(score.native.upstreamStubs, 16)
  assert.deepEqual(
    score.rows.filter((row) => row.web).map((row) => row.name),
    [
      'FeBlend',
      'FeColorMatrix',
      'FeComposite',
      'FeDropShadow',
      'FeFlood',
      'FeGaussianBlur',
      'FeMerge',
      'FeMergeNode',
      'FeOffset',
      'Filter',
    ],
  )
  assert.deepEqual(
    score.rows.filter((row) => row.native).map((row) => row.name),
    [
      'FeBlend',
      'FeColorMatrix',
      'FeComposite',
      'FeDropShadow',
      'FeFlood',
      'FeGaussianBlur',
      'FeMerge',
      'FeMergeNode',
      'FeOffset',
      'Filter',
    ],
  )
  assert.equal(score.rows.find((row) => row.name === 'FeDistantLight')?.upstreamNative, 'stub')
  assert.equal(score.rows.find((row) => row.name === 'FeMergeNode')?.upstreamNative, 'backed')
  assert.equal(score.rows.find((row) => row.name === 'FeDropShadow')?.web, true)
  assert.equal(score.rows.find((row) => row.name === 'FeTurbulence')?.web, false)
})
