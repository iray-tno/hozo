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
  test(`${native ? 'Native' : 'Web'} captions follow observed seeks, disable and retire without live announcements`, async () => {
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
      (name) =>
        name === 'react-native'
          ? { View: 'RNView', Text: 'RNText' }
          : /expo-/.test(name)
            ? assert.fail('captions must not instantiate either playback engine')
            : require(name),
      module,
      module.exports,
    )
    const { MediaCaptions } = module.exports
    const { parsePlainTextWebVTT } = await import('../dist/webvtt-index.js')
    const cues = parsePlainTextWebVTT(
      'WEBVTT\n\n00:00.000 --> 00:01.000\nFirst\n\n00:01.000 --> 00:02.000\n&lt;b&gt;Second&lt;/b&gt;\n[Door opens]',
    )
    const status = {
      src: 'a.wav',
      status: 'ready',
      playing: false,
      buffering: false,
      currentTime: 0,
      duration: 2,
      error: null,
    }
    const render = (patch = {}) =>
      React.createElement(MediaCaptions, {
        src: 'a.wav',
        status,
        cues,
        accessibilityLabel: '日本語の字幕',
        ...patch,
      })
    let renderer
    await act(async () => {
      renderer = create(React.createElement(React.StrictMode, null, render()))
    })
    assert.match(JSON.stringify(renderer.toJSON()), /First/)
    const seek = (time) => render({ status: { ...status, currentTime: time } })
    await act(async () => renderer.update(seek(1)))
    assert.match(JSON.stringify(renderer.toJSON()), /<b>Second<\/b>/)
    const host = renderer.toJSON()
    if (native) {
      assert.equal(host.props.accessible, true)
      assert.equal(host.props.accessibilityLabel, '日本語の字幕: <b>Second</b>\n[Door opens]')
      assert.equal(host.props.accessibilityLiveRegion, undefined)
    } else {
      assert.equal(host.props.role, 'group')
      assert.equal(host.props['aria-label'], '日本語の字幕')
      assert.equal(host.props['aria-live'], undefined)
      assert.match(renderToStaticMarkup(seek(1)), /&lt;b&gt;Second&lt;\/b&gt;/)
    }
    for (const patch of [
      { enabled: false },
      { status: null },
      { src: 'b.wav' },
      { status: { ...status, currentTime: 2 } },
    ]) {
      await act(async () => renderer.update(render(patch)))
      assert.equal(renderer.toJSON(), null)
    }
    await act(async () => renderer.update(seek(0)))
    assert.match(
      JSON.stringify(renderer.toJSON()),
      /First/,
      'rewinds and remounts have no stale index',
    )
    await act(async () =>
      renderer.update(render({ cues: [{ start: 0, end: 2, text: 'New cue list' }] })),
    )
    assert.match(JSON.stringify(renderer.toJSON()), /New cue list/)
    await act(async () => renderer.unmount())
  })
}
