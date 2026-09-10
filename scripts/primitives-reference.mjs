// The primitives reference, generated rather than written.
//
//   node scripts/primitives-reference.mjs          # write docs/primitives.md
//   node scripts/primitives-reference.mjs --check  # verify, exit 1 on drift
//
// A hand-written reference would have been wrong on the day it was
// written: five of the six primitives #78 called universal were exported
// on the Web and absent from `@hozo/core`'s native entry, and nothing said
// so until `parity.test.ts` was written to ask (#265). A page listing what
// a compiler does is a second claim about the compiler, kept by hand, next
// to a first one that is already checked on every run.
//
// So each row has two halves and neither is typed here:
//
//   the claim  -- the doc comment above the variant in `hozo_ir`, which is
//                 where the intent of a primitive is written down and the
//                 one place that cannot drift from the set itself
//   the fact   -- what the compiler emits for that primitive, right now,
//                 asked of both backends
//
// Putting them beside each other is the point. A doc comment saying
// "`<nav>` on Web and a role-bearing `View` on React Native" next to
// `<nav className="hozo-view">` and `<View role="navigation">` is a
// reference that cannot quietly become a wish.
//
// The one thing written by hand is `SNIPPETS`: the smallest source that
// exercises each primitive. A primitive with no entry is a hard failure,
// which is the check #265 asked for -- adding one to `hozo_ir` and not to
// the reference has to fail rather than produce a page with a hole.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile, compileNative } from '../packages/compiler/src/index.ts'
import { A11Y_CONTEXTUAL_CASES } from '../packages/tailwind-conformance/src/a11y-contextual.ts'
import { declaredPrimitivesWithDocs } from '../packages/tailwind-conformance/src/primitives.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(root, 'docs', 'primitives.md')

/**
 * The smallest source that exercises each primitive.
 *
 * Small on purpose: what is being shown is the lowering, so anything the
 * snippet adds is something the reader has to subtract. Where a primitive
 * needs a prop to compile without a diagnostic -- an image with no name, a
 * dialog with no way out -- the prop is there, because a reference full of
 * incidental warnings teaches people to ignore warnings. That is enforced
 * below rather than trusted.
 */
const SNIPPETS = {
  ActivityIndicator: '<ActivityIndicator accessibilityLabel="Loading" />',
  Address: '<Address>x</Address>',
  AnimatedView: '<Animated.View>x</Animated.View>',
  Article: '<Article>x</Article>',
  Aside: '<Aside>x</Aside>',
  Button: '<Button>Save</Button>',
  Code: '<Code>x</Code>',
  Description: '<Description>x</Description>',
  Details: '<Details><Summary>More</Summary>x</Details>',
  Dialog: '<Dialog open accessibilityLabel="Settings" onClose={dismiss}>x</Dialog>',
  Emphasis: '<Emphasis>x</Emphasis>',
  Fieldset: '<Fieldset><Legend>Options</Legend>x</Fieldset>',
  Figcaption: '<Figcaption>x</Figcaption>',
  Figure: '<Figure>x</Figure>',
  FlatList: '<FlatList data={rows} renderItem={({ item }) => <Text>{item}</Text>} />',
  Footer: '<Footer>x</Footer>',
  Header: '<Header>x</Header>',
  Heading: '<Heading level={2}>x</Heading>',
  Image: '<Image src="/a.png" alt="A picture" />',
  Legend: '<Legend>x</Legend>',
  Link: '<Link href="/a">x</Link>',
  List: '<List><ListItem>x</ListItem></List>',
  ListItem: '<ListItem>x</ListItem>',
  Main: '<Main>x</Main>',
  Mark: '<Mark>x</Mark>',
  Modal: '<Modal visible accessibilityLabel="Sheet" onRequestClose={close}>x</Modal>',
  Nav: '<Nav>x</Nav>',
  NoBreak: '<NoBreak>x</NoBreak>',
  Paragraph: '<Paragraph>x</Paragraph>',
  Pressable: '<Pressable role="button" onPress={go}>x</Pressable>',
  Progress: '<Progress value={40} max={100} accessibilityLabel="Upload" />',
  RefreshControl: '<RefreshControl refreshing={busy} onRefresh={reload} />',
  Ruby: '<Ruby>x<RubyText>y</RubyText></Ruby>',
  RubyText: '<RubyText>x</RubyText>',
  ScrollView: '<ScrollView>x</ScrollView>',
  Search: '<Search>x</Search>',
  Section: '<Section>x</Section>',
  Separator: '<Separator />',
  Small: '<Small>x</Small>',
  Strikethrough: '<Strikethrough>x</Strikethrough>',
  Strong: '<Strong>x</Strong>',
  Sub: '<Sub>x</Sub>',
  Summary: '<Summary>x</Summary>',
  Sup: '<Sup>x</Sup>',
  Svg: '<Svg viewBox="0 0 8 8" accessibilityLabel="Chart"><Svg.Rect width={8} height={8} /></Svg>',
  Term: '<Term>x</Term>',
  TermList: '<TermList><Term>x</Term><Description>y</Description></TermList>',
  Text: '<Text>x</Text>',
  TextInput: '<TextInput accessibilityLabel="Name" />',
  Time: '<Time dateTime="2026-09-11">x</Time>',
  TouchableOpacity: '<TouchableOpacity role="button" onPress={go}>x</TouchableOpacity>',
  TouchableWithoutFeedback:
    '<TouchableWithoutFeedback role="button" onPress={go}>x</TouchableWithoutFeedback>',
  Underline: '<Underline>x</Underline>',
  View: '<View>x</View>',
}

