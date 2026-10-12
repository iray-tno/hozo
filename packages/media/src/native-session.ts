import type { VideoPlayer } from 'expo-video'
import { mediaPlaybackOptions, samePlaybackRate } from './playback-rate.ts'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoError, VideoHandle, VideoOptions } from './types.ts'
import { mediaVolume } from './volume.ts'

/** A new Expo player per source avoids attributing an old asynchronous load to a new URI. */
export class NativeVideoSession implements VideoHandle {
  private observer: VideoObserver
  private active = true
  private subscriptions: { remove(): void }[] = []
  private options: VideoOptions = {}
  private autoplayAttempted = false
  private rateError: VideoError | null = null

  constructor(
    private player: VideoPlayer,
    private src: string,
    callbacks: () => VideoCallbacks,
  ) {
    this.observer = new VideoObserver(src, callbacks)
  }

  start(options: VideoOptions) {
    this.options = options
    this.subscriptions = [
      this.player.addListener('statusChange', ({ status, error }) =>
        this.syncStatus(status, error?.message),
      ),
      this.player.addListener('playingChange', ({ isPlaying }) => {
        if (!this.active) return
        if (isPlaying) this.applyRate()
        this.observer.update({
          playing: isPlaying,
          ...(isPlaying && this.getStatus().status === 'ended' ? { status: 'ready' } : {}),
        })
      }),
      this.player.addListener('timeUpdate', ({ currentTime }) =>
        this.observer.update({ currentTime, duration: this.duration() }),
      ),
      this.player.addListener('sourceLoad', ({ duration }) =>
        this.observer.update({ duration: this.duration(duration) }),
      ),
      this.player.addListener('playToEnd', () => {
        // iOS Expo emits this even when it immediately seeks/replays a loop.
        // HTML video emits no terminal ended event in that case.
        if (!this.options.loop) this.observer.ended()
      }),
    ]
    this.setOptions(options)
    this.syncStatus()
    // Loading through the async API avoids blocking iOS's UI thread in
    // the player's constructor. Each source has its own player and epoch.
    void this.player
      .replaceAsync(this.src)
      .catch((error: unknown) => this.observer.fail('load', error))
  }

  private syncStatus(status = this.player.status, message?: string) {
    if (!this.active) return
    if (status === 'error') {
      this.observer.fail('load', new Error(message ?? 'Video could not load'))
      return
    }
    const ready = status === 'readyToPlay'
    this.observer.update({
      status: ready ? (this.getStatus().status === 'ended' ? 'ended' : 'ready') : 'loading',
      buffering: status === 'loading',
      playing: this.player.playing,
      currentTime: this.player.currentTime,
      duration: this.duration(),
      error: this.rateError,
    })
    this.maybeAutoplay()
  }

  private duration(value = this.player.duration) {
    // A live engine can expose a finite DVR window, not a finite total.
    // Re-read the flag on each observation; it is not a source-time guess.
    return this.player.isLive ? null : durationValue(value)
  }

  setOptions(options: VideoOptions) {
    if (!this.active) return
    const volume = mediaVolume(options.volume)
    mediaPlaybackOptions(options)
    this.options = options
    this.player.loop = options.loop ?? false
    this.player.muted = options.muted ?? false
    this.player.volume = volume
    this.player.timeUpdateEventInterval = 0.25
    // Expo iOS assigns AVPlayer.rate in its rate setter, starting paused video.
    // Keep a paused request pending until explicit/platform activation instead.
    if (this.player.playing) this.applyRate()
    this.maybeAutoplay()
  }

  private applyRate() {
    if (!this.active) return false
    const wasPlaying = this.player.playing
    const { playbackRate, preservesPitch } = mediaPlaybackOptions(this.options)
    try {
      this.player.preservesPitch = preservesPitch
      if (!samePlaybackRate(this.player.playbackRate, playbackRate))
        this.player.playbackRate = playbackRate
      if (
        !samePlaybackRate(this.player.playbackRate, playbackRate) ||
        this.player.preservesPitch !== preservesPitch
      )
        throw new Error('This media engine ignored the requested playback rate or pitch policy')
      this.rateError = null
      if (this.getStatus().error?.operation === 'rate') this.observer.update({ error: null })
      return true
    } catch (cause) {
      // A rate setter may have started AVPlayer before a later readback fails.
      // Do not leave that side effect running after a rejected paused request.
      if (!wasPlaying && this.active) this.player.pause()
      this.rateError = {
        src: this.src,
        operation: 'rate',
        message: cause instanceof Error ? cause.message : String(cause),
      }
      this.observer.fail('rate', cause)
      return false
    }
  }

  private maybeAutoplay() {
    if (
      this.options.autoPlay &&
      !this.rateError &&
      !this.autoplayAttempted &&
      this.getStatus().status === 'ready'
    ) {
      this.autoplayAttempted = true
      void this.play().catch(() => {})
    }
  }

  async play() {
    if (!this.active) throw new Error('Video source is no longer active')
    if (!this.applyRate()) throw new Error(this.rateError?.message ?? 'Playback rate was rejected')
    // Clearing a prior denial notifies author callbacks, which may retire us.
    if (!this.active) throw new Error('Video source is no longer active')
    try {
      this.player.play()
    } catch (error) {
      this.observer.fail('play', error)
      throw error
    }
  }

  pause() {
    if (this.active) this.player.pause()
  }

  seekTo(seconds: number) {
    if (!this.active) throw new Error('Video source is no longer active')
    try {
      this.player.currentTime = seekTime(seconds, this.getStatus())
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
    for (const subscription of this.subscriptions) subscription.remove()
    this.subscriptions = []
    // The committed host owns release, after listeners and playback stop.
    this.player.pause()
  }
}
