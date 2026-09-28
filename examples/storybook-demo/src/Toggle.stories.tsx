// A checkbox and a switch, which are the same control with two roles.
//
// With a mouse they are indistinguishable, which is the point: the difference
// is what a screen reader says. A checkbox is "checked" or "not checked" and
// can be "partially checked"; a switch is "on" or "off" and cannot be
// anything else. Choosing between them is choosing which sentence a person
// hears, and that is a content decision rather than a visual one.
//
// The third state is the reason the checkbox is not `<input type="checkbox">`.
// A real checkbox's indeterminate state is a DOM property with no attribute,
// so it cannot be rendered on a server; `aria-checked="mixed"` can.
//
// Hozo ships no CSS, so the box and the track are drawn here. `data-hozo-state`
// carries `checked`, `unchecked` or `mixed` on every render, which is what
// lets one class list style all three without this file tracking state it has
// already handed to the component.

import { Checkbox, Switch } from '@hozo/patterns'
import { View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const panel = 'max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'
const stack = 'flex flex-col gap-3'

/**
 * One row: the box, then the label, and the whole row is the control.
 *
 * `text-left` because a `<button>` centres its text and this one is a line of
 * prose. `items-start` so a label that wraps keeps its box on the first line.
 */
const row =
  'flex flex-row items-start gap-3 text-left text-sm text-slate-900 rounded-lg px-2 py-1.5 ' +
  'hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-indigo-600 disabled:text-slate-500 disabled:hover:bg-transparent'

/**
 * The box, drawn with `::before` rather than an element.
 *
 * The component renders its children and nothing else, so there is no box in
 * the markup to style -- which is the no-CSS promise working as intended, and
 * it means the decoration is a pseudo-element here. All three states come off
 * `data-hozo-state`, so this file never branches on the value it passed in.
 */
const box =
  "before:content-[''] before:mt-0.5 before:size-4 before:shrink-0 before:rounded before:border-2 " +
  'before:border-slate-400 before:bg-white ' +
  'data-[hozo-state=checked]:before:border-indigo-600 data-[hozo-state=checked]:before:bg-indigo-600 ' +
  'data-[hozo-state=mixed]:before:border-indigo-600 data-[hozo-state=mixed]:before:bg-indigo-200 ' +
  'disabled:before:border-slate-300'

/** The same row, with a track and a knob instead of a box. */
const track =
  "before:content-[''] before:mt-0.5 before:h-4 before:w-7 before:shrink-0 before:rounded-full " +
  'before:bg-slate-300 before:transition-colors ' +
  "after:content-[''] after:mt-1 after:-ml-6 after:size-2 after:rounded-full after:bg-white " +
  'after:transition-transform ' +
  'data-[hozo-state=checked]:before:bg-indigo-600 data-[hozo-state=checked]:after:translate-x-3'

const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const

function ToggleGallery() {
  const [meals, setMeals] = useState<readonly string[]>(['Lunch'])
  const [emails, setEmails] = useState(true)

  // Checked when all of them are, unchecked when none is, and mixed in
  // between -- which is the state that has no `<input>` attribute and is why
  // this control exists in the shape it does.
  const all = meals.length === MEALS.length ? true : meals.length === 0 ? false : 'mixed'

  return (
    <View className={panel}>
      <Section>
        <Heading level={2} className={title}>
          Checkbox
        </Heading>
        <Paragraph className={prose}>
          Three states, not two. The parent below is "partially checked" whenever some but not all
          of its children are -- a reader says so, and a stylesheet can see it on the
          data-hozo-state attribute without being told twice.
        </Paragraph>
        <View className={stack}>
          <Checkbox
            className={`${row} ${box} font-semibold`}
            checked={all}
            onCheckedChange={(next) => setMeals(next ? MEALS : [])}
          >
            All meals
          </Checkbox>
          <View className={`${stack} pl-6`}>
            {MEALS.map((meal) => (
              <Checkbox
                key={meal}
                className={`${row} ${box}`}
                checked={meals.includes(meal)}
                onCheckedChange={(next) =>
                  setMeals((chosen) =>
                    next ? [...chosen, meal] : chosen.filter((one) => one !== meal),
                  )
                }
              >
                {meal}
              </Checkbox>
            ))}
          </View>
          <Checkbox className={`${row} ${box}`} disabled>
            Second breakfast (unavailable)
          </Checkbox>
        </View>
      </Section>

      <Section>
        <Heading level={2} className={title}>
          Switch
        </Heading>
        <Paragraph className={prose}>
          Two states, because a thing is on or off and there is no third way to be on. ARIA gives
          the switch role no mixed value, and a reader says "on" and "off" for it rather than
          "checked".
        </Paragraph>
        <View className={stack}>
          <Switch className={`${row} ${track}`} checked={emails} onCheckedChange={setEmails}>
            Email notifications
          </Switch>
          <Switch className={`${row} ${track}`} disabled>
            Push notifications (no device)
          </Switch>
        </View>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Toggle',
  component: ToggleGallery,
} satisfies Meta<typeof ToggleGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
