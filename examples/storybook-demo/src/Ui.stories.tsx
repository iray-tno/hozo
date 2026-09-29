// `@hozo/ui`, which is this demo's own look shipped as a package.
//
// Everything else in this Storybook writes its own class names -- that is
// what the other stories are showing, since Hozo ships no CSS and the layout
// is the application's. This one imports components that already have a look,
// and the look is the one the other stories grew by hand: `theme.css` is that
// palette counted and promoted, `text-slate-900` 120 times over and the rest.
//
// The interesting part is not visible. These components live in
// `node_modules/@hozo/ui`, their class names are `bg-hozo-accent` rather than
// `bg-indigo-600`, and both halves of that had to be built for this file to
// render at all: #651 so a package's source reaches the candidate scan, and
// #652 so `@import "@hozo/ui/theme.css"` in `src/index.css` resolves. Without
// either, this page is unstyled and nothing says so.

import { View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import {
  Accordion,
  type AccordionItem,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Field,
  Input,
  Listbox,
  Menu,
  RadioGroup,
  Slider,
  Stack,
  Switch,
  type Tab,
  Tabs,
  Toolbar,
  Tooltip,
} from '@hozo/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

// Tokens rather than `text-slate-900`, unlike every other story here, and for
// a reason the a11y check found rather than a preference: these tokens carry a
// dark value and `slate-600` does not, so a paragraph written the other way sat
// at slate-600 on a slate-900 card the moment the browser was in dark mode --
// 2.4:1, and a serious violation. A page that mixes paired surfaces with
// unpaired text is unreadable in exactly one of the two schemes.
const page = 'max-w-xl w-full space-y-6 bg-hozo-surface p-6'
const title = 'text-xl font-bold text-hozo-text'
const prose = 'text-sm text-hozo-text-muted'

const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const

// Keyed rather than positional, which is what `id` is for: a section addressed
// by its place moves the open panel the day somebody reorders the list.
const QUESTIONS: AccordionItem[] = [
  { id: 'shipping', header: 'When does it arrive?', content: 'Two days, or four to an island.' },
  { id: 'returns', header: 'Can I send it back?', content: 'Within thirty days, unopened.' },
  { id: 'wrap', header: 'Gift wrapping', content: 'Not yet.', disabled: true },
]

const SHIPPING = [
  { value: 'standard', label: 'Standard, two days' },
  { value: 'express', label: 'Express, tomorrow' },
  { value: 'pigeon', label: 'By pigeon', disabled: true },
] as const

const LANGUAGES = [
  { value: 'rust', label: 'Rust' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'cobol', label: 'COBOL', disabled: true },
] as const

const PANELS: Tab[] = [
  { label: 'Details', content: 'A universal UI compiler, written in Rust.' },
  { label: 'Shipping', content: 'Two days, or four to an island.' },
  { label: 'Returns', content: 'Not yet.', disabled: true },
]

function UiGallery() {
  const [email, setEmail] = useState('not-an-email')
  const [meals, setMeals] = useState<readonly string[]>(['Lunch'])
  const [emails, setEmails] = useState(true)
  const [volume, setVolume] = useState(40)
  const [shipping, setShipping] = useState<string>('express')
  const [languages, setLanguages] = useState<readonly string[]>(['rust'])
  const wrong = !email.includes('@')

  return (
    <View className={page}>
      <Section>
        <Heading level={2} className={title}>
          Buttons
        </Heading>
        <Paragraph className={prose}>
          Four tones, and every one of them carries the same focus ring -- reach for Tab. The last
          one is given an href, so it is a link wearing a button: the primitive answers an href with
          an anchor, and #653 is why that survives being forwarded through a wrapper's spread.
        </Paragraph>
        <Stack direction="row" gap="tight" align="center">
          <Button tone="accent" onPress={() => {}}>
            Save
          </Button>
          <Button tone="neutral" onPress={() => {}}>
            Cancel
          </Button>
          <Button tone="quiet" onPress={() => {}}>
            Learn more
          </Button>
          <Button tone="danger" onPress={() => {}}>
            Delete
          </Button>
          <Button tone="accent" size="sm" href="/docs">
            A link that looks like a button
          </Button>
        </Stack>
      </Section>

      <Section>
        <Heading level={2} className={title}>
          A card with a field in it
        </Heading>
        <Paragraph className={prose}>
          `Field` is the only one of these with anything in it: four elements agreeing on four ids,
          which is invisible here and is what the component exists for. The error below is read
          before the description, because somebody who has just been told their input is wrong wants
          to know why before being told the rules again.
        </Paragraph>
        <Card>
          <Stack gap="normal">
            <Field
              label="Email"
              description="We use it for the receipt and nothing else."
              error={wrong ? 'That does not look like an email address.' : undefined}
              required
            >
              {(control) => (
                <Input {...control} inputMode="email" value={email} onChangeText={setEmail} />
              )}
            </Field>
            <Stack direction="row" gap="tight">
              <Button tone="accent" onPress={() => {}}>
                Continue
              </Button>
              <Button tone="quiet" onPress={() => {}}>
                Back
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>
      <Section>
        <Heading level={2} className={title}>
          Checkbox, Switch, Badge and Alert
        </Heading>
        <Paragraph className={prose}>
          The first two wear the patterns from @hozo/patterns and draw a box and a track with
          pseudo-elements, off data-hozo-state -- so neither is told which state it is in. The
          parent below is partially checked whenever some but not all of the meals are, which is the
          state no input attribute can express.
        </Paragraph>
        <Card flat>
          <Stack gap="tight">
            <Checkbox
              checked={meals.length === MEALS.length ? true : meals.length === 0 ? false : 'mixed'}
              onCheckedChange={(next) => setMeals(next ? MEALS : [])}
            >
              All meals
            </Checkbox>
            {MEALS.map((meal) => (
              <Checkbox
                key={meal}
                className="pl-6"
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
            <Switch checked={emails} onCheckedChange={setEmails}>
              Email notifications
            </Switch>
          </Stack>
        </Card>
        <Stack direction="row" gap="tight" align="center">
          <Badge>Draft</Badge>
          <Badge tone="accent">New</Badge>
          <Badge tone="danger">Overdue</Badge>
        </Stack>
        <Alert tone="danger" live="assertive">
          Your session expires in two minutes.
        </Alert>
        <Alert>A notice that is simply on the page, and is not announced for being here.</Alert>
      </Section>
      <Section>
        <Heading level={2} className={title}>
          A slider and an accordion
        </Heading>
        <Paragraph className={prose}>
          The thumb is 24 by 24, which WCAG 2.5.8 asks for and a slider is the control that most
          invites a 12px dot; the rail is 6px and drawn behind it, so the part a finger has to hit
          is the whole row. Drag it, and then move it with an arrow key -- it announces "40 percent"
          rather than "40", because the number is not the answer to how loud.
        </Paragraph>
        <Card flat>
          <Stack gap="normal">
            <Slider
              accessibilityLabel="Volume"
              value={volume}
              onValueChange={setVolume}
              valueText={(level) => `${level} percent`}
            />
            <Paragraph className={prose}>Volume: {volume}</Paragraph>
          </Stack>
        </Card>
        <Paragraph className={prose}>
          Every header below is its own tab stop, which is the opposite of the Tabs story and is
          what the Authoring Practices ask for. The chevron is two borders rotated, reading
          data-hozo-state off the trigger, so it is never told which way to point -- and being a
          pseudo-element it is not in the accessibility tree, where aria-expanded already says it.
        </Paragraph>
        <Accordion items={QUESTIONS} accessibilityLabel="Questions" defaultExpanded="shipping" />
      </Section>
      <Section>
        <Heading level={2} className={title}>
          Tabs, a tooltip and a dialog
        </Heading>
        <Paragraph className={prose}>
          The strip is one tab stop and the arrows move within it -- the opposite of the accordion
          above, and the difference is what the control is for. The chosen tab is styled from
          aria-selected, which is what a reader is told, and the disabled one from aria-disabled
          rather than the real attribute: a disabled button leaves the tab order, and a roving strip
          needs it to stay.
        </Paragraph>
        <Tabs tabs={PANELS} accessibilityLabel="Product" />
        <Stack direction="row" gap="tight" align="center">
          <Tooltip content="Saves without leaving the page">
            <Button tone="neutral" onPress={() => {}}>
              Hover or focus me
            </Button>
          </Tooltip>
          <UiDialog />
          <Menu
            trigger="Actions"
            accessibilityLabel="Actions"
            items={[
              { label: 'Rename' },
              { label: 'Duplicate' },
              { label: 'Delete', disabled: true },
            ]}
          />
        </Stack>
      </Section>
      <Section>
        <Heading level={2} className={title}>
          Choosing one, choosing several, and a bar
        </Heading>
        <Paragraph className={prose}>
          The radio group is one tab stop and the arrows choose within it, which is what makes it a
          group rather than a column of checkboxes. Its ring and dot are two pseudo-elements drawn
          from aria-checked -- there is no input here to be :checked. The listbox marks its chosen
          row with a tint and a weight, because colour alone fails WCAG 1.4.1 and is invisible in
          print.
        </Paragraph>
        <Card flat>
          <Stack gap="normal">
            <RadioGroup
              options={SHIPPING}
              accessibilityLabel="Shipping"
              value={shipping}
              onValueChange={setShipping}
            />
            <Listbox
              options={LANGUAGES}
              accessibilityLabel="Languages"
              multiple
              value={languages}
              onValueChange={setLanguages}
            />
          </Stack>
        </Card>
        <Toolbar
          accessibilityLabel="Formatting"
          items={[
            {
              render: (props) => (
                <Button {...props} tone="quiet" size="sm" onPress={() => {}}>
                  Bold
                </Button>
              ),
            },
            {
              render: (props) => (
                <Button {...props} tone="quiet" size="sm" onPress={() => {}}>
                  Italic
                </Button>
              ),
            },
            {
              disabled: true,
              render: (props) => (
                <Button {...props} tone="quiet" size="sm" disabled onPress={() => {}}>
                  Strikethrough
                </Button>
              ),
            },
          ]}
        />
      </Section>
    </View>
  )
}

/**
 * The dialog, and the button that opens it.
 *
 * Its own component so the story below can start it open. The panel is a real
 * `<dialog>`, so the scrim is its `::backdrop` and there is no overlay element
 * here at all; `p-6` and a radius are the whole of what this package adds.
 */
function UiDialog({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <>
      <Button tone="danger" onPress={() => setOpen(true)}>
        Delete the project
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} accessibilityLabel="Delete the project">
        <Stack gap="normal">
          <Heading level={3} className="text-lg font-bold text-hozo-text">
            Delete the project?
          </Heading>
          <Paragraph className={prose}>
            Every build, report and golden goes with it. This cannot be undone.
          </Paragraph>
          <Stack direction="row" gap="tight">
            <Button tone="danger" onPress={() => setOpen(false)}>
              Delete
            </Button>
            <Button tone="quiet" onPress={() => setOpen(false)}>
              Keep it
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </>
  )
}

const meta = {
  title: 'UI/Gallery',
  component: UiGallery,
} satisfies Meta<typeof UiGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}

/**
 * The dialog open on mount, so axe sees the panel and the scrim rather than
 * stopping at the button.
 *
 * A story of its own and not a change to the gallery: an open modal traps
 * focus, so it would swallow the reading order of everything above it. Which
 * is the same reason `Patterns/Dialog` has two.
 */
export const DialogOpen: StoryObj<typeof meta> = { render: () => <UiDialog initiallyOpen /> }
