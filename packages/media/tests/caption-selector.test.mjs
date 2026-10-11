import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
for (const native of [false, true]) {
  test(`${native ? 'Native' : 'Web'} caption radios preserve controlled selection, names, disabled state and hosts`, async () => {
    const result = await build({
      entryPoints: [
        fileURLToPath(
          new URL(`../src/captions-index${native ? '.native' : ''}.ts`, import.meta.url),
        ),
      ],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
    })
    const module = { exports: {} }
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(
      (name) => {
        if (name === 'react-native')
          return { View: 'RNView', Text: 'RNText', Pressable: 'RNPressable' }
        assert.doesNotMatch(name, /expo-/, 'selection does not allocate a playback engine')
        return require(name)
      },
      module,
      module.exports,
    )
    const { MediaCaptionSelector } = module.exports
    const requests = []
    const options = [
      { id: 'en', label: 'English' },
      { id: 'ja', label: '日本語', disabled: true },
    ]
    const props = {
      options,
      value: 'en',
      onValueChange: (v) => requests.push(v),
      accessibilityLabel: '字幕',
    }
    const render = (patch) => React.createElement(MediaCaptionSelector, { ...props, ...patch })
    let renderer
    await act(async () => {
      renderer = create(render())
    })
    const radios = () => renderer.root.findAllByType(native ? 'RNPressable' : 'input')
    const checked = (node) => (native ? node.props.accessibilityState.checked : node.props.checked)
    const activate = (node) => (native ? node.props.onPress : node.props.onChange)()
    const englishHost = radios()[1]
    assert.deepEqual(radios().map(checked), [false, true, false])
    assert.equal(radios()[2].props.disabled, true)
    await act(async () => {
      activate(radios()[1])
      activate(radios()[2])
      activate(radios()[0])
    })
    assert.deepEqual(requests, [null])
    assert.equal(checked(radios()[1]), true)
    await act(async () => renderer.update(render({ value: null, options: [...options].reverse() })))
    assert.equal(
      radios()[2],
      englishHost,
      'stable identities survive reorder and selection changes',
    )
    assert.deepEqual(radios().map(checked), [true, false, false])
    await act(async () => renderer.update(render({ disabled: true })))
    assert.ok(radios().every((node) => node.props.disabled))
    if (native) {
      const group = renderer.root.findAllByType('RNView')[0]
      assert.equal(group.props.accessible, false)
      assert.equal(group.props.accessibilityRole, 'radiogroup')
      for (const radio of radios()) {
        assert.equal(radio.props.accessible, true)
        assert.equal(radio.props.accessibilityRole, 'radio')
        assert.match(radio.props.accessibilityLabel, /^字幕: /)
        assert.equal(radio.props.accessibilityState.disabled, true)
        assert.equal(radio.props.accessibilityLiveRegion, undefined)
        assert.equal(radio.props.style.minHeight, 44)
      }
    } else {
      const markup = renderToStaticMarkup(
        React.createElement(React.Fragment, null, render(), render()),
      )
      assert.match(markup, />字幕<\/legend>/)
      const names = [...markup.matchAll(/name="([^"]+)"/g)].map((match) => match[1])
      assert.equal(
        new Set(names).size,
        2,
        'independent selectors never share a browser radio group',
      )
      assert.equal(radios()[0].props.type, 'radio')
      assert.equal(radios()[0].props['aria-live'], undefined)
    }
    await act(async () => renderer.unmount())
  })
}
