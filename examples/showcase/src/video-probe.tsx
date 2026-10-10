import { Video, type VideoHandle, type VideoStatus } from '@hozo/media'
import { Button, Text, View } from '@hozo/primitives'
import { type ComponentType, type PropsWithChildren, useRef, useState } from 'react'

function VideoViewport({ children }: PropsWithChildren) {
  return (
    <View role="img" accessibilityLabel="Local video pixel probe" className="w-full max-w-xs">
      {children}
    </View>
  )
}

/** A real player, not a simulated clock; paused seeks isolate pixels from UI text. */
export function VideoPlaybackProbe({
  src,
  Viewport = VideoViewport,
}: {
  src: string
  Viewport?: ComponentType<PropsWithChildren>
}) {
  const player = useRef<VideoHandle>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [mounted, setMounted] = useState(true)
  const ready = mounted && status?.status === 'ready'
  return (
    <View className="w-full gap-3 bg-white p-4">
      <Text className="text-lg font-bold text-slate-900">Native video playback</Text>
      {mounted && (
        <Viewport>
          <Video
            ref={player}
            src={src}
            accessibilityLabel="Moving square, silent video"
            controls={false}
            muted
            loop
            onStatusChange={setStatus}
            style={{ width: '100%', height: 180, backgroundColor: '#0f172b' }}
          />
        </Viewport>
      )}
      <Text className="text-base text-slate-900">
        {mounted
          ? `Video probe: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}; time=${(status?.currentTime ?? 0).toFixed(2)}; duration=${status?.duration?.toFixed(2) ?? 'unknown'}`
          : 'Video probe removed'}
      </Text>
      {status?.error && <Text className="text-base text-red-700">{status.error.message}</Text>}
      <View className="flex-row flex-wrap gap-2">
        <Button
          className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
          disabled={!ready}
          onPress={() => void player.current?.play().catch(() => {})}
        >
          Play probe
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
          disabled={!mounted}
          onPress={() => player.current?.pause()}
        >
          Pause probe
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
          disabled={!ready}
          onPress={() => player.current?.seekTo(0)}
        >
          Seek probe start
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
          disabled={!ready}
          onPress={() => player.current?.seekTo(2)}
        >
          Seek probe middle
        </Button>
        <Button
          className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
          onPress={() => {
            setStatus(null)
            setMounted((value) => !value)
          }}
        >
          {mounted ? 'Remove probe' : 'Mount probe'}
        </Button>
      </View>
    </View>
  )
}
