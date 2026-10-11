import { VideoDemo, VideoPlaybackProbe } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { Asset } from 'expo-asset'
import { type PropsWithChildren, useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

// Make only the measurement viewport a named AX node. The ordinary engine
// controls and their accessibility tree remain untouched in the Default story.
function NativeVideoViewport({ children }: PropsWithChildren) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Local video pixel probe"
      style={{ width: '100%', maxWidth: 320 }}
    >
      {children}
    </View>
  )
}

function LocalVideo({ probe = false }: { probe?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const asset = Asset.fromModule(require('../../showcase/assets/hozo-video.mp4'))
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
  if (error) return <Text>Video asset: {error}</Text>
  if (!src) return <Text>Loading bundled video</Text>
  return probe ? (
    <VideoPlaybackProbe src={src} Viewport={NativeVideoViewport} />
  ) : (
    <VideoDemo src={src} />
  )
}

const meta = {
  title: 'Media/Video',
  component: LocalVideo,
  decorators: [
    (Story) => (
      <ScrollView>
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof LocalVideo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PlaybackEvidence: Story = { args: { probe: true } }
