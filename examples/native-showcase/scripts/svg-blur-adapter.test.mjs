import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const { transformSync } = require('esbuild')
const svgRoot = fileURLToPath(new URL('../../../packages/svg/src/', import.meta.url))

function loadAdapter(platform = 'android') {
  let context
  let layout
  const Svg = class extends react.Component {
    measure() {
      return 'measure'
    }
    toDataURL() {
      return 'toDataURL'
    }
    render() {
      return react.createElement(
        'NativeSvgRoot',
        { ...this.props },
        react.createElement('NativeGroup', { onLayout: this.props.onLayout }),
      )
    }
  }
  const native = {
    Svg,
    FeGaussianBlur: 'NativeBlur',
    FeDropShadow: 'NativeShadow',
    Circle: 'NativeCircle',
  }
  const hooks = {
    ...react,
    useState: () => [
      layout,
      (update) => {
        layout = update(layout)
      },
    ],
    useMemo: (fn) => fn(),
    useContext: () => context,
  }
  const evaluate = (file) => {
    const input = readFileSync(svgRoot + file, 'utf8')
    const source = transformHozoSource(input, svgRoot + file) ?? input
    // The owner delegates to upstream, never back into its own corrected ABI.
    assert.doesNotMatch(source, /from ['"]@hozo\/svg['"]/)
    const { code } = transformSync(source, {
      loader: file.endsWith('tsx') ? 'tsx' : 'ts',
      format: 'cjs',
      jsx: 'automatic',
    })
    const module = { exports: {} }
    new Function('require', 'module', code)((name) => {
      if (name === 'react') return hooks
      if (name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native')
        return {
          Platform: { OS: platform },
          PixelRatio: { get: () => 2.625 },
          StyleSheet: {
            flatten: (style) => (Array.isArray(style) ? Object.assign({}, ...style) : style),
          },
        }
      if (name === 'react-native-svg') return native
      if (name === './blur-raster.ts') return evaluate('blur-raster.ts')
      if (name === './blur.native.tsx') return evaluate('blur.native.tsx')
      if (name === './svg-link.native.tsx') return { SvgLink: 'SvgLink' }
      // `Icon` draws with upstream elements directly and is not part of the
      // blur correction this file checks.
      if (name === './icon.native.tsx') return { Icon: 'Icon' }
      throw new Error(`Unexpected dependency: ${name}`)
    }, module)
    return module.exports
  }
  return {
    adapter: evaluate('blur.native.tsx'),
    facade: evaluate('index.native.tsx'),
    native,
    setContext: (value) => {
      context = value
    },
  }
}

test('both namespace and compiled ABI use Android correction, while iOS retains upstream identities', () => {
  const { facade, native } = loadAdapter()
  assert.equal(facade.Svg.FeGaussianBlur, facade.FeGaussianBlur)
  assert.equal(facade.Svg.FeDropShadow, facade.FeDropShadow)
  assert.notEqual(facade.FeGaussianBlur, native.FeGaussianBlur)
  assert.equal(facade.Circle, native.Circle)
  const ios = loadAdapter('ios')
  assert.equal(ios.facade.FeGaussianBlur, ios.native.FeGaussianBlur)
  assert.equal(ios.facade.FeDropShadow, ios.native.FeDropShadow)
  assert.equal(ios.facade.Svg, ios.native.Svg)
})

test('blur and compact shadow convert once, keep graph props, and forward their upstream refs', () => {
  const { adapter, setContext } = loadAdapter()
  const ref = react.createRef()
  for (const Component of [adapter.AndroidGaussianBlur, adapter.AndroidDropShadow]) {
    const props = {
      stdDeviation: '4',
      in: 'SourceAlpha',
      result: 'blurred',
      dx: 12,
      floodColor: 'red',
    }
    const fallback = Component.render(props, ref)
    assert.deepEqual(fallback.props.stdDeviation, [12.375, 12.375])
    assert.equal(fallback.props.ref, ref)
    assert.equal(fallback.props.in, 'SourceAlpha')
    assert.equal(fallback.props.result, 'blurred')
    assert.equal(fallback.props.dx, 12)
    assert.equal(props.stdDeviation, '4')
    setContext({ x: 2, y: 2 })
    assert.deepEqual(Component.render(props, ref).props.stdDeviation, [9.25, 9.25])
    setContext(undefined)
  }
})

test('fixed root avoids layout work; responsive root measures its viewport and preserves authored callbacks and methods', () => {
  const { adapter } = loadAdapter()
  const ref = react.createRef()
  const child = react.createElement('SharedScene')
  const onLayout = () => {}
  const fixed = adapter.AndroidSvg.render(
    { width: '96', height: 96, viewBox: '0 0 96 96', children: child },
    ref,
  )
  assert.deepEqual(fixed.props.value, { x: 2.625, y: 2.625 })
  assert.equal(fixed.props.children.props.onViewportLayout, undefined)
  const props = { width: '100%', height: '100%', viewBox: '0 0 100 100', onLayout, children: child }
  let responsive = adapter.AndroidSvg.render(props, ref)
  responsive.props.children.props.onViewportLayout({
    nativeEvent: { layout: { width: 200, height: 200 } },
  })
  responsive = adapter.AndroidSvg.render(props, ref)
  assert.deepEqual(responsive.props.value, { x: 5.25, y: 5.25 })
  assert.equal(responsive.props.children.props.ref, ref)
  const host = new responsive.props.children.type(responsive.props.children.props)
  assert.equal(host.measure(), 'measure')
  assert.equal(host.toDataURL(), 'toDataURL')
  const output = host.render()
  assert.equal(output.type, 'NativeSvgRoot')
  assert.equal(output.props.onLayout, responsive.props.children.props.onViewportLayout)
  assert.equal(output.props.children.props.onLayout, onLayout)
  assert.equal(output.props.onViewportLayout, undefined)
  // Keep observing subsequent viewport changes; first layout must not disable it.
  responsive.props.children.props.onViewportLayout({
    nativeEvent: { layout: { width: 100, height: 100 } },
  })
  assert.deepEqual(adapter.AndroidSvg.render(props, ref).props.value, { x: 2.625, y: 2.625 })
})

test('the installed Android peer still uses the kernel mapping compensated by Hozo', () => {
  const source = readFileSync(
    require
      .resolve('react-native-svg/package.json')
      .replace('package.json', 'android/src/main/java/com/horcrux/svg/FeGaussianBlurView.java'),
    'utf8',
  )
  assert.match(source, /Math\.max\(mStdDeviationX, mStdDeviationY\) \* 2/)
  assert.match(source, /maxRadius = 25\.0f/)
  assert.match(source, /ScriptIntrinsicBlur/)
})
