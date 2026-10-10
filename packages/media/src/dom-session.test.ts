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
  assert.match(html, /^<video /)
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
