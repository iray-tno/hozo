import type { VideoPlayer } from 'expo-video'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import type { VideoCallbacks, VideoHandle, VideoOptions } from './types.ts'

/** A new Expo player per source avoids attributing an old asynchronous load to a new URI. */
export class NativeVideoSession implements VideoHandle {
  private observer: VideoObserver
  private active = true
  private subscriptions: { remove(): void }[] = []
  private options: VideoOptions = {}
  private autoplayAttempted = false

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
      this.player.addListener('playingChange', ({ isPlaying }) =>
        this.observer.update({
          playing: isPlaying,
          ...(isPlaying && this.getStatus().status === 'ended' ? { status: 'ready' } : {}),
        }),
      ),
      this.player.addListener('timeUpdate', ({ currentTime }) =>
        this.observer.update({ currentTime, duration: durationValue(this.player.duration) }),
      ),
      this.player.addListener('sourceLoad', ({ duration }) =>
        this.observer.update({ duration: durationValue(duration) }),
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
      duration: durationValue(this.player.duration),
      error: null,
    })
    this.maybeAutoplay()
  }

  setOptions(options: VideoOptions) {
    if (!this.active) return
    this.options = options
    this.player.loop = options.loop ?? false
    this.player.muted = options.muted ?? false
    this.player.timeUpdateEventInterval = 0.25
    this.maybeAutoplay()
  }

  private maybeAutoplay() {
    if (this.options.autoPlay && !this.autoplayAttempted && this.getStatus().status === 'ready') {
      this.autoplayAttempted = true
      void this.play().catch(() => {})
    }
  }

  async play() {
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
    // useVideoPlayer owns release; this session must not double-release it.
    // React may already have cleaned that hook up when our passive cleanup runs.
    try {
      this.player.pause()
    } catch {
      // A released player cannot keep playing or notify our retired observer.
    }
  }
}
