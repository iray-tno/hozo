import { Heading, Link, List, ListItem, Paragraph, Section, Text, View } from '@hozo/core'
import { Button, Card, Field, Input } from '@hozo/ui'

export interface UiShowcaseProps {
  baseUrl?: string
}

// @hozo/ui on the home page, rendered by Hozo at build time and shipped as
// HTML and CSS only. The page keeps one island (Kumimono), so these do not
// respond here; the component pages in /docs are where they do, and each
// link below goes to one.
export function UiShowcase({ baseUrl = '' }: UiShowcaseProps) {
  const docs = `${baseUrl.replace(/\/$/, '')}/docs/components`
  const pages = [
    ['Button', 'button'],
    ['Input', 'input'],
    ['Card', 'card'],
    ['Dialog', 'dialog'],
  ] as const

  return (
    <Section nativeID="ui-components" className="py-20 border-t border-hinoki/18 bg-yakisugi-950">
      <View className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-0">
        <View className="text-center max-w-3xl mx-auto mb-10 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            @hozo/ui
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            Components to Start From
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            A styled component library written in the same primitives as your code, shipped as
            source and compiled with it, for the Web and Native.
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* The package's own surface, as in /docs, so the components are
              seen against the page they were drawn for. */}
          <View className="rounded-2xl overflow-hidden border border-hinoki/18 bg-hozo-surface p-6 sm:p-8 text-hozo-text">
            <Card>
              <View className="gap-4">
                <Heading level={3} className="text-lg font-bold text-hozo-text">
                  Weekly report
                </Heading>
                <Field label="Email" description="Where the report goes.">
                  {(control) => (
                    <Input {...control} inputMode="email" placeholder="you@example.com" />
                  )}
                </Field>
                <View className="flex-row flex-wrap gap-2">
                  <Button tone="accent">Subscribe</Button>
                  <Button tone="neutral">Preview</Button>
                  <Button tone="quiet">Not now</Button>
                </View>
              </View>
            </Card>
          </View>

          <View className="flex flex-col justify-center gap-6">
            <Paragraph className="text-shikkui-muted leading-relaxed">
              This panel is plain HTML and CSS, rendered by Hozo at build time. Each component has a
              page in the docs with a live preview to press and type into, and the source beside it.
            </Paragraph>
            <List className="grid grid-cols-2 gap-3 list-none p-0 m-0">
              {pages.map(([name, slug]) => (
                <ListItem key={slug} className="flex">
                  <Link
                    href={`${docs}/${slug}/`}
                    className="w-full px-4 py-3 rounded-xl timber-panel border border-hinoki/18 hover:border-hinoki/50 transition-colors text-sm font-semibold text-shikkui"
                  >
                    {`${name} →`}
                  </Link>
                </ListItem>
              ))}
            </List>
            <Link
              href={`${docs}/`}
              className="text-sm font-semibold text-hinoki-light underline hover:text-shikkui"
            >
              All components and how to install them
            </Link>
          </View>
        </View>
      </View>
    </Section>
  )
}
