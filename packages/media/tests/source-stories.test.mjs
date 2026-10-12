import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import { sourceEntry } from './helpers/source-entry.mjs'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)

function renderedText(node) {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return node?.children ? renderedText(node.children) : ''
}

async function story(t, native, video) {
  const pending = []
  const resolveSource = (source, signal) =>
    new Promise((resolve, reject) => pending.push({ source, signal, resolve, reject }))
  const api = await sourceEntry(native)
  let nextId = 0
  function Player(props) {
    const [id] = React.useState(() => ++nextId)
    return React.createElement('Player', { ...props, id })
  }
  const built = await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          `../../../examples/${native ? 'native-showcase' : 'storybook-demo'}/src/${video ? 'Video' : 'Audio'}.stories.tsx`,
          import.meta.url,
        ),
      ),
    ],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    loader: { '.css': 'empty' },
    plugins: [
      {
        name: 'owned-asset-identities',
        setup(builder) {
          builder.onLoad(
            { filter: /hozo-(?:video(?:-poster)?|audio)\.(?:mp4|png|wav)$/ },
            ({ path }) => {
              const id = path.endsWith('.wav') ? 1 : path.endsWith('.png') ? 3 : 2
              return {
                contents: `module.exports = ${JSON.stringify(native ? id : `/owned-${id}`)}`,
                loader: 'js',
              }
            },
          )
        },
      },
    ],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    (name) => {
      if (name === '@hozo/media/source') return { ...api, resolveMediaURI: resolveSource }
      if (name === '@hozo/media/source/expo') return { resolveExpoMediaAsset: resolveSource }
      if (name === '@hozo/example-showcase')
        return {
          AudioDemo: Player,
          AudioPlaybackProbe: Player,
          AudioSettingsProbe: Player,
          VideoDemo: Player,
          VideoPlaybackProbe: Player,
        }
      if (name === '@hozo/primitives') return { Button: 'button', ScrollView: 'main', Text: 'span' }
      if (name === 'react-native') return { ScrollView: 'main', Text: 'span', View: 'div' }
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      assert.fail(`unexpected story dependency: ${name}`)
    },
    module,
    module.exports,
  )
  const Component = module.exports.default.component
  const initial = {
    ...module.exports.default.args,
    ...(video ? (native ? { poster: true } : { poster: '/owned-3' }) : {}),
  }
  const render = (props = initial) => React.createElement(Component, props)
  let renderer
  await act(async () => {
    renderer = create(render())
  })
  t.after(async () => {
    await act(async () => renderer.unmount())
  })
  return {
    pending,
    get text() {
      return renderedText(renderer.toJSON())
    },
    get players() {
      return renderer.root.findAllByType('Player')
    },
    click: async (label) =>
      act(async () => {
        const button = renderer.root
          .findAllByType('button')
          .find((node) => node.props.children === label)
        assert.ok(button, `missing ${label}`)
        button.props[native ? 'onPress' : 'onClick']()
      }),
    update: async (props = initial) => act(async () => renderer.update(render(props))),
    initial,
  }
}

for (const native of [false, true]) {
  const host = native ? 'Native' : 'Web'
  test(`${host} Audio showcase uses shared loading/error/retry and never mounts a player before URI resolution`, async (t) => {
    const p = await story(t, native, false)
    assert.equal(p.players.length, 0)
    assert.match(p.text, /Loading bundled audio/)
    await act(async () => p.pending[0].reject(new Error('owned asset unavailable')))
    assert.match(p.text, /Audio asset: owned asset unavailable/)
    assert.equal(p.players.length, 0)
    await p.update()
    assert.equal(p.pending.length, 1, 'no retry on render')
    await p.click('Retry audio asset')
    assert.match(p.text, /Loading bundled audio/)
    assert.equal(p.pending[0].signal.aborted, true)
    await act(async () => p.pending[1].resolve('file:///tones.wav'))
    assert.equal(p.players[0].props.src, 'file:///tones.wav')
    const id = p.players[0].props.id
    await p.update()
    assert.equal(p.players[0].props.id, id)
    assert.equal(p.pending.length, 2)
  })

  test(`${host} Video poster resolution/denial/retry never reloads or replaces the movie`, async (t) => {
    const p = await story(t, native, true)
    assert.equal(p.pending.length, 2)
    assert.equal(p.players.length, 0)
    await act(async () => p.pending[0].resolve('file:///clip.mp4'))
    assert.equal(p.players[0].props.src, 'file:///clip.mp4')
    assert.equal(p.players[0].props.poster, undefined)
    const id = p.players[0].props.id
    await act(async () => p.pending[1].reject(new Error('artwork unavailable')))
    assert.match(p.text, /Poster asset: artwork unavailable/)
    assert.equal(p.players[0].props.id, id)
    await p.click('Retry poster asset')
    assert.equal(p.players[0].props.id, id, 'poster loading cannot unmount the playable movie')
    assert.equal(p.pending.length, 3, 'only artwork is retried')
    await act(async () => p.pending[2].resolve('file:///poster.png'))
    assert.equal(p.players[0].props.poster, 'file:///poster.png')
    assert.equal(p.players[0].props.id, id)
    await p.update({ ...p.initial, poster: native ? false : undefined })
    assert.equal(p.players[0].props.id, id)
    assert.equal(p.players[0].props.poster, undefined)
    assert.equal(p.pending[2].signal.aborted, true)
    assert.equal(p.pending[0].signal.aborted, false, 'movie URI ownership remains live')
  })
}
