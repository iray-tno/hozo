// Every primitive on one screen, so a device can be asked about all of
// them at once.
//
// `App.tsx` is an acceptance screen: a handful of primitives arranged the
// way an application would arrange them, which is what makes it a good
// smoke test and a poor census. The accessibility contract in #260 is
// about *every* primitive, and until now the only ones a device had ever
// rendered were the eight that happened to be on that screen.
//
// So this is the census. Each primitive gets a `testID` of the form
// `gallery-<name>`, which is what lets the tree be joined back to the
// compiler's output for the same source -- the comparison
// `packages/tailwind-conformance/src/native-tree.ts` already makes for
// the acceptance screen.
//
// Hand-written and guarded rather than generated. `gallery.test.ts` fails
// if `@hozo/core` publishes a component this screen does not render and
// does not excuse with a reason, which is the same shape as `WEB_ONLY` in
// the parity test and `NEEDS_MORE_THAN_CHILDREN` in the fallback one. A
// generated screen would also have to typecheck and render, and the guard
// buys the property that matters -- nothing added later goes unseen --
// for a fraction of the machinery.
//
// The composite widgets are not here. `Combobox`, `Listbox`, `Menu`,
// `RadioGroup`, `Tabs`, `Toolbar` and `Tree` are ARIA patterns driven by
// props rather than children, they have fifty-six tests of their own in
// `@hozo/core`, and none of them accepts a `testID` at all -- which is its
// own finding and not one to fix in the same change as this.

// The four `probe-*` buttons at the foot of this screen are not part of
// the census. They exist to answer #357, where the compiled Continue
// button on the acceptance screen renders with no background and an
// accessibility frame the size of its label -- on both platforms, and
// still after #334, which fixed a real thing that turned out not to be
// this one.
//
// Every test in this repository passes while that is true, because
// `react-native-stub.js` makes `createAnimatedComponent` the identity:
// the layer where this breaks is one no test here can reach. So the next
// step is evidence rather than another guess, and each probe adds exactly
// one thing to the compiled output -- measured, not assumed:
//
//   probe-plain       Pressable,      a static style
//   probe-hover       HozoPressable,  + a callback style
//   probe-transition  HozoPressable,  + hozoTransition
//   probe-focus       HozoPressable,  + hozoFocusVisible
//
// The last is the Continue button's class list exactly. Each has a colour
// nothing else on this screen uses, so one screenshot scan says which ones
// drew; each has a frame in the tree, so the same run says which ones kept
// their padding.
import {
  Address,
  Article,
  Aside,
  Button,
  Code,
  Del,
  Description,
  Details,
  Emphasis,
  Fieldset,
  Figcaption,
  Figure,
  Footer,
  Header,
  Heading,
  Legend,
  Link,
  List,
  ListItem,
  Main,
  Mark,
  Nav,
  NoBreak,
  Paragraph,
  Pressable,
  Progress,
  Ruby,
  RubyText,
  ScrollView,
  Search,
  Section,
  Separator,
  Small,
  Strikethrough,
  Strong,
  Sub,
  Summary,
  Sup,
  Term,
  TermList,
  Text,
  Time,
  Underline,
  View,
} from '@hozo/core'

/**
 * The census screen.
 *
 * Reached from `App.tsx` by pressing the button with `testID`
 * `smoke-gallery`, because a second registered component would need a
 * second activity and the smoke script already knows how to press things.
 */