/** Everything a snippet might name, so one import line covers them all. */
const IMPORTS =
  `import { ${Object.keys(SNIPPETS)
    .filter((name) => name !== 'AnimatedView')
    .join(', ')} } from '@hozo/core'\n` + `import { Animated } from 'react-native'\n`

/** The opening tag a backend emitted, attributes and all. */
function openingTag(jsx) {
  if (!jsx) return undefined
  const match = /<[A-Za-z][^>]*?\/?>/.exec(jsx)
  if (!match) return undefined
  // Style references are noise here: they name a generated object rather
  // than a decision, and every primitive that takes a class has one.
  return match[0].replace(/ style=\{[^}]*\}/g, '').replace(/\s+/g, ' ')
}

function lowerings(name) {
  const source = `${IMPORTS}export const C = () => (${SNIPPETS[name]})\n`
  const web = compile(source)[0]
  const native = compileNative(source)[0]
  return {
    web: openingTag(web?.jsx),
    native: openingTag(native?.jsx),
    diagnostics: [
      ...new Set([...(web?.diagnostics ?? []), ...(native?.diagnostics ?? [])].map((d) => d.code)),
    ].sort(),
  }
}

/** The contract cases that pin a primitive, by name. */
function contracts(name) {
  return A11Y_CONTEXTUAL_CASES.filter((entry) =>
    new RegExp(`<${name}[\\s/>]`).test(entry.source),
  ).map((entry) => entry.name)
}

/** The role a lowering announces, in either platform's spelling. */
function roleOf(tag) {
  const match = /(?:accessibilityRole|role)="?\{?"?([a-zA-Z]+)/.exec(tag ?? '')
  return match ? match[1] : undefined
}

const primitives = declaredPrimitivesWithDocs()

