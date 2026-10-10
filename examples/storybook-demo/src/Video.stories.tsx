import { VideoDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import src from '../../showcase/assets/hozo-video.mp4'
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