export default function Gallery() {
  return (
    <ScrollView className="flex-1 bg-slate-50" testID="gallery">
      <Main className="p-4 gap-2" testID="gallery-Main">
        <Heading level={1} className="text-xl" testID="gallery-Heading">
          Gallery
        </Heading>

        <Header className="gap-1" testID="gallery-Header">
          <Text testID="gallery-Text">Text</Text>
          <Paragraph testID="gallery-Paragraph">Paragraph</Paragraph>
        </Header>

        <Nav accessibilityLabel="Sections" testID="gallery-Nav">
          <Link href="https://example.com" testID="gallery-Link">
            Link
          </Link>
        </Nav>

        <Section className="gap-1" testID="gallery-Section">
          <Strong testID="gallery-Strong">Strong</Strong>
          <Emphasis testID="gallery-Emphasis">Emphasis</Emphasis>
          <Underline testID="gallery-Underline">Underline</Underline>
          <Strikethrough testID="gallery-Strikethrough">Strikethrough</Strikethrough>
          <Del testID="gallery-Del">Del</Del>
          <Code testID="gallery-Code">Code</Code>
          <Mark testID="gallery-Mark">Mark</Mark>
          <Small testID="gallery-Small">Small</Small>
          <NoBreak testID="gallery-NoBreak">NoBreak</NoBreak>
          <Text>
            Sub<Sub testID="gallery-Sub">sub</Sub> and sup
            <Sup testID="gallery-Sup">sup</Sup>
          </Text>
          <Ruby testID="gallery-Ruby">
            漢<RubyText testID="gallery-RubyText">かん</RubyText>
          </Ruby>
          <Time dateTime="2026-09-07" testID="gallery-Time">
            7 September 2026
          </Time>
        </Section>

        <Article className="gap-1" testID="gallery-Article">
          <Aside testID="gallery-Aside">
            <Text>Aside</Text>
          </Aside>
          <Address testID="gallery-Address">
            <Text>Address</Text>
          </Address>
        </Article>

        <Search testID="gallery-Search">
          <Text>Search</Text>
        </Search>

        <Figure testID="gallery-Figure">
          <Figcaption testID="gallery-Figcaption">Figcaption</Figcaption>
        </Figure>

        <Fieldset testID="gallery-Fieldset">
          <Legend testID="gallery-Legend">Legend</Legend>
        </Fieldset>

        <List testID="gallery-List">
          <ListItem testID="gallery-ListItem">ListItem</ListItem>
        </List>

        <TermList testID="gallery-TermList">
          <Term testID="gallery-Term">Term</Term>
          <Description testID="gallery-Description">Description</Description>
        </TermList>

        <Details open testID="gallery-Details">
          <Summary testID="gallery-Summary">Summary</Summary>
          <Text>Disclosed</Text>
        </Details>

        <Separator testID="gallery-Separator" />

        {/* Two of them, which is an experiment rather than a census entry.
            `gallery-Progress` did not appear in the accessibility tree at
            all on the first device run, and there are two candidate
            reasons: it lowers to a `View` with no size, and a zero-area
            view is not something `uiautomator dump` reports -- or the role
            is reaching the platform and the instrument cannot see it,
            since Android answers `progressbar` with a `roleDescription`
            and that is not among the attributes a dump carries.

            Giving one of them a size separates the two. If the sized one
            appears and the bare one does not, it is the area; if neither
            appears, the role is not making the node reportable and the
            question moves to an instrument that can read a
            `roleDescription`. See #309. */}
        <Progress value={40} max={100} testID="gallery-Progress" />
        <Progress
          value={40}
          max={100}
          className="h-2 bg-slate-300"
          testID="gallery-ProgressSized"
        />

        <Button accessibilityLabel="A button" testID="gallery-Button">
          Button
        </Button>

        <Pressable
          href="/gallery-card"
          accessibilityLabel="A linked card"
          testID="gallery-Pressable"
        >
          <Text>Pressable link card</Text>
        </Pressable>

        {/* The four probes from #357; the file header says what they are for. */}
        <Pressable className="rounded-lg bg-red-500 p-3" testID="probe-plain">
          <Text className="text-white">Plain</Text>
        </Pressable>

        <Pressable
          className="rounded-lg bg-orange-500 p-3 hover:bg-orange-600"
          testID="probe-hover"
        >
          <Text className="text-white">Hover, no transition</Text>
        </Pressable>

        <Pressable
          className="rounded-lg bg-green-600 p-3 transition-colors duration-200 hover:bg-green-700"
          testID="probe-transition"
        >
          <Text className="text-white">Transition</Text>
        </Pressable>

        <Pressable
          className="rounded-lg bg-blue-600 p-3 transition-colors duration-200 hover:bg-blue-700 focus-visible:bg-blue-800"
          testID="probe-focus"
        >
          <Text className="text-white">Focus visible</Text>
        </Pressable>

        <View testID="gallery-View">
          <Text>View</Text>
        </View>

        <Footer testID="gallery-Footer">
          <Text>Footer</Text>
        </Footer>
      </Main>
    </ScrollView>
  )
}
