/** Prefer compositor submission; older hosts provide only decoded-frame availability. */
export function watchVideoFrame(video: HTMLVideoElement, frame: () => void): () => void {
  let active = true
  const observed = () => {
    if (!active) return
    active = false
    frame()
  }
  if (typeof video.requestVideoFrameCallback === 'function') {
    const id = video.requestVideoFrameCallback(observed)
    return () => {
      active = false
      video.cancelVideoFrameCallback(id)
    }
  }
  // HAVE_CURRENT_DATA/loadeddata means a current frame, unlike loadedmetadata.
  // This fallback does not prove compositor submission or visible pixels.
  const available = () => {
    if (video.readyState >= 2) observed()
  }
  video.addEventListener('loadeddata', available)
  video.addEventListener('canplay', available)
  video.addEventListener('seeked', available)
  available()
  return () => {
    active = false
    video.removeEventListener('loadeddata', available)
    video.removeEventListener('canplay', available)
    video.removeEventListener('seeked', available)
  }
}
