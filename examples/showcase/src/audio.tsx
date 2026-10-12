import { Audio, type AudioHandle, type AudioStatus } from '@hozo/media/audio'
import { Button, Text, View } from '@hozo/primitives'
import { Heading } from '@hozo/typography'
import { useRef, useState } from 'react'
import { MediaSeekControl } from './media-seek.tsx'

export function AudioDemo({ src }: { src: string }) {
  const audio = useRef<AudioHandle>(null)
  const [status, setStatus] = useState<AudioStatus | null>(null)
  const [visible, setVisible] = useState(true)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loop, setLoop] = useState(false)
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Audio playback
      </Heading>
      <Text className="text-base text-slate-700">
        Three soft tones rise in pitch, with silence between them. No speech or music.
      </Text>
      {visible && (
        <Audio
          ref={audio}
          src={src}
          accessibilityLabel="Three rising tones"
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          loop={loop}
          onStatusChange={setStatus}
        />
      )}
      <Text className="text-base text-slate-700">
        {visible
          ? `Audio: ${status?.status ?? 'loading'}; ${status?.playing ? 'playing' : 'paused'}`
          : 'Audio removed'}
      </Text>
      <MediaSeekControl player={audio} status={visible ? status : null} disabled={!visible} />
      <Text className="text-base text-slate-700">
        {`Requested player volume: ${Math.round(volume * 100)}%${muted ? '; muted' : ''}`}
      </Text>
      <Text className="text-base text-slate-700">{`Requested audio speed: ${playbackRate}x; pitch correction on`}</Text>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setPlaybackRate((value) => (value === 1 ? 2 : 1))}
      >
        {playbackRate === 1 ? 'Set audio speed to 2x' : 'Set audio speed to 1x'}
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setVolume((value) => (value === 1 ? 0.25 : 1))}
      >
        {volume === 1 ? 'Set audio volume to 25%' : 'Set audio volume to 100%'}
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setMuted((value) => !value)}
      >
        {muted ? 'Unmute audio' : 'Mute audio'}
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setLoop((value) => !value)}
      >
        {loop ? 'Disable audio loop' : 'Enable audio loop'}
      </Button>
      <Button
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => {
          setStatus(null)
          setVisible((value) => !value)
        }}
      >
        {visible ? 'Remove audio' : 'Remount audio'}
      </Button>
    </View>
  )
}
