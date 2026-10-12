import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DomVideoSession } from './dom-session.ts'
import { Video } from './index.ts'

class FakeVideo extends EventTarget {
  src: string | null = 'a.mp4'
  readyState = 0
  currentTime = 0
  duration = Number.NaN
  ranges: { start: number; end: number }[] | null = null
  get seekable() {
    const ranges = this.ranges ?? (this.duration > 0 ? [{ start: 0, end: this.duration }] : [])
    return {
      length: ranges.length,
      start: (index: number) => ranges[index]?.start ?? NaN,
      end: (index: number) => ranges[index]?.end ?? NaN,
    }
  }
  loop = false
  muted = false
  error: { message: string } | null = null
  plays = 0
  pauses = 0
  loads = 0
  rejectPlay = false
  getAttribute() {
    return this.src
  }
  removeAttribute() {
    this.src = null
  }
  async play() {
    this.plays++
    if (this.rejectPlay) throw new Error('Autoplay denied')
  }
  pause() {
    this.pauses++
  }
  load() {
    this.loads++
  }
  emit(name: string) {
    this.dispatchEvent(new Event(name))
  }
}

test('poster requires an explicit nonempty URI rather than silently dropping unsupported assets', () => {
  for (const poster of ['', '  ', null, 42]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(Video, {
            src: 'a.mp4',
            accessibilityLabel: 'Clip',
            poster: poster as string,
          }),
        ),
      /Video poster must be a nonempty URL or URI/,
    )
  }
})

test('Web renders named semantic video, native controls and portable style without Native imports', () => {
  const html = renderToStaticMarkup(
    createElement(Video, {
      src: 'a.mp4',
      accessibilityLabel: 'Silent clip',
      testID: 'clip',
      style: { height: 200 },
      fit: 'cover',
    }),
  )
  assert.match(html, /^<div /)
  assert.match(html, /<video /)
  assert.match(html, /aria-label="Silent clip"/)
  assert.match(html, /controls=""/)
  assert.match(html, /playsInline=""/)
  assert.match(html, /object-fit:cover/)
  assert.doesNotMatch(html, /role=|onStatusChange|accessibilityLabel/)
})

test('Web loading, buffering, end, denied autoplay and option changes use actual observations', async () => {
  const element = new FakeVideo()
  const errors: string[] = []
  element.rejectPlay = true
  const session = new DomVideoSession(element as unknown as HTMLVideoElement, 'a.mp4', () => ({
    onError: ({ message }) => errors.push(message),
  }))
  session.start({ autoPlay: true, loop: true, muted: true })
  assert.equal(element.plays, 0)
  element.duration = 4
  element.emit('loadedmetadata')
  element.emit('canplay')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(element.plays, 1)
  assert.deepEqual(errors, ['Autoplay denied'])
  assert.equal(session.getStatus().playing, false)
  assert.equal(session.getStatus().status, 'ready')
  element.emit('play')
  element.emit('waiting')
  assert.equal(session.getStatus().buffering, true)
  element.emit('playing')
  assert.equal(session.getStatus().buffering, false)
  session.seekTo(100)
  assert.equal(element.currentTime, 4)
  element.emit('timeupdate')
  assert.equal(session.getStatus().currentTime, 4)
  element.emit('ended')
  assert.equal(session.getStatus().status, 'ended')
  session.setOptions({ muted: false, loop: false })
  assert.equal(element.loop, false)
  assert.equal(element.muted, false)
  session.dispose()
})

test('DOM retirement releases media and prevents events; StrictMode replay restores the URI', () => {
  const element = new FakeVideo()
  const events: string[] = []
  const old = new DomVideoSession(element as unknown as HTMLVideoElement, 'a.mp4', () => ({
    onStatusChange: () => events.push('old'),
  }))
  old.start({})
  old.dispose()
  assert.equal(element.src, null)
  assert.equal(element.loads, 1)
  events.length = 0
  element.emit('loadedmetadata')
  element.emit('error')
  assert.equal(events.length, 0)
  const next = new DomVideoSession(element as unknown as HTMLVideoElement, 'a.mp4', () => ({
    onStatusChange: () => events.push('new'),
  }))
  next.start({})
  assert.equal(element.src, 'a.mp4')
  element.error = { message: 'Invalid clip' }
  element.emit('error')
  assert.equal(next.getStatus().error?.message, 'Invalid clip')
  next.dispose()
})

test('DOM observes empty/recovered ranges and commands recheck silent changes without optimistic clocks', () => {
  const element = new FakeVideo()
  element.duration = 10
  element.readyState = 1
  element.ranges = []
  const observations: import('./types.ts').MediaStatus[] = []
  const session = new DomVideoSession(element as unknown as HTMLMediaElement, 'a.mp4', () => ({
    onStatusChange: (value) => observations.push(value),
  }))
  session.start({})
  assert.equal(session.getStatus().status, 'ready')
  assert.equal(observations.at(-1)?.seekability.status, 'unavailable')
  assert.throws(() => session.seekTo(4), /no observed seekable range/)
  assert.equal(element.currentTime, 0)
  assert.equal(session.getStatus().error?.operation, 'seek')
  element.ranges = [
    { start: 2, end: 4 },
    { start: 6, end: 9 },
  ]
  element.emit('progress')
  assert.equal(observations.at(-1)?.seekability.status, 'available')
  const count = observations.length
  element.ranges = [{ start: 7, end: 9 }]
  session.seekTo(3)
  assert.equal(element.currentTime, 7, 'not the old range or the duration')
  assert.equal(session.getStatus().currentTime, 0, 'accepted assignment is not an observation')
  assert.equal(observations.length, count, 'range readback emits no synthetic status update')
  element.ranges = []
  assert.throws(() => session.seekTo(8), /no observed seekable range/)
  assert.equal(element.currentTime, 7)
  assert.equal(
    observations.at(-1)?.seekability.status,
    'unavailable',
    'the denial reports fresh range evidence before any progress event',
  )
  element.emit('progress')
  assert.equal(observations.at(-1)?.seekability.status, 'unavailable')
  session.dispose()
  const after = observations.length
  element.ranges = [{ start: 0, end: 10 }]
  element.emit('progress')
  assert.equal(observations.length, after)
  assert.equal(session.getStatus().seekability.status, 'unavailable')
})
