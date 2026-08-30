// A toolbar: a row of controls that is *one* tab stop.
//
// The pattern's value is hard to see with a mouse, because with a mouse it
// behaves identically to a plain row of buttons. Reach for the keyboard:
// Tab enters the bar once and leaves it once, and the arrow keys move
// between the controls inside. Without it, a formatting bar of eight
// buttons is eight presses on the way to the text, every time.
//
// `items` take a `render` rather than children, because the toolbar has to
// put four things on each control -- `tabIndex`, `onKeyDown`, `onFocus`
// and a `ref` it can focus. One object to spread is the whole of what an
// author writes.

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Ref } from 'react'
import { Heading, Paragraph, Section, Text, Toolbar, View } from '@hozo/core'

const CONTROL =
  'rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ' +
  'disabled:text-slate-300 transition-colors'

function control(label: string, hint: string, disabled = false) {
  return {
    disabled,
    render: (props: Parameters<NonNullable<Parameters<typeof Toolbar>[0]['items'][number]['render']>>[0]) => (
      // `HozoToolbarItemProps.ref` is a `Ref<HTMLElement>` because the
      // toolbar does not know what its items render. A `<button>` wants a
      // `Ref<HTMLButtonElement>`, and React's ref types are invariant, so
      // the narrowing is the author's to make -- which is the right way
      // round: the toolbar only ever calls `.focus()`.
      <button
        {...props}
        ref={props.ref as Ref<HTMLButtonElement>}
        type="button"
        className={CONTROL}
        aria-label={hint}
        disabled={disabled}
      >
        {label}
      </button>
    ),
  }
}

function Formatting() {
  return (
    <Toolbar
      accessibilityLabel="Text formatting"
      className="flex flex-row flex-wrap items-center gap-1 rounded-xl border border-slate-200 p-2"
      items={[
        control('B', 'Bold'),
        control('I', 'Italic'),
        control('U', 'Underline'),
        control('S', 'Strikethrough', true),
        control('“ ”', 'Quote'),
        control('</>', 'Code'),
      ]}
    />
  )
}

function ToolbarGallery() {
  return (
    <View className="w-full max-w-2xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Toolbar
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          One tab stop for the whole bar, arrow keys inside it. Press Tab to
          reach it, then Left and Right — and note that Strikethrough is
          skipped, because a disabled control is not a stop.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Horizontal
        </Text>
        <Formatting />
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Vertical — Up and Down instead
        </Text>
        {/* `orientation` decides which arrows move, and it is also what the
            toolbar announces: a vertical bar answering to Left/Right would
            disagree with what a screen reader has just said about it. */}
        <Toolbar
          orientation="vertical"
          accessibilityLabel="Alignment"
          className="inline-flex flex-col items-start gap-1 rounded-xl border border-slate-200 p-2"
          items={[
            control('Left', 'Align left'),
            control('Center', 'Align centre'),
            control('Right', 'Align right'),
          ]}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'A11y/Toolbar',
  component: ToolbarGallery,
} satisfies Meta<typeof ToolbarGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
