import { AudioDemo, AudioPlaybackProbe } from '@hozo/example-showcase'
import { ScrollView, Text } from '@hozo/primitives'
import type { Meta, StoryObj } from '@storybook/react-native'
import { Asset } from 'expo-asset'
import { useEffect, useState } from 'react'

function LocalAudio({ probe = false }: { probe?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const asset = Asset.fromModule(require('../../showcase/assets/hozo-audio.wav'))
    void asset
      .downloadAsync()
      .then(() => {
        if (active) setSrc(asset.localUri ?? asset.uri)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [])
  if (error) return <Text>Audio asset: {error}</Text>
  if (!src) return <Text>Loading bundled audio</Text>
  return probe ? <AudioPlaybackProbe src={src} /> : <AudioDemo src={src} />
}
const meta = {
  title: 'Media/Audio',
  component: LocalAudio,
  decorators: [
    (Story) => (
      <ScrollView>
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof LocalAudio>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const OutputEvidence: StoryObj<typeof meta> = { args: { probe: true } }
