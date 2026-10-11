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

function videoProbeTime(time: number): string {
  return time.toFixed(2)
}

// Diagnostic display only: keep the first visibly observed playback advance so Android
// UIAutomator can obtain an idle accessibility tree. The player still reports
// every real tick; paused times and all non-clock transitions remain observable.
export function nextVideoProbeStatus(previous: VideoStatus | null, next: VideoStatus): VideoStatus {
  if (
    !previous ||
    previous.src !== next.src ||
    previous.status !== next.status ||
    previous.playing !== next.playing ||
    previous.buffering !== next.buffering ||
    previous.duration !== next.duration ||
    previous.error?.src !== next.error?.src ||
    previous.error?.operation !== next.error?.operation ||
    previous.error?.message !== next.error?.message ||
    (!next.playing && previous.currentTime !== next.currentTime) ||
    // Use the label's precision: a real 0.250001s tick still reads as 0.25s.
    // Latching it would hide every later tick from the status reader forever.
    (next.playing &&
      Number(videoProbeTime(previous.currentTime)) <= 0.25 &&
      Number(videoProbeTime(next.currentTime)) > 0.25)
  ) {
    return next
  }
  return previous
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
            onStatusChange={(next) => setStatus((previous) => nextVideoProbeStatus(previous, next))}
            style={{ width: '100%', height: 180, backgroundColor: '#0f172b' }}
          />
        </Viewport>
      )}
      <Text className="text-base text-slate-900">
        {mounted
          ? `Video probe: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}; time=${videoProbeTime(status?.currentTime ?? 0)}; duration=${status?.duration?.toFixed(2) ?? 'unknown'}`
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
          <Text className="text-base text-white">{mounted ? 'Remove probe' : 'Mount probe'}</Text>
        </Button>
      </View>
    </View>
  )
}
