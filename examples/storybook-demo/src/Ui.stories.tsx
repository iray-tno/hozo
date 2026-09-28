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
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Stack, Switch } from '@hozo/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const page = 'max-w-xl w-full space-y-6'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'

const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const

function UiGallery() {
  const [email, setEmail] = useState('not-an-email')
  const [meals, setMeals] = useState<readonly string[]>(['Lunch'])
  const [emails, setEmails] = useState(true)
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
    </View>
  )
}

const meta = {
  title: 'UI/Gallery',
  component: UiGallery,
} satisfies Meta<typeof UiGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
