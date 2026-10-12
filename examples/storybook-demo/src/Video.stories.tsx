import { VideoDemo } from '@hozo/example-showcase'
import { resolveMediaURI, useMediaSource } from '@hozo/media/source'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import src from '../../showcase/assets/hozo-video.mp4'
import poster from '../../showcase/assets/hozo-video-poster.png'
import './SharedShowcase.css'

function LocalVideo({ src: source, poster: artwork, ...props }: ComponentProps<typeof VideoDemo>) {
  const asset = useMediaSource({ source, resolveSource: resolveMediaURI })
  const cover = useMediaSource({ source: artwork ?? null, resolveSource: resolveMediaURI })
  if (asset.error)
    return (
      <>
        <p>Video asset: {asset.error.message}</p>
        <button type="button" onClick={asset.reload}>
          Retry video asset
        </button>
      </>
    )
  if (!asset.uri) return <p>Loading bundled video</p>
  return (
    <>
      <VideoDemo src={asset.uri} poster={cover.uri ?? undefined} {...props} />
      {cover.error && (
        <>
          <p>Poster asset: {cover.error.message}</p>
          <button type="button" onClick={cover.reload}>
            Retry poster asset
          </button>
        </>
      )}
    </>
  )
}

const meta = {
  title: 'Media/Video',
  component: LocalVideo,
  args: { src },
  decorators: [
    (Story) => (
      <div className="shared-showcase">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalVideo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const CustomControls: Story = { args: { customControls: true } }
export const TimedCaptions: Story = { args: { customControls: true, captions: true } }
export const Poster: Story = { args: { customControls: true, poster } }
