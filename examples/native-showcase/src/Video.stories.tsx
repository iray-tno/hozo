import { VideoDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { Asset } from 'expo-asset'
import { useEffect, useState } from 'react'
import { ScrollView, Text } from 'react-native'

function LocalVideo() {
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
  return src ? <VideoDemo src={src} /> : <Text>Loading bundled video</Text>
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
