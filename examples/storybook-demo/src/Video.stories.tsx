import { VideoDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import src from '../../showcase/assets/hozo-video.mp4'
import poster from '../../showcase/assets/hozo-video-poster.png'
import './SharedShowcase.css'

const meta = {
  title: 'Media/Video',
  component: VideoDemo,
  args: { src },
  decorators: [
    (Story) => (
      <div className="shared-showcase">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VideoDemo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const CustomControls: Story = { args: { customControls: true } }
export const TimedCaptions: Story = { args: { customControls: true, captions: true } }
export const Poster: Story = { args: { customControls: true, poster } }
