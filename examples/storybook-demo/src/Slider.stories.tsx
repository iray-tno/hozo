// A slider: a value on a scale, moved with a key or dragged with a pointer.
//
// The first control in @hozo/patterns with a pointer gesture in it. Everything
// else there answers a click or a keystroke, both of which the browser turns
// into one event; a drag is a sequence that has to survive the pointer leaving
// the element it started on, which is what `setPointerCapture` is for. Drag
// the thumb and keep going past the end of the track -- it stays with you.
//
// The keyboard is the whole contract: arrows by a step, PageUp and PageDown by
// ten, Home and End for the ends. A key the slider does not answer goes back
// to the page rather than being swallowed.
//
// `valueText` is the prop worth noticing. "3" is not an answer to "how loud",
// so the volume below announces "30 percent" and the rating announces the word
// rather than the number. A slider whose value has a name and does not say it
// is one a screen reader user has to guess at.
//
// Hozo ships no CSS, so the track, the fill and the thumb are drawn here. The
// component positions the thumb with `inset-inline-start` and sizes the fill,
// because those are the two things it knows and a stylesheet does not.

import { Slider } from '@hozo/patterns'
import { View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const panel = 'max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'
const readout = 'text-sm font-medium text-slate-900 tabular-nums'

/** The track: a bar the thumb is positioned inside, so it needs `relative`. */
const track =
  'relative h-2 w-full rounded-full bg-slate-200 cursor-pointer my-4 ' +
  'data-[hozo-disabled]:cursor-not-allowed data-[hozo-disabled]:bg-slate-100'

/** The fill. Its width is the component's; everything else is here. */
const fill = 'absolute inset-y-0 left-0 rounded-full bg-indigo-600'

/**
 * The thumb, pulled back by half its width so it is centred on its value.
 *
 * `-translate-x-1/2` because the component sets `inset-inline-start` to the
 * fraction: at 100% the thumb's left edge would be at the end of the track and
 * the whole thumb outside it.
 */
const thumb =
  'absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ' +
  'border-indigo-600 bg-white shadow-sm cursor-grab active:cursor-grabbing ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

const RATINGS = ['Awful', 'Poor', 'Fine', 'Good', 'Excellent'] as const

function SliderGallery() {
  const [volume, setVolume] = useState(3)
  const [rating, setRating] = useState(3)

  return (
    <View className={panel}>
      <Section>
        <Heading level={2} className={title}>
          Slider
        </Heading>
        <Paragraph className={prose}>
          Drag it, or focus the thumb and use the arrows. PageUp and PageDown move by ten steps,
          Home and End go to the ends. Dragging past the end of the track keeps working, which is
          what pointer capture buys and what a mouse-event slider gets wrong.
        </Paragraph>
        <View className="flex flex-row items-center justify-between">
          <span className={prose}>Volume</span>
          <span className={readout}>{volume * 10}%</span>
        </View>
        <Slider
          value={volume}
          onValueChange={setVolume}
          min={0}
          max={10}
          step={1}
          accessibilityLabel="Volume"
          valueText={(at) => `${at * 10} percent`}
          className={track}
          fillClassName={fill}
          thumbClassName={thumb}
        />
      </Section>

      <Section>
        <Heading level={2} className={title}>
          A scale whose points have names
        </Heading>
        <Paragraph className={prose}>
          Five points, and the number is not the answer to any question a person has.{' '}
          <code>valueText</code> is what a reader says instead, so this announces "Good" rather than
          "4".
        </Paragraph>
        <View className="flex flex-row items-center justify-between">
          <span className={prose}>Rating</span>
          <span className={readout}>{RATINGS[rating]}</span>
        </View>
        <Slider
          value={rating}
          onValueChange={setRating}
          min={0}
          max={4}
          step={1}
          accessibilityLabel="Rating"
          valueText={(at) => RATINGS[at] ?? String(at)}
          className={track}
          fillClassName={fill}
          thumbClassName={thumb}
        />
      </Section>

      <Section>
        <Heading level={2} className={title}>
          Disabled
        </Heading>
        <Paragraph className={prose}>
          Out of the tab order and out of reach of a pointer, and the track says so on
          <code> data-hozo-disabled</code> so a stylesheet does not have to be told twice.
        </Paragraph>
        <Slider
          defaultValue={6}
          max={10}
          disabled
          accessibilityLabel="Bitrate (unavailable)"
          className={track}
          fillClassName={`${fill} bg-slate-400`}
          thumbClassName={`${thumb} border-slate-400 cursor-not-allowed`}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Slider',
  component: SliderGallery,
} satisfies Meta<typeof SliderGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
