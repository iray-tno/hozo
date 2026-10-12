import { VideoDemo, VideoPlaybackProbe } from '@hozo/example-showcase'
import { useMediaSource } from '@hozo/media/source'
import { resolveExpoMediaAsset } from '@hozo/media/source/expo'
import { Button } from '@hozo/primitives'
import type { Meta, StoryObj } from '@storybook/react-native'
import type { PropsWithChildren } from 'react'
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
  const asset = useMediaSource({
    source: require('../../showcase/assets/hozo-video.mp4'),
    resolveSource: resolveExpoMediaAsset,
  })
  const cover = useMediaSource({
    source: poster ? require('../../showcase/assets/hozo-video-poster.png') : null,
    resolveSource: resolveExpoMediaAsset,
  })
  const src = asset.uri
  const posterSrc = cover.uri ?? undefined
  if (asset.error)
    return (
      <>
        <Text>Video asset: {asset.error.message}</Text>
        <Button onPress={asset.reload}>Retry video asset</Button>
      </>
    )
  if (!src) return <Text>Loading bundled video</Text>
  // Artwork resolution/retry must not unmount an already playable movie.
  return (
    <>
      {probe ? (
        <VideoPlaybackProbe src={src} poster={posterSrc} Viewport={NativeVideoViewport} />
      ) : (
        <VideoDemo
          src={src}
          customControls={customControls}
          captions={captions}
          poster={posterSrc}
        />
      )}
      {cover.error && (
        <>
          <Text>Poster asset: {cover.error.message}</Text>
          <Button onPress={cover.reload}>Retry poster asset</Button>
        </>
      )}
    </>
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
