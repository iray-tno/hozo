import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const require = createRequire(import.meta.url)
const file = fileURLToPath(new URL('../../showcase/src/audio-settings-probe.tsx', import.meta.url))

test('settings probe keeps the canonical Audio and cannot certify itself with clocks/getters/sampling', () => {
  const source = readFileSync(file, 'utf8')
  const output = transformHozoSource(source, file)
  assert.match(output, /from ['"]@hozo\/media\/audio['"]/)
  assert.match(output, /<Audio\b/)
  assert.doesNotMatch(
    output,
    /setInterval|setTimeout|Date\.now|currentTime|AudioSample|expo-audio|getStatus|setPlaybackRate/,
  )
  const story = readFileSync(new URL('../src/Audio.stories.tsx', import.meta.url), 'utf8')
  assert.match(story, /SettingsOutputEvidence.*args: \{ settings: true \}/)
  assert.match(story, /<AudioSettingsProbe src=\{src\}/)
  assert.match(
    story,
    /OutputEvidence.*args: \{ probe: true \}/,
    'the original output probe remains selectable',
  )
})

test('compiled Native settings controls change real Audio props without play/seek/replacement shortcuts', async () => {
  const react = require('react')
  const { transformSync } = require('esbuild')
  const { code } = transformSync(transformHozoSource(readFileSync(file, 'utf8'), file), {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
  })
  const states = [null, 1, 1, true]
  let slot = 0
  let plays = 0
  const player = {
    current: {
      play: async () => {
        plays++
      },
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', code)((name) => {
    if (name === 'react')
      return {
        ...react,
        useRef: () => player,
        useState: () => {
          const index = slot++
          return [
            states[index],
            (value) => {
              states[index] = typeof value === 'function' ? value(states[index]) : value
            },
          ]
        },
      }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@hozo/media/audio') return { Audio: 'Audio' }
    if (name === 'react-native')
      return {
        View: 'NativeView',
        Text: 'NativeText',
        Pressable: 'NativePressable',
        StyleSheet: { create: (styles) => styles },
      }
    throw new Error(`Unexpected settings probe dependency: ${name}`)
  }, module)
  const render = () => {
    slot = 0
    return react.Children.toArray(
      module.exports.AudioSettingsProbe({ src: 'fixture.wav' }).props.children,
    )
  }
  let children = render()
  const audio = () => children.find((node) => node.type === 'Audio')
  const buttons = () => children.filter((node) => node.type === 'NativePressable')
  assert.equal(buttons()[0].props.disabled, true)
  audio().props.onStatusChange({ status: 'ready', playing: false })
  children = render()
  assert.equal(buttons()[0].props.disabled, false)
  buttons()[0].props.onPress()
  assert.equal(plays, 1)
  assert.ok(children.some((node) => node.props.children === 'Audio settings probe: ready; paused'))
  audio().props.onStatusChange({ status: 'ready', playing: true })
  for (const [index, expected] of [
    [1, [0.25, 1, true]],
    [2, [1, 1, true]],
    [3, [1, 0.5, true]],
    [4, [1, 2, true]],
    [5, [1, 2, false]],
    [6, [1, 1, true]],
  ]) {
    assert.equal(buttons()[index].props.children.type, 'NativeText')
    buttons()[index].props.onPress()
    children = render()
    assert.deepEqual(
      [audio().props.volume, audio().props.playbackRate, audio().props.preservesPitch],
      expected,
    )
    assert.equal(audio().props.ref, player)
    assert.equal(audio().props.src, 'fixture.wav')
    assert.equal(audio().props.loop, true)
    assert.equal(audio().props.controls, false)
    assert.equal(plays, 1)
    assert.ok(
      children.some((node) => node.props.children === 'Audio settings probe: ready; playing'),
    )
  }
})
