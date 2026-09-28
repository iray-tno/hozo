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
import { Button, Card, Field, Stack } from '@hozo/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const page = 'max-w-xl w-full space-y-6'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'

/** A plain input, which `@hozo/ui` does not ship and `Field` does not need. */
const input =
  'w-full rounded-hozo-control border border-hozo-border-strong bg-hozo-surface px-3 py-2 ' +
  'text-sm text-hozo-text placeholder:text-hozo-text-subtle ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus ' +
  'aria-invalid:border-hozo-danger'

function UiGallery() {
  const [email, setEmail] = useState('not-an-email')
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
                <input
                  {...control}
                  type="email"
                  className={input}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
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
    </View>
  )
}

const meta = {
  title: 'UI/Gallery',
  component: UiGallery,
} satisfies Meta<typeof UiGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
