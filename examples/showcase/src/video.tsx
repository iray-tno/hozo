import { Video, type VideoHandle, type VideoStatus } from '@hozo/media'
import { Button, Text, View } from '@hozo/primitives'
import { Heading } from '@hozo/typography'
import { useRef, useState } from 'react'

/** The two hosts supply the same checked-in MP4 through their own asset loader. */
export function VideoDemo({ src }: { src: string }) {
  const video = useRef<VideoHandle>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [muted, setMuted] = useState(true)
  const [loop, setLoop] = useState(false)
  const [visible, setVisible] = useState(true)
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Video playback
      </Heading>
      <Text className="text-base text-slate-700">
        Silent animation: a purple square moves from left to right across a dark background.
      </Text>
      {visible && (
        <Video
          ref={video}
          src={src}
          accessibilityLabel="Moving square, silent video"
          testID="showcase-video"
          controls
          muted={muted}
          loop={loop}
          onStatusChange={setStatus}
          style={{ height: 180, width: '100%', backgroundColor: '#0f172b' }}
        />
      )}
      <Text className="text-base text-slate-700">
        {visible
          ? `Video: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}`
          : 'Video removed'}
      </Text>
      {status?.error && <Text className="text-base text-red-700">{status.error.message}</Text>}
      <View className="gap-2">
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={!visible}
          onPress={() => void video.current?.play().catch(() => {})}
        >
          Play video
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={!visible}
          onPress={() => video.current?.pause()}
        >
          Pause video
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={!visible || status?.status === 'loading' || status?.status === 'error'}
          onPress={() => video.current?.seekTo(0)}
        >
          Restart video
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onPress={() => setMuted((value) => !value)}
        >
          {muted ? 'Unmute video' : 'Mute video'}
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onPress={() => setLoop((value) => !value)}
        >
          {loop ? 'Disable video loop' : 'Enable video loop'}
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onPress={() => {
            setVisible((value) => !value)
            setStatus(null)
          }}
        >
          {visible ? 'Remove video' : 'Mount video'}
        </Button>
      </View>
    </View>
  )
}
