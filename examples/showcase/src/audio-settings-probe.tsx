import { Audio, type AudioHandle, type AudioStatus } from '@hozo/media/audio'
import { Button, Text, View } from '@hozo/primitives'
import { useRef, useState } from 'react'

/** Request labels acknowledge UI state; only external PCM can certify output. */
export function AudioSettingsProbe({ src }: { src: string }) {
  const player = useRef<AudioHandle>(null)
  const [status, setStatus] = useState<AudioStatus | null>(null)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(true)
  return (
    <View className="w-full gap-2 bg-white p-4">
      <Text className="text-lg font-bold text-slate-900">Native audio settings output</Text>
      <Audio
        ref={player}
        src={src}
        accessibilityLabel="Three tones, settings output probe"
        controls={false}
        loop
        volume={volume}
        playbackRate={rate}
        preservesPitch={pitch}
        onStatusChange={setStatus}
      />
      <Text className="text-base text-slate-900">
        {`Audio settings probe: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}`}
      </Text>
      <Text className="text-base text-slate-900">
        {`Requested volume: ${volume}; speed: ${rate}x; pitch=${pitch}`}
      </Text>
      {status?.error && <Text className="text-base text-red-700">{status.error.message}</Text>}
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        disabled={status?.status !== 'ready'}
        onPress={() => void player.current?.play().catch(() => {})}
      >
        Play settings probe
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => setVolume(0.25)}
      >
        Quarter probe volume
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => setVolume(1)}
      >
        Full probe volume
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => setRate(0.5)}
      >
        Half probe speed
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => setRate(2)}
      >
        Double probe speed
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => setPitch(false)}
      >
        Disable probe pitch correction
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-3 py-3 text-base text-white"
        onPress={() => {
          setVolume(1)
          setRate(1)
          setPitch(true)
        }}
      >
        Reset probe settings
      </Button>
    </View>
  )
}
