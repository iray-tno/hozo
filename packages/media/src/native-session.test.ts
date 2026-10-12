import assert from 'node:assert/strict'
import test from 'node:test'
import type { VideoPlayer } from 'expo-video'
import { videoControlLabels, videoControlState } from './control-state.ts'
import { NativeVideoSession } from './native-session.ts'
import { seekBounds } from './seek-policy.ts'

function fakePlayer() {
  const listeners = new Map<string, Set<(event: never) => void>>()
  const calls: string[] = []
  let rejectLoad: (error: Error) => void = () => {}
  const player = {
    status: 'idle',
    playing: false,
    playbackRate: 1,
    preservesPitch: true,
    currentTime: 0,
    duration: 0,
    isLive: false,
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
  assert.deepEqual(session.getStatus().seekability, { status: 'unknown', reason: 'not-exposed' })
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
  assert.equal(fake.calls.includes('release'), false, 'component host owns release')
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

for (const event of ['sourceLoad', 'statusChange', 'timeUpdate']) {
  test(`Native Video ${event} does not publish a live window as total duration`, (t) => {
    const fake = fakePlayer()
    const durations: (number | null)[] = []
    const session = new NativeVideoSession(fake.player as unknown as VideoPlayer, 'live', () => ({
      onStatusChange: (status) => durations.push(status.duration),
    }))
    t.after(() => session.dispose())
    session.start({})
    fake.player.status = 'readyToPlay'
    fake.player.duration = 120
    const emit = () => fake.emit(event, { duration: 180, status: 'readyToPlay', currentTime: 30 })

    fake.player.isLive = true
    emit()
    assert.equal(session.getStatus().duration, null)
    assert.equal(durations.at(-1), null, 'callbacks must not receive a fabricated total either')
    assert.deepEqual(session.getStatus().seekability, { status: 'unknown', reason: 'not-exposed' })
    assert.equal(seekBounds(session.getStatus()), null)

    fake.player.isLive = false
    emit()
    const finite = event === 'sourceLoad' ? 180 : 120
    assert.equal(session.getStatus().duration, finite, 'a later finite observation is recoverable')
    assert.equal(durations.at(-1), finite)

    fake.player.isLive = true
    emit()
    assert.equal(session.getStatus().duration, null, 'the live flag is not cached at source load')
    assert.equal(durations.at(-1), null)

    fake.player.isLive = false
    fake.player.duration = Infinity
    fake.emit(event, { duration: Infinity, status: 'readyToPlay', currentTime: 30 })
    assert.equal(session.getStatus().duration, null, 'unknown non-live duration remains unknown')
  })
}

test('an initially live Video keeps playback and best-effort seeks without a finite Slider', async (t) => {
  const fake = fakePlayer()
  fake.player.status = 'readyToPlay'
  fake.player.isLive = true
  fake.player.duration = 120
  fake.player.currentTime = 30
  const session = new NativeVideoSession(fake.player as unknown as VideoPlayer, 'live', () => ({}))
  t.after(() => session.dispose())
  session.start({})
  const status = session.getStatus()
  assert.equal(status.duration, null)
  assert.equal(seekBounds(status), null)
  assert.equal(
    videoControlLabels({ player: { current: session }, status }).labels.position(
      status.currentTime,
      status.duration,
    ),
    '0:30 / duration unknown',
  )
  assert.deepEqual(videoControlState(status), {
    playing: false,
    toggleDisabled: false,
    backwardDisabled: false,
    forwardDisabled: false,
  })
  await session.play()
  assert.equal(fake.calls.at(-1), 'play')
  fake.player.playing = true
  fake.emit('playingChange', { isPlaying: true })
  assert.equal(videoControlState(session.getStatus()).toggleDisabled, false)
  session.pause()
  assert.equal(fake.calls.at(-1), 'pause')
  session.seekTo(3600)
  assert.equal(fake.player.currentTime, 3600, 'unknown ranges do not invent a live-window bound')
  assert.equal(session.getStatus().currentTime, 30, 'accepted commands are not clock evidence')
  assert.deepEqual(session.getStatus().seekability, { status: 'unknown', reason: 'not-exposed' })
})
