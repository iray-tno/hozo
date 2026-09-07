// The acceptance screen, rendered rather than described.
//
// `examples/native-demo/App.tsx` is the file the device job boots. Until
// now nothing here could even mount it: it calls `PanResponder.create` at
// the top of its body and the stub had no `PanResponder`, so the whole
// screen threw before drawing. That is worth its own note -- a fixture
// this repository has shipped for months, and the first attempt to render
// it produced a stack trace.
//
// What this asks is narrow and was, until a device answered otherwise,
// unaskable: does the screen do anything once it is up?
//
// It came from the emulator refusing to give a tree. `uiautomator dump`
// waits for an idle window and kept reporting "could not get idle state",
// six attempts in a row. The frame counter said why -- 561 frames, then
// 828, 1232, 1630, 2056, 2467, about twenty-four a second with nobody
// touching it. A screen at rest that never stops drawing is a battery
// cost, and no test in this repository could see it.
//
// This one says where it is *not*: React commits once and schedules
// nothing, and no animation starts. So whatever draws on the device is not
// a render loop and not `HozoAnimated`, which is worth pinning here so the
// next person does not re-derive it.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  Profiler: unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => unknown
  act: (callback: () => void) => void
}
const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: unknown[]; __hozoResetTimings: () => void }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(
  path.join(here, '..', '..', '..', 'examples', 'native-demo', 'App.tsx'),
  'utf8',
)

/** Commits, and animations started, from mounting the screen and waiting. */
function mountAndWait() {
  const App = loadNativeModule(source).default
  stub.Animated.__hozoResetTimings()
  let commits = 0
  const counted = () =>
    react.createElement(
      react.Profiler,
      {
        id: 'acceptance',
        onRender: () => {
          commits += 1
        },
      },
      react.createElement(App),
    )
  renderer.act(() => {
    renderer.create(react.createElement(counted))
  })
  const onMount = commits
  // Long enough for a `setTimeout(0)` chain or a settled effect to show
  // itself. Not long enough to catch something on a slow interval, which
  // this cannot claim to rule out.
  const until = Date.now() + 300
  while (Date.now() < until) {
    renderer.act(() => {})
  }
  return { onMount, afterIdle: commits, animations: stub.Animated.__hozoTimings.length }
}

const measured = mountAndWait()

test('the acceptance screen mounts', () => {
  // It could not, before `PanResponder` reached the stub. A screen that
  // throws on the first line of its body is a thing a device would have
  // shown immediately and nothing offline ever did.
  assert.ok(measured.onMount > 0, 'nothing committed')
})

test('and then does nothing', () => {
  // The claim that matters: no re-render after the first commit. Whatever
  // draws twenty-four frames a second on the emulator, it is not React.
  assert.equal(
    measured.afterIdle,
    measured.onMount,
    `the screen committed ${measured.afterIdle - measured.onMount} more times while idle`,
  )
})

test('and starts no animation', () => {
  // `HozoAnimated` restarts its transition whenever the parent renders,
  // because the compiler emits `hozoTransition={{ … }}` as a fresh object
  // -- documented in `transition-restart.test.ts`. With no parent render
  // there is nothing to restart, so the transition is not what is drawing
  // either.
  assert.equal(measured.animations, 0)
})
