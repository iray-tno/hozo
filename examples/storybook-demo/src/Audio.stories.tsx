import { AudioDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import src from '../../showcase/assets/hozo-audio.wav'
import './SharedShowcase.css'

const meta = {
  title: 'Media/Audio',
  component: AudioDemo,
  args: { src },
  decorators: [
    (Story) => (
      <div className="shared-showcase">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AudioDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
