import { Audio, type AudioHandle, type AudioStatus } from '@hozo/media/audio'
import { Button, Text, View } from '@hozo/primitives'
import { useRef, useState } from 'react'

/** Sound is measured outside this app; a status label cannot satisfy the output gate. */
export function AudioPlaybackProbe({ src }: { src: string }) {
  const player = useRef<AudioHandle>(null)
  const [status, setStatus] = useState<AudioStatus | null>(null)
  const [muted, setMuted] = useState(false)
  const [mounted, setMounted] = useState(true)
  // No changing clock label: UIAutomator must be able to obtain an idle tree
  // during capture. The driver independently measures the emitted PCM.
  return (
    <View className="w-full gap-3 bg-white p-4">
      <Text className="text-lg font-bold text-slate-900">Native audio output</Text>
      {mounted && (
        <Audio
          ref={player}
          src={src}
          accessibilityLabel="Three rising tones, output probe"
          controls={false}
          loop
          muted={muted}
          onStatusChange={setStatus}
        />
      )}
      <Text className="text-base text-slate-900">
        {mounted
          ? `Audio probe: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}; muted=${muted}`
          : 'Audio probe removed'}
      </Text>
      {status?.error && <Text className="text-base text-red-700">{status.error.message}</Text>}
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        disabled={!mounted || status?.status !== 'ready'}
        onPress={() => void player.current?.play().catch(() => {})}
      >
        Play audio probe
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        disabled={!mounted}
        onPress={() => setMuted((value) => !value)}
      >
        <Text className="text-base text-white">
          {muted ? 'Unmute audio probe' : 'Mute audio probe'}
        </Text>
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => {
          setStatus(null)
          setMuted(false)
          setMounted((value) => !value)
        }}
      >
        <Text className="text-base text-white">
          {mounted ? 'Remove audio probe' : 'Mount audio probe'}
        </Text>
      </Button>
    </View>
  )
}
