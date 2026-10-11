import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const require = createRequire(import.meta.url)
const file = fileURLToPath(new URL('../../showcase/src/audio-probe.tsx', import.meta.url))

test('Audio output probe retains the canonical engine and has no simulated clock or decoded-sample shortcut', () => {
  const output = transformHozoSource(readFileSync(file, 'utf8'), file)
  assert.match(output, /from ['"]@hozo\/media\/audio['"]/)
  assert.match(output, /<Audio\b/)
  assert.match(output, /controls=\{false\}/)
  assert.match(output, /onStatusChange=\{setStatus\}/)
  assert.doesNotMatch(output, /setInterval|setTimeout|Date\.now|currentTime|AudioSample|expo-audio/)
  const story = readFileSync(new URL('../src/Audio.stories.tsx', import.meta.url), 'utf8')
  assert.match(story, /OutputEvidence.*args: \{ probe: true \}/)
  assert.match(story, /<AudioPlaybackProbe src=\{src\}/)
})

test('compiled Audio probe controls render Native text, follow observations and remove/remount the real host', async () => {
  const react = require('react')
  const { transformSync } = require('esbuild')
  const { code } = transformSync(transformHozoSource(readFileSync(file, 'utf8'), file), {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
  })
  const states = [null, false, true]
  let slot = 0
  let playCalls = 0
  const player = {
    current: {
      play: async () => {
        playCalls++
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
    throw new Error(`Unexpected Audio probe dependency: ${name}`)
  }, module)
  const render = () => {
    slot = 0
    return react.Children.toArray(
      module.exports.AudioPlaybackProbe({ src: 'fixture.wav' }).props.children,
    )
  }
  const buttons = (children) => children.filter((node) => node.type === 'NativePressable')
  let children = render()
  assert.equal(buttons(children)[0].props.disabled, true)
  const audio = children.find((node) => node.type === 'Audio')
  assert.equal(audio.props.ref, player)
  assert.equal(audio.props.loop, true)
  assert.equal(audio.props.controls, false)
  audio.props.onStatusChange({ status: 'ready', playing: false })
  children = render()
  assert.equal(buttons(children)[0].props.disabled, false)
  buttons(children)[0].props.onPress()
  assert.equal(playCalls, 1)
  assert.ok(
    children.some((node) => node.props.children === 'Audio probe: ready; paused; muted=false'),
  )
  audio.props.onStatusChange({ status: 'ready', playing: true })
  buttons(children)[1].props.onPress()
  children = render()
  assert.equal(children.find((node) => node.type === 'Audio').props.muted, true)
  assert.equal(buttons(children)[1].props.children.type, 'NativeText')
  assert.equal(buttons(children)[1].props.children.props.children, 'Unmute audio probe')
  buttons(children)[2].props.onPress()
  children = render()
  assert.ok(!children.some((node) => node.type === 'Audio'))
  assert.equal(buttons(children)[2].props.children.props.children, 'Mount audio probe')
  buttons(children)[2].props.onPress()
  children = render()
  assert.equal(children.find((node) => node.type === 'Audio').props.muted, false)
  assert.equal(
    buttons(children)[0].props.disabled,
    true,
    'fresh host waits for an actual ready event',
  )
})
