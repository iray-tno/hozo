import type { VideoStatus } from './types.ts'

/** One committed decoder lifetime. Metadata readiness is not a frame signal. */
export class VideoPresentation {
  private active = true
  private frameReady = false
  private viewing = false
  private observed: VideoStatus | null = null

  constructor(private changed: (stateChanged: boolean) => void) {}

  get showingPoster() {
    return !(this.frameReady && this.viewing)
  }
  get status() {
    return this.observed
  }
  observe(status: VideoStatus) {
    if (!this.active) return
    // An application callback must not mutate the internal controls' snapshot.
    this.observed = { ...status, error: status.error ? { ...status.error } : null }
    const started = status.playing && !this.viewing
    if (started) this.viewing = true
    this.changed(started)
  }
  beginViewing() {
    if (!this.active || this.viewing) return
    this.viewing = true
    this.changed(true)
  }
  frame() {
    if (!this.active || this.frameReady) return
    this.frameReady = true
    this.changed(true)
  }
  dispose() {
    this.active = false
  }
}
