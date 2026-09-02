import { Heading, Link, List, ListItem, Paragraph, Section, Text, View } from '@hozo/core'

/**
 * Hozo's static subset, used from Astro with no `client:` directive.
 *
 * Eleven of the seventeen primitives lower to markup that needs nothing at
 * run time: no `@hozo/runtime` import, no handler, no ref. Those are the
 * ones here. The other six -- `Pressable`, `Button`, `TextInput`,
 * `ScrollView`, `Dialog`, and `FlatList`, which the Web backend carries
 * rather than lowers -- each need a client boundary, and in Astro that
 * means an island.
 *
 * Rendered without a `client:` directive, so Astro runs this at build time
 * and ships no JavaScript for it at all. `scripts/check-build.mjs` asserts
 * exactly that, because "works" and "works without shipping React" are
 * different claims and only the second one is interesting here.
 */
export function StaticCard() {
  return (
    <Section className="p-8 rounded-2xl bg-slate-900">
      <Heading level={2} className="text-2xl font-bold text-white">
        Compiled at build time
      </Heading>
      <Paragraph className="mt-4 text-slate-300">
        Every element below was a Hozo primitive in the source and is plain HTML in this page.
      </Paragraph>
      <View className="mt-6 flex flex-col gap-2">
        <List className="text-slate-300">
          <ListItem>No runtime import</ListItem>
          <ListItem>No event handler</ListItem>
          <ListItem>
            <Text className="font-semibold">No client bundle</Text>
          </ListItem>
        </List>
        <Link href="https://github.com/iray-tno/hozo" className="text-sky-400 underline">
          The compiler that produced this
        </Link>
      </View>
    </Section>
  )
}
