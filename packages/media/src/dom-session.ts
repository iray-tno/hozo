import { mediaPlaybackOptions, samePlaybackRate } from './playback-rate.ts'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoError, VideoHandle, VideoOptions } from './types.ts'
import { mediaVolume } from './volume.ts'

/** The keyed host owns one source; events from a retired element never cross it. */
export class DomMediaSession implements VideoHandle {
  private observer: VideoObserver
  private active = true
  private removers: (() => void)[] = []
  private options: VideoOptions = {}
  private autoplayAttempted = false
  private volumeError: VideoError | null = null
  private rateError: VideoError | null = null

  constructor(
    private element: HTMLMediaElement,
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
      this.observer.update({
        status: 'ready',
        ...times(),
        buffering: false,
        error: this.rateError ?? this.volumeError,
      })
      this.maybeAutoplay()
    }
    listen('loadedmetadata', ready)
    listen('canplay', () => {
      if (this.getStatus().status !== 'ended') ready()
    })
    listen('durationchange', () => this.observer.update(times()))
    listen('timeupdate', () => this.observer.update(times()))
    listen('play', () =>
      this.observer.update({
        status: 'ready',
        playing: true,
        error: this.rateError ?? this.volumeError,
      }),
    )
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
    const volume = mediaVolume(options.volume)
    const { playbackRate, preservesPitch } = mediaPlaybackOptions(options)
    this.options = options
    this.element.loop = options.loop ?? false
    this.element.muted = options.muted ?? false
    try {
      if (this.element.volume !== volume) this.element.volume = volume
      // Some browsers accept assignment but ignore it. A writable JS property
      // still cannot certify loudness; this detects only observable rejection.
      if (this.element.volume !== volume)
        throw new Error('This media engine ignored the requested volume')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.volumeError = { src: this.src, operation: 'volume', message }
      this.observer.fail('volume', cause)
      return
    }
    this.volumeError = null
    if (this.getStatus().error?.operation === 'volume') this.observer.update({ error: null })
    try {
      this.element.preservesPitch = preservesPitch
      if (!samePlaybackRate(this.element.playbackRate, playbackRate))
        this.element.playbackRate = playbackRate
      if (
        !samePlaybackRate(this.element.playbackRate, playbackRate) ||
        this.element.preservesPitch !== preservesPitch
      )
        throw new Error('This media engine ignored the requested playback rate or pitch policy')
    } catch (cause) {
      this.rateError = {
        src: this.src,
        operation: 'rate',
        message: cause instanceof Error ? cause.message : String(cause),
      }
      this.observer.fail('rate', cause)
      return
    }
    this.rateError = null
    if (this.getStatus().error?.operation === 'rate') this.observer.update({ error: null })
    this.maybeAutoplay()
  }

  private maybeAutoplay() {
    if (
      this.options.autoPlay &&
      !this.volumeError &&
      !this.rateError &&
      !this.autoplayAttempted &&
      this.getStatus().status === 'ready'
    ) {
      this.autoplayAttempted = true
      // A denied autoplay is observable but must not become an unhandled rejection.
      void this.play().catch(() => {})
    }
  }

  async play() {
    if (!this.active) throw new Error('Media source is no longer active')
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
    if (!this.active) throw new Error('Media source is no longer active')
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

// Preserve the Video adapter's existing internal name while sharing the
// actual HTMLMediaElement event/lifetime policy with Audio.
export { DomMediaSession as DomVideoSession }
