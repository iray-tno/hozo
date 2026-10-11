import type { AudioPlayer, AudioStatus as ExpoAudioStatus } from 'expo-audio'
import type { AudioHandle } from './audio-types.ts'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoOptions } from './types.ts'

/** One committed player/source; never change global session, recording or lock-screen policy. */
export class NativeAudioSession implements AudioHandle {
  private observer: VideoObserver
  private active = true
  private subscription: { remove(): void } | null = null
  private options: VideoOptions = {}
  private autoplayAttempted = false

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
      error: null,
    })
    if (ended) this.observer.ended()
    this.maybeAutoplay()
  }
  setOptions(options: VideoOptions) {
    if (!this.active) return
    this.options = options
    this.player.loop = options.loop ?? false
    this.player.muted = options.muted ?? false
    this.maybeAutoplay()
  }
  private maybeAutoplay() {
    if (this.options.autoPlay && !this.autoplayAttempted && this.getStatus().status === 'ready') {
      this.autoplayAttempted = true
      void this.play().catch(() => {})
    }
  }
  async play() {
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
