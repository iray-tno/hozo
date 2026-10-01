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

import { PortalProvider } from '@hozo/behaviors'
import {
  type CalendarDate,
  type CalendarDateTime,
  type CalendarRange,
  type CalendarTime,
  useFormSubmit,
} from '@hozo/form'
import { View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import {
  Accordion,
  type AccordionItem,
  Alert,
  Badge,
  BottomSheet,
  Button,
  Calendar,
  Card,
  Checkbox,
  Combobox,
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  Dialog,
  Drawer,
  Field,
  Form,
  Input,
  Listbox,
  Menu,
  Popover,
  RadioGroup,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  type Tab,
  Tabs,
  TextArea,
  TimePicker,
  Toolbar,
  Tooltip,
  Tree,
  type TreeNode,
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

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const

const LANGUAGES = [
  { value: 'rust', label: 'Rust' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'cobol', label: 'COBOL', disabled: true },
] as const

// Pinned rather than read from the clock, so the golden and the axe run do not
// change meaning at midnight.
const TODAY = { year: 2026, month: 9, day: 24 }

const FILES: readonly TreeNode[] = [
  {
    id: 'crates',
    label: 'crates',
    children: [
      { id: 'ir', label: 'hozo_ir' },
      { id: 'web', label: 'hozo_web', children: [{ id: 'css', label: 'css.rs' }] },
    ],
  },
  { id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] },
  { id: 'readme', label: 'README.md' },
]

const PANELS: Tab[] = [
  { label: 'Details', content: 'A universal UI compiler, written in Rust.' },
  { label: 'Shipping', content: 'Two days, or four to an island.' },
  { label: 'Returns', content: 'Not yet.', disabled: true },
]

/**
 * The button that submits the form it is inside.
 *
 * Its own component because `useFormSubmit` is a hook, and it is here at all to
 * show the half of `Form` that crosses platforms. A Web form submits itself when a
 * button inside it is pressed; React Native has no form element and no Enter key,
 * so the submit has to be asked for -- and this is the one line an application
 * writes once for both.
 *
 * The email above starts invalid, so pressing this focuses the email field instead
 * of submitting. That is the only coordination `Form` does: it reads the
 * `aria-invalid` the `Field` already set and declines to submit past it.
 */
function SubmitButton() {
  const submit = useFormSubmit()
  return (
    <Button tone="accent" onPress={submit}>
      Continue
    </Button>
  )
}

function UiGallery() {
  const [email, setEmail] = useState('not-an-email')
  const [notes, setNotes] = useState('')
  const [meals, setMeals] = useState<readonly string[]>(['Lunch'])
  const [emails, setEmails] = useState(true)
  const [volume, setVolume] = useState(40)
  const [shipping, setShipping] = useState<string>('express')
  const [languages, setLanguages] = useState<readonly string[]>(['rust'])
  const [range, setRange] = useState<string>('week')
  const [date, setDate] = useState<CalendarDate | null>({ year: 2026, month: 9, day: 24 })
  const [span, setSpan] = useState<CalendarRange | null>(null)
  const [clock, setClock] = useState<CalendarTime | null>({ hour: 9, minute: 30 })
  const [stamp, setStamp] = useState<CalendarDateTime | null>(null)
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
          <Form accessibilityLabel="Delivery" onSubmit={() => {}}>
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
            {/*
              The textarea grows as it is typed into, and its counter is a
              description rather than a live region -- a reader hears "160 of 160
              characters left" on reaching the field, and unprompted only twice:
              entering the last ten, and running out. `{...control}` works because
              `TextArea` spells those three attributes the way `Field` does.
            */}
            <Field label="Notes" description="Anything the courier should know." required>
              {(control) => (
                <TextArea
                  {...control}
                  value={notes}
                  onChangeText={setNotes}
                  minRows={2}
                  maxRows={6}
                  maxLength={160}
                  placeholder="Leave it with a neighbour…"
                />
              )}
            </Field>
            <Stack direction="row" gap="tight">
              <SubmitButton />
              <Button tone="quiet" onPress={() => {}}>
                Back
              </Button>
            </Stack>
          </Form>
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
          <Popover trigger="Shipping" accessibilityLabel="Shipping">
            <Paragraph className={prose}>
              Two days, or four to an island. A popover holds whatever you put in it, which is why
              it is a dialog rather than a menu -- a reader told "menu" expects commands.
            </Paragraph>
            <Button tone="quiet" size="sm" href="/shipping">
              Read the policy
            </Button>
          </Popover>
          <UiBottomSheet />
          <UiDrawer />
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
            {/*
              The same component as the group above, which is the point of it: a
              segmented control is a radio group drawn as a strip, so the chosen
              segment is aria-checked and not aria-selected. Reach for Tabs when a
              panel below changes and for this when a value is being chosen -- the
              two look identical and tell a reader different things.
            */}
            <SegmentedControl
              options={RANGES}
              accessibilityLabel="Range"
              value={range}
              onValueChange={setRange}
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
        <Paragraph className={prose}>
          The combobox filters as you type and moves aria-activedescendant without focus leaving the
          field. Its highlighted row is a tint and nothing more -- deliberately weaker than the
          listbox above, because aria-selected means "where you are" here and "the answer" there.
          The tree's marker is a pseudo-element rather than a glyph: the Patterns/Tree story writes
          one into the label, and its golden records the cost -- "treeitem, ▾ crates, expanded" says
          the same fact twice.
        </Paragraph>
        <Card flat>
          <Stack gap="normal">
            <Combobox options={LANGUAGES} accessibilityLabel="Language" placeholder="Search…" />
            <Tree nodes={FILES} accessibilityLabel="Repository" defaultExpanded={['crates']} />
          </Stack>
        </Card>
        <Paragraph className={prose}>
          The calendar is where a styled library earns its keep: a month button holding a chevron is
          about four pixels wide under a CSS reset, and a table cell holding "1" about sixteen. Both
          are 36 here. Its two day-cell class lists differ because aria-selected means the one
          chosen day in single mode and every day between the ends in range mode -- so the range's
          caps come from data attributes, which carried no CSS at all until #679.
        </Paragraph>
        <Stack direction="row" gap="tight" align="center">
          <DatePicker
            locale="en-US"
            value={date}
            onChange={setDate}
            today={TODAY}
            placeholder="Pick a day"
          />
          <DateRangePicker
            locale="en-US"
            value={span}
            onChange={setSpan}
            today={TODAY}
            placeholder="Pick a span"
          />
          <DateTimePicker
            locale="en-US"
            value={stamp}
            onChange={setStamp}
            today={TODAY}
            placeholder="Pick a moment"
          />
        </Stack>
        <Paragraph className={prose}>
          The clock's two arrows are 24 by 24 and are told apart only by data-hozo-step -- so until
          #679 they were drawn in the same place, one on top of the other. Its focus ring is on the
          field rather than on the spinbutton inside it, because that element takes no class of its
          own.
        </Paragraph>
        <TimePicker
          accessibilityLabel="Arrival time"
          locale="en-US"
          hour12
          value={clock}
          onChange={setClock}
        />
        <Calendar
          accessibilityLabel="September"
          locale="en-US"
          today={TODAY}
          defaultMonth={{ year: 2026, month: 9 }}
          value={date}
          onChange={setDate}
        />
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

/**
 * The bottom sheet, and the button that opens it.
 *
 * Two detents, which is what makes the grabber a `<button>` rather than
 * decoration: with one resting size the only gesture is drag-to-dismiss and the
 * scrim already answers that with a tap, but a sheet that can be half-open needs
 * a way to change size without dragging. So the handle is named, focusable, and
 * answers a press and the arrows -- and that is the only control on this page
 * whose effect a screen reader cannot perceive, which is the point of WCAG 2.5.7
 * being about the pointer.
 */
function UiBottomSheet({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  // A portal host inside the story rather than the default one on `document.body`.
  //
  // Not a workaround so much as the case `PortalProvider` exists for -- an
  // application inside a shadow root or a scoped container has to say where
  // overlays go. Here the reason is the evidence: the screen-reader walk reads
  // from `#storybook-root`, so a sheet mounted on `body` is outside everything it
  // looks at and the golden would record the trigger and nothing else. The
  // portal is real either way; this only chooses its far end.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <Button tone="neutral" onPress={() => setOpen(true)}>
        Filters
      </Button>
      <div ref={setHost} />
      <PortalProvider container={host}>
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          accessibilityLabel="Filters"
          detents={[0.5, 1]}
        >
          <Heading level={3} className="text-lg font-bold text-hozo-text">
            Filters
          </Heading>
          <Paragraph className={prose}>
            Modal, unlike the popover above, and not by preference: something that dims the page has
            already said the page is unavailable, so aria-modal and the Tab trap have to say the
            same thing. Drag it down to dismiss, or press Escape.
          </Paragraph>
          <Stack direction="row" gap="tight">
            <Button tone="accent" onPress={() => setOpen(false)}>
              Apply
            </Button>
            <Button tone="quiet" onPress={() => setOpen(false)}>
              Cancel
            </Button>
          </Stack>
        </BottomSheet>
      </PortalProvider>
    </>
  )
}

/**
 * The drawer, and the button that opens it.
 *
 * Nothing to drag on this platform, which is #142's own split rather than a gap:
 * the Web drawer is asked for an off-canvas panel, a focus trap and a scroll
 * lock, and the gesture is listed under Native. A drawer has no grabber, so a
 * swipe would have to drag the panel's body and fight text selection -- a
 * trade worth making on a phone, where there is no Escape key either, and not
 * here.
 *
 * It holds links, because that is what a drawer is for and because it makes the
 * golden say something: four links inside a modal dialog, and nothing from the
 * page behind it.
 */
function UiDrawer({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  // A host inside the story, for the reason the sheet above has one: the
  // screen-reader walk reads from `#storybook-root`.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return (
    <>
      {/*
        Neutral rather than quiet, and the axe run is why. A quiet button has no
        background of its own, so with the drawer open axe composites its label
        through the scrim and reports 2.9:1 in dark mode -- correctly, by its own
        rules. Dimmed text behind a modal is not content anybody is being asked
        to read, which axe cannot know, so the story does not put a transparent
        control directly behind a scrim.
      */}
      <Button tone="neutral" onPress={() => setOpen(true)}>
        Menu
      </Button>
      <div ref={setHost} />
      <PortalProvider container={host}>
        <Drawer open={open} onClose={() => setOpen(false)} accessibilityLabel="Navigation">
          <Heading level={3} className="text-lg font-bold text-hozo-text">
            Navigation
          </Heading>
          <Button tone="quiet" size="sm" href="/docs">
            Documentation
          </Button>
          <Button tone="quiet" size="sm" href="/decisions">
            Decisions
          </Button>
          <Button tone="quiet" size="sm" href="/shipping">
            Shipping
          </Button>
          <Button tone="neutral" size="sm" onPress={() => setOpen(false)}>
            Close
          </Button>
        </Drawer>
      </PortalProvider>
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

/**
 * The popover open on mount, so the panel itself is audited rather than the
 * button that opens it.
 *
 * Its own story like the dialog's, and for a *different* reason: this one is not
 * modal, so it would not have swallowed the gallery's reading order. What it
 * would have done is autofocus into the panel on load, which changes where every
 * other check starts from. The panel is the thing worth measuring -- its
 * contrast in both schemes, its focus ring, and what a reader hears inside a
 * `role="dialog"` that is not modal.
 */
/**
 * The sheet open on mount, for the reason the dialog has its own story: it is
 * modal, so leaving it open in the gallery would take the reading order of
 * everything above it away from a reader.
 *
 * What this one adds over `DialogOpen` is the handle. It is a real control here,
 * so the appearance check measures it like any other -- 24px of target around a
 * 4px bar, and a focus ring on a thing that exists to be dragged.
 */
export const BottomSheetOpen: StoryObj<typeof meta> = {
  render: () => <UiBottomSheet initiallyOpen />,
}

/**
 * The drawer open on mount, its own story for the reason the other two modals
 * have theirs.
 *
 * `side="left"` is the default and the only one shown. The other side is one prop
 * and a second class list in `@hozo/ui` -- written out rather than interpolated,
 * because a name built at runtime is a name the compiler never sees and never
 * emits CSS for.
 */
export const DrawerOpen: StoryObj<typeof meta> = {
  render: () => <UiDrawer initiallyOpen />,
}

export const PopoverOpen: StoryObj<typeof meta> = {
  render: () => (
    <View className={page}>
      <Popover trigger="Shipping" accessibilityLabel="Shipping" defaultOpen>
        <Paragraph className={prose}>
          Two days, or four to an island. Not modal, so the page behind it is still there for a
          reader -- and the panel closes when focus leaves it, which is the half people forget.
        </Paragraph>
        <Button tone="quiet" size="sm" href="/shipping">
          Read the policy
        </Button>
      </Popover>
    </View>
  ),
}
