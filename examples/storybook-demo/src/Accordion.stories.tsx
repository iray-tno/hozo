// An accordion: disclosures that know about each other.
//
// One panel or several. That is the only thing making this more than a stack
// of `<details>` elements -- a set where opening one closes the rest has to be
// a set, and a set where they open independently does not, but a caller should
// not have to change component to change their mind about that.
//
// Reach for the keyboard to see what it is not. Every header is its own tab
// stop, which is the opposite of the Tabs story: a tab strip is a chooser, so
// stopping on each tab would make a reader pass six things to get to the
// content, while an accordion's headers are each a thing to act on. The arrow
// keys move between them as well, because ten of these are unpleasant to Tab
// through.
//
// The heading level is this file's to give. A component that hard-coded `<h3>`
// would jump from `<h1>` to `<h3>` on half the pages it appeared on, and
// heading order is one of the few things a screen reader user navigates by.
// Here the panel headings are `<h3>` under the section's `<h2>`.
//
// Hozo ships no CSS, so the chevron and the open panel are drawn here, off
// `data-hozo-state` -- this file never branches on the state it passed in.

import { Accordion } from '@hozo/patterns'
import { View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

const panel = 'max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'

const group = 'divide-y divide-slate-200 rounded-xl border border-slate-200 overflow-hidden'
const section = 'bg-white'
const headingRow = 'm-0'

/**
 * The trigger fills its row, and the chevron is a pseudo-element.
 *
 * `::after` rather than an element, because the component renders the header
 * it was given and nothing else -- which is the no-CSS promise working as
 * intended. It rotates on `data-hozo-state`, so this file never asks which
 * section is open.
 */
const trigger =
  'flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-semibold ' +
  'text-slate-900 hover:bg-slate-50 cursor-pointer  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ' +
  'disabled:text-slate-500 disabled:hover:bg-transparent disabled:cursor-not-allowed  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600' +
  "after:content-['⌄'] after:text-base after:leading-none after:text-slate-500 " +
  'after:transition-transform data-[hozo-state=open]:after:rotate-180'

const content = 'px-4 pb-4 pt-0 text-sm text-slate-600'

const FAQ = [
  {
    id: 'shipping',
    header: 'When will it arrive?',
    content: 'Two working days inside the country, five outside it.',
  },
  {
    id: 'returns',
    header: 'Can I send it back?',
    content: 'Within thirty days, unworn, with the tag still on.',
  },
  {
    id: 'sizing',
    header: 'Does it run small?',
    content: 'It runs one size small. Take the next size up if you are between two.',
  },
  {
    id: 'stock',
    header: 'When is it back in stock?',
    content: 'Unknown, which is why this one is disabled.',
    disabled: true,
  },
]

function AccordionGallery() {
  return (
    <View className={panel}>
      <Section>
        <Heading level={2} className={title}>
          Accordion (one at a time)
        </Heading>
        <Paragraph className={prose}>
          Opening a section closes whichever was open, and pressing the open one closes it. The
          Authoring Practices allow a set where something is always open; this is the half that does
          not, because a person who opened something by accident needs a way to put it back.
        </Paragraph>
        <Accordion
          items={FAQ}
          defaultExpanded="shipping"
          accessibilityLabel="Delivery questions"
          headingLevel={3}
          className={group}
          sectionClassName={section}
          headingClassName={headingRow}
          triggerClassName={trigger}
          panelClassName={content}
        />
      </Section>

      <Section>
        <Heading level={2} className={title}>
          Accordion (any number)
        </Heading>
        <Paragraph className={prose}>
          The same markup and the same keyboard. Only the answer to "may two be open at once"
          differs, and it is a prop rather than a second component.
        </Paragraph>
        <Accordion
          multiple
          items={FAQ}
          defaultExpanded={['returns', 'sizing']}
          accessibilityLabel="Delivery questions, independent"
          headingLevel={3}
          className={group}
          sectionClassName={section}
          headingClassName={headingRow}
          triggerClassName={trigger}
          panelClassName={content}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Accordion',
  component: AccordionGallery,
} satisfies Meta<typeof AccordionGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
