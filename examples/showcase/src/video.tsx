import { Video, VideoControls, type VideoHandle, type VideoStatus } from '@hozo/media'
import { MediaCaptionSelector, MediaCaptions } from '@hozo/media/captions'
import { Button, Text, View } from '@hozo/primitives'
import { Heading } from '@hozo/typography'
import { useRef, useState } from 'react'
import { MediaSeekControl } from './media-seek.tsx'
import { japaneseSquareCues, squareCaptionOptions, squareCues } from './video-captions.ts'

/** The two hosts supply the same checked-in MP4 through their own asset loader. */
export function VideoDemo({
  src,
  customControls = false,
  captions = false,
  poster,
}: {
  src: string
  customControls?: boolean
  captions?: boolean
  poster?: string
}) {
  const video = useRef<VideoHandle>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [muted, setMuted] = useState(true)
  const [loop, setLoop] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [visible, setVisible] = useState(true)
  const [captionId, setCaptionId] = useState<string | null>('en')
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
          poster={poster}
          accessibilityLabel="Moving square, silent video"
          testID="showcase-video"
          controls={!customControls}
          muted={muted}
          loop={loop}
          playbackRate={playbackRate}
          onStatusChange={setStatus}
          style={{ height: 180, width: '100%', backgroundColor: '#0f172b' }}
        />
      )}
      {captions && (
        <MediaCaptions
          src={src}
          status={visible ? status : null}
          cues={captionId === 'ja' ? japaneseSquareCues : squareCues}
          enabled={captionId !== null}
          accessibilityLabel="Animation captions"
        />
      )}
      <Text className="text-base text-slate-700">
        {visible
          ? `Video: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}`
          : 'Video removed'}
      </Text>
      {!customControls && status?.error && (
        <Text className="text-base text-red-700">{status.error.message}</Text>
      )}
      {customControls && (
        <>
          <VideoControls player={video} status={status} disabled={!visible} seekStep={1} />
          <MediaSeekControl player={video} status={visible ? status : null} disabled={!visible} />
        </>
      )}
      <View className="gap-2">
        <Text className="text-base text-slate-700">{`Requested video speed: ${playbackRate}x; pitch correction on`}</Text>
        <Button
          className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onPress={() => setPlaybackRate((value) => (value === 1 ? 2 : 1))}
        >
          {playbackRate === 1 ? 'Set video speed to 2x' : 'Set video speed to 1x'}
        </Button>
        {captions && (
          <MediaCaptionSelector
            options={squareCaptionOptions}
            value={captionId}
            onValueChange={setCaptionId}
          />
        )}
        {!customControls && (
          <>
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
          </>
        )}
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
