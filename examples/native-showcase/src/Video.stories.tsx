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

function LocalVideo({
  probe = false,
  customControls = false,
  captions = false,
  poster = false,
}: {
  probe?: boolean
  customControls?: boolean
  captions?: boolean
  poster?: boolean
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [posterSrc, setPosterSrc] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const asset = Asset.fromModule(require('../../showcase/assets/hozo-video.mp4'))
    const cover = poster
      ? Asset.fromModule(require('../../showcase/assets/hozo-video-poster.png'))
      : null
    void Promise.all([asset.downloadAsync(), cover?.downloadAsync()])
      .then(() => {
        if (!active) return
        setPosterSrc(cover ? (cover.localUri ?? cover.uri) : undefined)
        setSrc(asset.localUri ?? asset.uri)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [poster])
  if (error) return <Text>Video asset: {error}</Text>
  if (!src) return <Text>Loading bundled video</Text>
  return probe ? (
    <VideoPlaybackProbe src={src} poster={posterSrc} Viewport={NativeVideoViewport} />
  ) : (
    <VideoDemo src={src} customControls={customControls} captions={captions} poster={posterSrc} />
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
export const CustomControls: Story = { args: { customControls: true } }
export const TimedCaptions: Story = { args: { customControls: true, captions: true } }
export const Poster: Story = { args: { customControls: true, poster: true } }
export const PlaybackEvidence: Story = { args: { probe: true } }
export const PosterEvidence: Story = { args: { probe: true, poster: true } }
