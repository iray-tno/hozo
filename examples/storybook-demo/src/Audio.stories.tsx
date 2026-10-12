import { AudioDemo } from '@hozo/example-showcase'
import { resolveMediaURI, useMediaSource } from '@hozo/media/source'
import type { Meta, StoryObj } from '@storybook/react-vite'
import src from '../../showcase/assets/hozo-audio.wav'
import './SharedShowcase.css'

function LocalAudio({ src: source }: { src: string }) {
  const asset = useMediaSource({ source, resolveSource: resolveMediaURI })
  if (asset.error)
    return (
      <>
        <p>Audio asset: {asset.error.message}</p>
        <button type="button" onClick={asset.reload}>
          Retry audio asset
        </button>
      </>
    )
  if (!asset.uri) return <p>Loading bundled audio</p>
  return <AudioDemo src={asset.uri} />
}

const meta = {
  title: 'Media/Audio',
  component: LocalAudio,
  args: { src },
  decorators: [
    (Story) => (
      <div className="shared-showcase">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalAudio>
export default meta
export const Default: StoryObj<typeof meta> = {}
