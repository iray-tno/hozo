import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoHandle, VideoOptions } from './types.ts'

/** The keyed host owns one source; events from a retired element never cross it. */
export class DomVideoSession implements VideoHandle {
  private observer: VideoObserver
  private active = true
  private removers: (() => void)[] = []
  private options: VideoOptions = {}
  private autoplayAttempted = false

  constructor(
    private element: HTMLVideoElement,
    private src: string,
    callbacks: () => VideoCallbacks,
  ) {
    this.observer = new VideoObserver(src, callbacks)
  }

  start(options: VideoOptions) {
    // StrictMode replays effects without remounting the DOM node. Cleanup
    // revoked the resource, so its next owner must restore it explicitly.
    if (this.element.getAttribute('src') !== this.src) this.element.src = this.src
    const listen = (name: string, handler: () => void) => {
      this.element.addEventListener(name, handler)
      this.removers.push(() => this.element.removeEventListener(name, handler))
    }
    const times = () => ({
      currentTime: this.element.currentTime,
      duration: durationValue(this.element.duration),
    })
    const ready = () => {
      this.observer.update({ status: 'ready', ...times(), buffering: false, error: null })
      this.maybeAutoplay()
    }
    listen('loadedmetadata', ready)
    listen('canplay', () => {
      if (this.getStatus().status !== 'ended') ready()
    })
    listen('durationchange', () => this.observer.update(times()))
    listen('timeupdate', () => this.observer.update(times()))
    listen('play', () => this.observer.update({ status: 'ready', playing: true, error: null }))
    listen('playing', () => this.observer.update({ playing: true, buffering: false }))
    listen('pause', () => this.observer.update({ playing: false }))
    listen('waiting', () => this.observer.update({ buffering: true }))
    listen('ended', () => this.observer.ended())
    listen('error', () =>
      this.observer.fail('load', new Error(this.element.error?.message || 'Video could not load')),
    )
    this.setOptions(options)
    if (this.element.error) {
      this.observer.fail('load', new Error(this.element.error.message || 'Video could not load'))
    } else if (this.element.readyState >= 1) {
      ready()
    } else {
      this.observer.update({})
    }
  }

  setOptions(options: VideoOptions) {
    if (!this.active) return
    this.options = options
    this.element.loop = options.loop ?? false
    this.element.muted = options.muted ?? false
    this.maybeAutoplay()
  }

  private maybeAutoplay() {
    if (this.options.autoPlay && !this.autoplayAttempted && this.getStatus().status === 'ready') {
      this.autoplayAttempted = true
      // A denied autoplay is observable but must not become an unhandled rejection.
      void this.play().catch(() => {})
    }
  }

  async play() {
    if (!this.active) throw new Error('Video source is no longer active')
    try {
      await this.element.play()
    } catch (error) {
      this.observer.fail('play', error)
      throw error
    }
  }

  pause() {
    if (this.active) this.element.pause()
  }

  seekTo(seconds: number) {
    if (!this.active) throw new Error('Video source is no longer active')
    try {
      this.element.currentTime = seekTime(seconds, this.getStatus())
    } catch (error) {
      this.observer.fail('seek', error)
      throw error
    }
  }

  getStatus() {
    return this.observer.snapshot()
  }

  dispose() {
    if (!this.active) return
    this.active = false
    this.observer.dispose()
    for (const remove of this.removers) remove()
    this.removers = []
    this.element.pause()
    // The old source must stop downloading too, not just stop making sound.
    this.element.removeAttribute('src')
    this.element.load()
  }
}
