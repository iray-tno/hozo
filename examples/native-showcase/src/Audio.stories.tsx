import { AudioDemo, AudioPlaybackProbe, AudioSettingsProbe } from '@hozo/example-showcase'
import { useMediaSource } from '@hozo/media/source'
import { resolveExpoMediaAsset } from '@hozo/media/source/expo'
import { Button, ScrollView, Text } from '@hozo/primitives'
import type { Meta, StoryObj } from '@storybook/react-native'

function LocalAudio({ probe = false, settings = false }: { probe?: boolean; settings?: boolean }) {
  const asset = useMediaSource({
    source: require('../../showcase/assets/hozo-audio.wav'),
    resolveSource: resolveExpoMediaAsset,
  })
  const src = asset.uri
  if (asset.error)
    return (
      <>
        <Text>Audio asset: {asset.error.message}</Text>
        <Button onPress={asset.reload}>Retry audio asset</Button>
      </>
    )
  if (!src) return <Text>Loading bundled audio</Text>
  if (settings) return <AudioSettingsProbe src={src} />
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
export const SettingsOutputEvidence: StoryObj<typeof meta> = { args: { settings: true } }
