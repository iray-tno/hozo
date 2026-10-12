import type { AudioPlayer, AudioStatus as ExpoAudioStatus } from 'expo-audio'
import type { AudioHandle } from './audio-types.ts'
import { mediaPlaybackOptions } from './playback-rate.ts'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoError, VideoOptions } from './types.ts'
import { mediaVolume } from './volume.ts'

/** One committed player/source; never change global session, recording or lock-screen policy. */
export class NativeAudioSession implements AudioHandle {
  private observer: VideoObserver
  private active = true
  private subscription: { remove(): void } | null = null
  private options: VideoOptions = {}
  private autoplayAttempted = false
  private rateError: VideoError | null = null
  private loaded = false

  constructor(
    private player: AudioPlayer,
    private src: string,
    callbacks: () => VideoCallbacks,
  ) {
    this.observer = new VideoObserver(src, callbacks)
  }
  start(options: VideoOptions) {
    this.options = options
    this.subscription = this.player.addListener('playbackStatusUpdate', (status) =>
      this.observe(status),
    )
    this.setOptions(options)
    this.observer.update({})
    try {
      this.player.replace({ uri: this.src })
    } catch (error) {
      this.observer.fail('load', error)
    }
  }
  private observe(status: ExpoAudioStatus) {
    if (!this.active) return
    if (status.error) {
      this.observer.fail('load', new Error(status.error))
      return
    }
    const previous = this.getStatus()
    if (status.isLoaded && !this.loaded) {
      this.loaded = true
      // iOS pitch configuration before replace targets the old/nil AVPlayerItem.
      // Reapply to the newly loaded item, before autoplay and loop-item cloning.
      this.applyRate(true)
    } else if (!status.isLoaded) this.loaded = false
    // Expo's periodic snapshot may drop the transient error field while the
    // failed source remains unloaded. Do not present that as error recovery.
    if (previous.status === 'error' && !status.isLoaded) return
    // Expo reports didJustFinish for a loop too. Android also emits an ended
    // playbackState; iOS keeps readyToPlay and subsequent ticks reset the flag.
    const ended =
      !this.options.loop &&
      (status.didJustFinish ||
        status.playbackState === 'ended' ||
        (previous.status === 'ended' &&
          !status.playing &&
          status.currentTime >= previous.currentTime))
    this.observer.update({
      status: ended ? previous.status : status.isLoaded ? 'ready' : 'loading',
      playing: ended ? false : status.playing,
      buffering: status.isBuffering,
      currentTime: status.currentTime,
      duration: status.isLive ? null : durationValue(status.duration),
      error: this.rateError,
    })
    if (ended) this.observer.ended()
    this.maybeAutoplay()
  }
  setOptions(options: VideoOptions) {
    if (!this.active) return
    const volume = mediaVolume(options.volume)
    const requested = mediaPlaybackOptions(options)
    const refreshLoop =
      this.loaded && requested.preservesPitch !== mediaPlaybackOptions(this.options).preservesPitch
    this.options = options
    this.player.loop = options.loop ?? false
    this.player.muted = options.muted ?? false
    // Android's Expo mute setter restores its cached gain. Apply the authored
    // gain afterwards, including zero selected while muted, not that old cache.
    this.player.volume = volume
    this.applyRate(refreshLoop)
    this.maybeAutoplay()
  }

  private applyRate(refreshLoop = false) {
    if (!this.active) return false
    const { playbackRate, preservesPitch } = mediaPlaybackOptions(this.options)
    try {
      // Expo iOS clones the current item's pitch algorithm into its queued
      // loop item. Rebuild that queue after new-item/pitch configuration so an
      // old loop copy cannot undo an authored pitch-only change on the next lap.
      if (refreshLoop && this.options.loop) this.player.loop = false
      this.player.shouldCorrectPitch = preservesPitch
      // Android samples preservesPitch inside the queued setPlaybackRate task.
      // iOS uses spectral correction for high, matching Expo Video's algorithm.
      this.player.setPlaybackRate(playbackRate, 'high')
      this.rateError = null
      if (this.getStatus().error?.operation === 'rate') this.observer.update({ error: null })
      return true
    } catch (cause) {
      this.rateError = {
        src: this.src,
        operation: 'rate',
        message: cause instanceof Error ? cause.message : String(cause),
      }
      this.observer.fail('rate', cause)
      return false
    } finally {
      if (refreshLoop && this.options.loop && this.active) this.player.loop = true
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
    if (!this.active) throw new Error('Audio source is no longer active')
    if (!this.applyRate()) throw new Error(this.rateError?.message ?? 'Playback rate was rejected')
    // Error recovery callbacks may synchronously unmount/replace this source.
    if (!this.active) throw new Error('Audio source is no longer active')
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
  async seekTo(seconds: number) {
    if (!this.active) throw new Error('Audio source is no longer active')
    try {
      await this.player.seekTo(seekTime(seconds, this.getStatus()))
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
    this.subscription?.remove()
    this.subscription = null
    this.player.pause()
  }
}