const problems = []
const missingSnippet = primitives.filter((entry) => !(entry.name in SNIPPETS)).map((e) => e.name)
if (missingSnippet.length > 0) {
  problems.push(
    `no snippet for ${missingSnippet.join(', ')} -- add one to SNIPPETS in this file, so the ` +
      'reference says what the primitive lowers to rather than leaving a hole',
  )
}
const missingDoc = primitives.filter((entry) => !entry.doc).map((e) => e.name)
if (missingDoc.length > 0) {
  problems.push(
    `no doc comment on ${missingDoc.join(', ')} in hozo_ir's \`Primitive\` -- the reference has ` +
      'nothing to print for what the primitive is *meant* to be, and a row with only the ' +
      'output is a row nothing can disagree with',
  )
}
if (problems.length > 0) {
  console.error('the primitives reference cannot be generated:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const rows = primitives.map((entry) => ({ ...entry, ...lowerings(entry.name) }))

// A snippet that warns is a bad example, and a page full of them teaches
// people to ignore warnings.
const noisy = rows.filter((row) => row.diagnostics.length > 0)
if (noisy.length > 0) {
  console.error('these snippets raise diagnostics, so they are not examples worth printing:\n')
  for (const row of noisy) console.error(`  - ${row.name}: ${row.diagnostics.join(', ')}`)
  process.exit(1)
}

// The asymmetry worth reading, which is not "the tags have different
// names" -- a `<section>` and a `View` are the same box, and every row
// would be in that list. What matters is whether the *role* survives.
const asymmetric = rows
  .map((row) => ({ ...row, webRole: roleOf(row.web), nativeRole: roleOf(row.native) }))
  .filter((row) => row.webRole !== row.nativeRole)

const cell = (value) => (value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const code = (value) => (value ? `\`${cell(value)}\`` : '—')

const page = [
  '# Primitives',
  '',
  '<!-- Generated by scripts/primitives-reference.mjs. Do not edit. -->',
  '',
  `${rows.length} primitives, each compiled through both backends to produce this page.`,
  '',
  'Two halves per row, and neither is written here. The **intent** below is the doc comment',
  "above the variant in `hozo_ir`'s `Primitive` enum, which is where a primitive's purpose is",
  'recorded and the one place that cannot drift from the set. The **Web** and **React Native**',
  'columns are what the compiler emitted for a snippet, in the same run that wrote this file.',
  '',
  '## Every primitive',
  '',
  '| Primitive | Web | React Native | Pinned by |',
  '| --- | --- | --- | --- |',
  ...rows.map((row) => {
    const pinned = contracts(row.name)
    const cases = pinned.length > 0 ? pinned.map((name) => cell(name)).join('; ') : '—'
    return `| \`${row.name}\` | ${code(row.web)} | ${code(row.native)} | ${cases} |`
  }),
  '',
  '"Pinned by" names the cases in `packages/tailwind-conformance/src/a11y-contextual.ts` that',
  'assert this primitive on both platforms. A dash there is a primitive whose lowering nothing',
  'holds still.',
  '',
  '## Where the role has to be said out loud',
  '',
  'A different tag name is not a difference worth printing: a `<section>` and a `View` are the',
  'same box. What is worth knowing is where a role has to be *written* on one side and not the',
  'other, because that is the work the compiler is doing.',
  '',
  'Both columns are the role written into the output. On the Web most of these are blank',
  'because the element already carries the role -- a `<nav>` is a navigation landmark without',
  'anybody saying so -- while React Native has no elements, so every role it keeps is one the',
  'compiler put there. A blank on the React Native side is a role that platform has no word',
  'for, and those are the ones that are genuinely lost.',
  '',
  '| Primitive | Web | React Native |',
  '| --- | --- | --- |',
  ...asymmetric.map(
    (row) => `| \`${row.name}\` | ${code(row.webRole)} | ${code(row.nativeRole)} |`,
  ),
  '',
  `${asymmetric.length} of ${rows.length}.`,
  '',
  '## What each one is for',
  '',
  ...rows.flatMap((row) => [`**\`${row.name}\`** — ${cell(row.doc)}`, '']),
].join('\n')

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUTPUT, 'utf8')
  } catch {}
  if (current !== page) {
    console.error(
      'docs/primitives.md is out of date. Run: node scripts/primitives-reference.mjs\n\n' +
        'It is generated from the `Primitive` enum and from what the compiler emits, so a ' +
        'difference here means one of those changed and the page did not.',
    )
    process.exit(1)
  }
  console.log(`docs/primitives.md is current (${rows.length} primitives)`)
} else {
  writeFileSync(OUTPUT, page)
  console.log(`wrote docs/primitives.md (${rows.length} primitives)`)
}
