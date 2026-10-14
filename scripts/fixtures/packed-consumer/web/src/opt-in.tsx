import { Video, type VideoProps } from '@hozo/media'
import { Audio, type AudioProps } from '@hozo/media/audio'
import { WebView, type WebViewProps } from '@hozo/webview'

const video: VideoProps = { src: '/video.mp4', accessibilityLabel: 'Product video' }
const audio: AudioProps = { src: '/audio.wav', accessibilityLabel: 'Product audio' }
const frame: WebViewProps = { srcDoc: '<p>Embedded content</p>', title: 'Product details' }

// Included in the installed-package typecheck, not mounted by the browser
// fixture. Its unrelated pointer/theme checks should not fetch media.
export function OptInTypes() {
  return (
    <>
      <Video {...video} />
      <Audio {...audio} />
      <WebView {...frame} />
    </>
  )
}
