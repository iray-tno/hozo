import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioPlayer, AudioStatus as ExpoAudioStatus } from 'expo-audio'
import { NativeAudioSession } from './native-audio-session.ts'

function engine() {
  let listener: ((status: ExpoAudioStatus) => void) | null = null
  let rejectSeek: ((error: Error) => void) | null = null
  const calls: unknown[] = []
  const player = {
    loop: false,
    muted: false,
    playbackRate: 1,
    shouldCorrectPitch: true,
    setPlaybackRate(rate: number) {
      this.playbackRate = rate
    },
    rejectPlay: false,
    rejectLoad: false,
    addListener(name: string, callback: (status: ExpoAudioStatus) => void) {
      assert.equal(name, 'playbackStatusUpdate')
      listener = callback
      return {
        remove: () => {
          listener = null
          calls.push('remove')
        },
      }
    },
    replace(source: unknown) {
      calls.push(source)
      if (player.rejectLoad) throw new Error('load failed')
    },
    play() {
      calls.push('play')
      if (player.rejectPlay) throw new Error('play denied')
    },
    pause() {
      calls.push('pause')
    },
    seekTo(seconds: number) {
      calls.push(seconds)
      return new Promise<void>((resolve, reject) => {
        rejectSeek = reject
        completeSeek = resolve
      })
    },
  }
  let completeSeek: (() => void) | null = null
  const emit = (patch: Partial<ExpoAudioStatus> = {}) =>
    listener?.({
      currentTime: 0,
      duration: 4,
      playing: false,
      isBuffering: false,
      isLoaded: true,
      playbackState: 'readyToPlay',
      didJustFinish: false,
      error: null,
      ...patch,
    } as ExpoAudioStatus)
  return {
    player: player as unknown as AudioPlayer,
    mock: player,
    calls,
    emit,
    failSeek: () => rejectSeek?.(new Error('seek failed')),
    finishSeek: () => completeSeek?.(),
  }
}

test('Audio maps ready/buffering/unknown duration and engine errors, not request success', async () => {
  const e = engine()
  const events: string[] = []
  const session = new NativeAudioSession(e.player, 'a.wav', () => ({
    onPlay: () => events.push('play'),
    onPause: () => events.push('pause'),
    onError: (error) => events.push(error.operation),
  }))
  session.start({})
  assert.deepEqual(e.calls, [{ uri: 'a.wav' }])
  assert.equal(session.getStatus().status, 'loading')
  e.emit({ duration: 0 })
  assert.equal(session.getStatus().duration, null)
  e.emit({ isLive: true, duration: 120 })
  assert.equal(
    session.getStatus().duration,
    null,
    'a live buffer length is not a finite stream duration',
  )
  await session.play()
  assert.equal(session.getStatus().playing, false)
  e.emit({ playing: true, currentTime: 0.5 })
  e.emit({ playing: true, isBuffering: true, isLoaded: false })
  assert.equal(session.getStatus().buffering, true)
  assert.equal(session.getStatus().status, 'loading')
  session.pause()
  assert.equal(session.getStatus().playing, true)
  e.emit()
  assert.deepEqual(events, ['play', 'pause'])
  e.emit({ error: 'bad source', isLoaded: false })
  assert.equal(session.getStatus().status, 'error')
  e.emit({ isLoaded: false, playbackState: 'idle' })
  assert.equal(
    session.getStatus().error?.message,
    'bad source',
    'an unloaded idle tick is not recovery',
  )
  e.emit()
  assert.equal(session.getStatus().status, 'ready')
  assert.equal(session.getStatus().error, null)
  session.dispose()
  const before = events.length
  e.emit({ playing: true, error: 'late' })
  assert.equal(events.length, before)
  assert.deepEqual(e.calls.slice(-2), ['remove', 'pause'])
  await assert.rejects(session.play(), /longer active/)
})

test('Audio end latches on iOS periodic ready ticks; rewind clears it; loop emits no terminal end', () => {
  for (const playbackState of ['readyToPlay', 'ended']) {
    const e = engine()
    let ended = 0
    const session = new NativeAudioSession(e.player, 'a.wav', () => ({ onEnded: () => ended++ }))
    session.start({})
    e.emit({ playing: true, currentTime: 3.9 })
    e.emit({ currentTime: 4, didJustFinish: true, playbackState })
    e.emit({ currentTime: 4 })
    assert.equal(session.getStatus().status, 'ended')
    assert.equal(ended, 1)
    e.emit({ currentTime: 0 })
    assert.equal(session.getStatus().status, 'ready')
    session.setOptions({ loop: true, muted: true })
    assert.equal(e.mock.loop, true)
    assert.equal(e.mock.muted, true)
    e.emit({ currentTime: 4, didJustFinish: true, playbackState })
    assert.equal(ended, 1)
    assert.equal(session.getStatus().status, 'ready')
    session.dispose()
  }
})

test('Audio accepted async seeks await the engine, clamp known duration, and expose rejection', async () => {
  const e = engine()
  const errors: string[] = []
  const session = new NativeAudioSession(e.player, 'a.wav', () => ({
    onError: ({ operation }) => errors.push(operation),
  }))
  session.start({})
  await assert.rejects(session.seekTo(2), /not ready/)
  e.emit()
  let settled = false
  const seek = session.seekTo(10).then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(e.calls.at(-1), 4)
  assert.equal(settled, false)
  assert.equal(session.getStatus().currentTime, 0, 'request must not manufacture positioning')
  e.finishSeek()
  await seek
  const rejected = session.seekTo(1)
  e.failSeek()
  await assert.rejects(rejected, /seek failed/)
  assert.equal(session.getStatus().status, 'ready')
  assert.equal(session.getStatus().error?.operation, 'seek')
  assert.deepEqual(errors, ['seek', 'seek'])
  e.emit({ duration: 0 })
  const unknown = session.seekTo(20)
  assert.equal(e.calls.at(-1), 20)
  session.dispose()
  e.failSeek()
  await assert.rejects(unknown, /seek failed/)
  assert.equal(errors.length, 2, 'retired seek errors cannot report against replacement')
})

test('Audio autoplay attempts once after readiness, with observable denial and synchronous load errors', async () => {
  const e = engine()
  e.mock.rejectPlay = true
  const session = new NativeAudioSession(e.player, 'a.wav', () => ({}))
  session.start({ autoPlay: true })
  assert.equal(e.calls.includes('play'), false)
  e.emit()
  e.emit()
  await Promise.resolve()
  assert.equal(e.calls.filter((call) => call === 'play').length, 1)
  e.mock.rejectLoad = true
  const failed = new NativeAudioSession(e.player, 'bad.wav', () => ({}))
  failed.start({})
  assert.equal(failed.getStatus().error?.operation, 'load')
  failed.dispose()
  session.dispose()
})
