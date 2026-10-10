import assert from 'node:assert/strict'
import test from 'node:test'
import type { VideoPlayer } from 'expo-video'
import { NativeVideoSession } from './native-session.ts'

function fakePlayer() {
  const listeners = new Map<string, Set<(event: never) => void>>()
  const calls: string[] = []
  let rejectLoad: (error: Error) => void = () => {}
  const player = {
    status: 'idle',
    playing: false,
    currentTime: 0,
    duration: 0,
    loop: false,
    muted: false,
    timeUpdateEventInterval: 0,
    play() {
      calls.push('play')
    },
    pause() {
      calls.push('pause')
    },
    release() {
      calls.push('release')
    },
    replaceAsync(src: string) {
      calls.push(`load:${src}`)
      return new Promise<void>((_, reject) => {
        rejectLoad = reject
      })
    },
    addListener(name: string, handler: (event: never) => void) {
      const set = listeners.get(name) ?? new Set()
      set.add(handler)
      listeners.set(name, set)
      return { remove: () => set.delete(handler) }
    },
  }
  const emit = (name: string, event: unknown = {}) => {
    for (const handler of listeners.get(name) ?? []) handler(event as never)
  }
  return { player, calls, listeners, emit, reject: (error: Error) => rejectLoad(error) }
}

test('Native async loading, autoplay, observed playback, seeking and dynamic options', async () => {
  const fake = fakePlayer()
  const events: string[] = []
  const session = new NativeVideoSession(fake.player as unknown as VideoPlayer, 'a.mp4', () => ({
    onPlay: () => events.push('play'),
    onPause: () => events.push('pause'),
    onEnded: () => events.push('ended'),
  }))
  session.start({ autoPlay: true, muted: true, loop: true })
  assert.deepEqual(fake.calls, ['load:a.mp4'])
  assert.equal(fake.player.muted, true)
  assert.equal(fake.player.loop, true)
  assert.equal(fake.player.timeUpdateEventInterval, 0.25)
  assert.equal(session.getStatus().duration, null)
  fake.player.status = 'readyToPlay'
  fake.player.duration = 4
  fake.emit('statusChange', { status: 'readyToPlay' })
  fake.emit('statusChange', { status: 'readyToPlay' })
  assert.deepEqual(fake.calls, ['load:a.mp4', 'play'])
  assert.equal(session.getStatus().playing, false, 'play request is not evidence of playback')
  fake.player.playing = true
  fake.emit('playingChange', { isPlaying: true })
  fake.emit('timeUpdate', { currentTime: 1 })
  assert.equal(session.getStatus().currentTime, 1)
  session.seekTo(100)
  assert.equal(fake.player.currentTime, 4)
  fake.emit('playToEnd')
  assert.equal(session.getStatus().status, 'ready', 'Expo loop-boundary is not terminal end')
  assert.throws(() => session.seekTo(Number.NaN), RangeError)
  session.setOptions({ muted: false, loop: false })
  assert.equal(fake.player.muted, false)
  assert.equal(fake.player.loop, false)
  session.pause()
  assert.equal(session.getStatus().playing, true)
  fake.emit('playingChange', { isPlaying: false })
  fake.emit('playToEnd')
  fake.emit('playToEnd')
  assert.deepEqual(events, ['play', 'pause', 'ended'])
  session.dispose()
  assert.equal(fake.calls.includes('release'), false, 'Expo hook owns release')
  assert.equal(
    [...fake.listeners.values()].every((set) => set.size === 0),
    true,
  )
  await assert.rejects(session.play(), /no longer active/)
})

test('source errors and buffering are normalized; retired listeners and late loads cannot notify', async () => {
  const fake = fakePlayer()
  const errors: string[] = []
  const session = new NativeVideoSession(fake.player as unknown as VideoPlayer, 'bad.mp4', () => ({
    onError: ({ message }) => errors.push(message),
  }))
  session.start({})
  fake.player.status = 'loading'
  fake.emit('statusChange', { status: 'loading' })
  assert.equal(session.getStatus().buffering, true)
  fake.player.status = 'error'
  fake.emit('statusChange', { status: 'error', error: { message: 'decode failed' } })
  assert.equal(session.getStatus().status, 'error')
  assert.deepEqual(errors, ['decode failed'])
  session.dispose()
  fake.emit('statusChange', { error: { message: 'stale event' } })
  fake.reject(new Error('late rejection'))
  await Promise.resolve()
  assert.deepEqual(errors, ['decode failed'])
})

test('failed asynchronous load is observable without an unhandled promise', async () => {
  const fake = fakePlayer()
  const session = new NativeVideoSession(
    fake.player as unknown as VideoPlayer,
    'bad.mp4',
    () => ({}),
  )
  session.start({})
  fake.reject(new Error('missing file'))
  await Promise.resolve()
  assert.equal(session.getStatus().error?.operation, 'load')
  assert.equal(session.getStatus().error?.message, 'missing file')
  session.dispose()
})
