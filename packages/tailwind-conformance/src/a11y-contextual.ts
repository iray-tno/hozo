import { compile, compileNative } from '@hozo/compiler'

export interface A11yContextualCase {
  name: string
  purpose: string
  source: string
  web: string[]
  native: string[]
  diagnostics?: string[]
}

export interface A11yContextualResult extends A11yContextualCase {
  covered: boolean
  detail?: string
}

export const A11Y_CONTEXTUAL_CASES: A11yContextualCase[] = [
  {
    name: 'semantic document structure',
    purpose: 'paragraph, heading level and section intent survive platform lowering',
    source: '<Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>',
    web: ['<section>', '<h2>Title</h2>', '<p>Body</p>'],
    // The heading carries a style now -- bold, and sized by level. On
    // the Web that comes from the UA stylesheet and h2 is enough to say
    // it; React Native has no such thing, so the compiler is the only
    // place it can come from.
    native: [
      '<View>',
      '<Text style={hozoStyles.hozo1} accessibilityRole="header">Title</Text>',
      '<Text>Body</Text>',
    ],
  },
  {
    name: 'document landmarks',
    purpose: 'article and named navigation landmarks remain explicit on both platforms',
    source: '<Article><Nav accessibilityLabel="Primary" /></Article>',
    web: ['<article>', '<nav aria-label={"Primary"}>'],
    native: ['<View role="article">', '<View role="navigation" accessibilityLabel={"Primary"}>'],
  },
  {
    name: 'invalid document nesting diagnostic',
    purpose: 'a statically invalid paragraph structure never ships silently',
    source: '<Paragraph>Intro<Section>Details</Section></Paragraph>',
    web: ['<p>Intro<section>Details</section></p>'],
    native: ['<Text>Intro<View><Text>Details</Text></View></Text>'],
    diagnostics: ['INVALID_SEMANTIC_NESTING'],
  },
  {
    name: 'ordered static list',
    purpose: 'ordered list and item semantics survive without virtualizing a small document list',
    source: '<List ordered><ListItem>First</ListItem><ListItem>Second</ListItem></List>',
    web: ['<ol>', '<li>First</li>', '<li>Second</li>'],
    native: ['<View accessibilityRole="list">', '<View role="listitem"><Text>First</Text></View>'],
  },
  {
    name: 'described Image',
    purpose: 'one alternative text input reaches native semantics on both platforms',
    source: '<Image src="https://example.com/cover.jpg" alt="Cover art" />',
    web: ['<img', 'src={"https://example.com/cover.jpg"}', 'alt={"Cover art"}'],
    native: [
      '<Image',
      'source={{ uri: "https://example.com/cover.jpg" }}',
      'accessibilityLabel={"Cover art"}',
    ],
  },
  {
    name: 'semantic Link',
    purpose: 'a destination remains an anchor on Web and an opening link interaction on Native',
    source: '<Link href="https://example.com" accessibilityLabel="Documentation">Docs</Link>',
    web: ['<a', 'href="https://example.com"', 'aria-label={"Documentation"}'],
    native: ['<HozoLink', 'href="https://example.com"', 'accessibilityLabel={"Documentation"}'],
  },
  {
    name: 'semantic Button',
    purpose: 'name, hint and disabled state retain native semantics on both platforms',
    source:
      '<Button disabled={busy} accessibilityLabel="Save" accessibilityHint="Saves the draft">Save</Button>',
    // `type="button"`: React Native has no forms, so a Button that
    // happened to render inside one must not also submit it.
    web: [
      '<button type="button"',
      'disabled={busy}',
      'aria-label={"Save"}',
      'aria-description={"Saves the draft"}',
    ],
    native: [
      '<Pressable',
      'accessibilityRole="button"',
      'disabled={busy}',
      'accessibilityState={{ disabled: Boolean(busy) }}',
      'accessibilityHint={"Saves the draft"}',
    ],
  },
  {
    name: 'role-bearing Pressable',
    purpose: 'a generic interaction stays focusable and explicitly named',
    source:
      '<Pressable onPress={go} accessibilityRole="link" accessibilityLabel="Account">Account</Pressable>',
    // The tab stop, the click, the keyboard activation and the disabled
    // state all come from one call. They are five things that have to
    // agree, and spelling them out separately is how they stopped:
    // `aria-disabled` went out while the handler still ran. See
    // docs/decisions/001 and `@hozo/runtime`'s `interactive.ts`.
    web: ['<div', 'role="link"', 'aria-label={"Account"}', '{...hozoInteractive(go)}'],
    // `role`, not `accessibilityRole`: React Native has taken the ARIA
    // spelling since 0.71, so the two platforms now write the same word.
    native: ['<Pressable', 'role="link"', 'accessibilityLabel={"Account"}', 'onPress={go}'],
  },
  {
    name: 'named TextInput',
    purpose: 'a field name and supplemental guidance use each platform spelling',
    source:
      '<TextInput accessibilityLabel="Email" accessibilityHint="Work address" placeholder="you@example.com" />',
    web: [
      '<input',
      'aria-label={"Email"}',
      'aria-description={"Work address"}',
      'placeholder="you@example.com"',
    ],
    native: [
      '<TextInput',
      'accessibilityLabel={"Email"}',
      'accessibilityHint={"Work address"}',
      'placeholder="you@example.com"',
    ],
  },
  {
    name: 'modal Dialog',
    purpose: 'the accessible name, hint and dismissal callback reach the modal runtime',
    source:
      '<Dialog open={showing} onClose={dismiss} accessibilityLabel="Confirm" accessibilityHint="Review before continuing" />',
    web: [
      '<HozoDialog',
      'open={showing}',
      'onClose={dismiss}',
      'accessibilityLabel={"Confirm"}',
      'accessibilityHint={"Review before continuing"}',
    ],
    native: [
      '<HozoDialog',
      'open={showing}',
      'onClose={dismiss}',
      'accessibilityLabel={"Confirm"}',
      'accessibilityHint={"Review before continuing"}',
    ],
  },
  {
    name: 'missing interaction role diagnostic',
    purpose: 'an interactive generic container never fails accessibility silently',
    source: '<Pressable onPress={go}>Go</Pressable>',
    web: ['<div'],
    native: ['<Pressable'],
    diagnostics: ['A11Y_INTERACTIVE_WITHOUT_ROLE'],
  },
  {
    name: 'missing field name diagnostic',
    purpose: 'a placeholder is not accepted as a text field name',
    source: '<TextInput placeholder="you@example.com" />',
    web: ['<input'],
    native: ['<TextInput'],
    diagnostics: ['A11Y_MISSING_ACCESSIBLE_NAME'],
  },
  {
    name: 'incomplete Dialog diagnostic',
    purpose: 'an unnamed modal with no dismissal route reports both defects',
    source: '<Dialog open={showing} />',
    web: ['<HozoDialog'],
    native: ['<HozoDialog'],
    diagnostics: ['A11Y_MISSING_ACCESSIBLE_NAME', 'A11Y_DIALOG_WITHOUT_DISMISS'],
  },
  {
    name: 'generic container',
    purpose: 'a plain container carries no role it did not ask for, on either platform',
    // The primitive everything else sits inside, and the one with the most
    // to lose from a helpful default: a `div` that arrived with a role
    // would put that role around every subtree in the application. Its
    // implicit role is `generic`, which is also why a bare one cannot be
    // given a name -- see the scroll cases below for the same rule biting
    // somewhere it matters more.
    source: '<View><Text>a</Text></View>',
    web: [`<div className="hozo-view"><span>a</span></div>`],
    native: ['<View><Text>a</Text></View>'],
  },
  {
    name: 'named scrollable region',
    purpose: 'a named scroll container is announced on both platforms, not only on one',
    // The role is load-bearing and the contract is here to say so. Without
    // it the Web lowering is a bare `div`, whose implicit role is
    // `generic`, and `generic` prohibits an accessible name -- so the same
    // source would be announced as "Feed" on a device and as nothing at all
    // in a browser. The compiler says so (`ARIA_NAME_PROHIBITED`), which is
    // the next case; this one is the shape that works.
    //
    // The name is half of it. A scroll container also has to be *reachable*
    // -- a `div` with `overflow: auto` scrolls under a pointer and is
    // unreachable from a keyboard unless something in it is focusable, and
    // React Native's own ScrollView is scrolled by touch with the platform
    // handling the reaching. So the Web lowering carries
    // `{...hozoScrollable()}`, which decides at runtime: none of what
    // decides it -- overflow, viewport, whether a child rendered something
    // focusable -- is a compile-time fact. Native needs nothing.
    source: '<ScrollView role="region" accessibilityLabel="Feed"><Text>a</Text></ScrollView>',
    web: [
      '<div className="hozo-scroll-view" role="region" aria-label={"Feed"}',
      '{...hozoScrollable()}',
    ],
    native: ['<ScrollView role="region" accessibilityLabel={"Feed"}>'],
  },
  {
    name: 'unnamed scrollable region diagnostic',
    purpose: 'a name the Web lowering cannot carry is reported rather than dropped',
    source: '<ScrollView accessibilityLabel="Feed"><Text>a</Text></ScrollView>',
    web: ['<div className="hozo-scroll-view"'],
    native: ['<ScrollView accessibilityLabel={"Feed"}>'],
    diagnostics: ['ARIA_NAME_PROHIBITED'],
  },
  {
    name: 'virtualized list semantics',
    purpose: 'a long list keeps its list role on Native and its runtime component on Web',
    // Asymmetric on purpose, and worth pinning because it looks like a gap.
    // Web carries `FlatList` verbatim -- it is `@hozo/core`'s own component
    // there, and the semantics are that component's to provide -- while
    // Native lowers to React Native's and adds the role its own list
    // primitive would have carried.
    source:
      '<FlatList accessibilityLabel="Rows" data={rows} ' +
      'renderItem={({ item }) => <Text>{item}</Text>} />',
    web: ['<FlatList accessibilityLabel={"Rows"}'],
    native: ['<FlatList accessibilityRole="list" accessibilityLabel={"Rows"}'],
  },
  {
    name: 'named drawing',
    purpose: 'a chart carries one name to both platforms, and a decorative one carries none',
    source:
      '<Svg accessibilityLabel="Chart" viewBox="0 0 10 10">' +
      '<Svg.Rect width={10} height={10} /></Svg>',
    // The role, not only the name. An accessible name on an `<svg>` is
    // not reliably a name: the implicit role varies by browser and screen
    // reader, and several combinations compute none at all without an
    // explicit one. `@hozo/canvas` already said `role="img"` for its own
    // surface, so a named drawing was announced by one of Hozo's two
    // drawing primitives and not the other.
    web: ['<svg role="img" aria-label={"Chart"}', '<rect'],
    native: ['<Svg accessible accessibilityRole="image" accessibilityLabel={"Chart"}', '<Rect'],
  },
  {
    name: 'decorative drawing',
    purpose: 'a drawing hidden from assistive technology stays hidden on both platforms',
    source: '<Svg aria-hidden viewBox="0 0 10 10"><Svg.Rect width={10} height={10} /></Svg>',
    web: ['<svg aria-hidden'],
    native: ['<Svg aria-hidden'],
  },
  {
    name: 'landmark regions',
    purpose: 'the regions a screen reader navigates by survive both lowerings',
    source: '<Main><Header>H</Header><Aside>A</Aside><Footer>F</Footer></Main>',
    web: ['<main>', '<header>', '<aside>', '<footer>'],
    // React Native has no elements, so every one of these is a role. The
    // names differ because ARIA's do: a `<header>` is a banner.
    native: [
      '<View role="main">',
      '<View role="banner">',
      '<View role="complementary">',
      '<View role="contentinfo">',
    ],
  },
  {
    name: 'the landmark React Native has no word for',
    purpose: 'a search region is a region on Web and an unlabelled box on Native, deliberately',
    // React Native's `Role` carries every other landmark here and offers
    // `searchbox` for this one, which is the field rather than the region
    // around it -- and `accessibilityRole: 'search'` means the field too.
    // So this is a plain View and says so, rather than claiming a landmark
    // by naming a widget. The compiler emitted `role="search"` until the
    // contract was written, which React Native does not accept.
    source: '<Search>S</Search>',
    web: ['<search>'],
    native: ['<View><Text>S</Text></View>'],
  },
  {
    name: 'figure and its caption',
    purpose: 'a figure keeps the association between the drawing and what it is called',
    source: '<Figure><Figcaption>Caption</Figcaption></Figure>',
    web: ['<figure>', '<figcaption>'],
    native: ['<View role="figure">', '<Text>Caption</Text>'],
  },
  {
    name: 'contact address',
    purpose: 'an address is a block on both platforms and claims no role it cannot keep',
    source: '<Address>Somewhere</Address>',
    web: ['<address>'],
    native: ['<View><Text>Somewhere</Text></View>'],
  },
  {
    name: 'a disclosure and its trigger',
    purpose: 'the summary is the control, and it is a control on both platforms',
    // `<details>` is the whole feature on the Web: the browser opens it,
    // hides the body while closed, and reports the expanded state without
    // being asked. React Native has none of that, so the pair becomes two
    // components from `@hozo/behaviors` -- the same arrangement `Dialog`
    // has, and for the same reason. It used to be a View holding a
    // Pressable with no handler and then the body, always: a disclosure
    // that could not close.
    source: '<Details><Summary>More</Summary><Paragraph>Body</Paragraph></Details>',
    web: ['<details>', '<summary>'],
    native: ['<HozoDetails>', '<HozoSummary>'],
  },
  {
    name: 'a group of fields and its name',
    purpose: 'a fieldset is a named group, which is the one thing it exists to be',
    source: '<Fieldset><Legend>Name</Legend></Fieldset>',
    web: ['<fieldset>', '<legend>'],
    native: ['<View role="group">'],
  },
  {
    name: 'a description list',
    purpose: 'terms and their descriptions stay a list on both platforms',
    // `<dl>` is a list on the Web through the element. On React Native the
    // list role is on the container and the two halves are plain text and
    // a plain box: ARIA has `term` and `definition`, React Native's role
    // union has neither, and inventing a nearby one would be worse than
    // saying nothing.
    source: '<TermList><Term>Hozo</Term><Description>A compiler</Description></TermList>',
    web: ['<dl>', '<dt>', '<dd>'],
    native: ['<View role="list">'],
  },
  {
    name: 'a progress bar reports its position',
    purpose: 'the value reaches assistive technology on both platforms, not just the role',
    // `value` and `max` are `<progress>`'s own props and mean nothing on a
    // View, so the compiled element announced itself as a progress bar and
    // reported no position -- "progress bar", and nothing else. React
    // Native carries the position on `accessibilityValue`.
    source: '<Progress value={40} max={100} />',
    web: ['<progress value={40} max={100}>'],
    native: ['role="progressbar"', 'accessibilityValue={{ min: 0, max: 100, now: 40 }}'],
  },
  {
    name: 'a separator is a separator',
    purpose: 'a rule between sections is announced as one rather than as an empty box',
    source: '<Separator />',
    web: ['<hr />'],
    native: ['<View role="separator">'],
  },
  {
    name: 'a machine-readable time',
    purpose: 'the machine-readable form survives, and the visible text is still text',
    source: '<Time dateTime="2026-09-06">today</Time>',
    web: ['<time dateTime="2026-09-06">'],
    native: ['<Text dateTime="2026-09-06">today</Text>'],
  },
  {
    name: 'inline emphasis and its meaning',
    purpose: 'weight, italics and the rest are elements on Web and styles on Native',
    // The asymmetry is the contract. `<strong>` carries meaning a screen
    // reader can announce; React Native's `Text` has no equivalent, so the
    // compiler applies the UA stylesheet's *appearance* and the meaning is
    // lost. Written down rather than implied: the alternative would be to
    // claim a role React Native does not have.
    source:
      '<Paragraph><Strong>a</Strong><Emphasis>b</Emphasis><Underline>c</Underline><Strikethrough>d</Strikethrough><Code>f</Code><Mark>g</Mark></Paragraph>',
    web: ['<strong>', '<em>', '<u>', '<s>', '<code>', '<mark>'],
    // Six styled runs, one per element: the appearance survives and the
    // meaning does not. The styles themselves are `semantic_defaults` in
    // the Native backend and are checked there.
    native: ['<Text style={hozoStyles.hozo1}>a</Text>', '<Text style={hozoStyles.hozo6}>g</Text>'],
  },
  {
    name: 'scripts, small print and an unbreakable run',
    purpose: 'subscript, superscript and small print keep their appearance across the two',
    source:
      '<Paragraph>x<Sub>1</Sub>y<Sup>2</Sup><Small>fine print</Small><NoBreak>no break</NoBreak></Paragraph>',
    web: ['<sub>', '<sup>', '<small>', "whiteSpace: 'nowrap'"],
    // A non-breaking run is a character on this platform rather than a
    // style: React Native has no `white-space`, so the spaces themselves
    // are replaced.
    native: ['<Text>x<Text>1</Text>y<Text>2</Text>', 'no\u00A0break'],
  },
  {
    name: 'ruby and its reading',
    purpose: 'the annotation is not read twice, and is not read as part of the base text',
    // `<ruby>` on the Web is one element a browser knows how to lay out
    // and announce. React Native has no ruby layout, and flattens nested
    // `Text` into one accessibility node -- so the base and the reading
    // were announced together: 「漢字かんじ」, the word twice. The label is
    // what stops that, and the compiler writes it when the word is
    // static, which is most ruby.
    source: '<Ruby>漢字<RubyText>かんじ</RubyText></Ruby>',
    web: ['<ruby>', '<rt>'],
    native: ['<Text accessibilityLabel="漢字">漢字<Text>かんじ</Text></Text>'],
  },
]

/**
 * Primitives with no cross-platform contract, and why.
 *
 * Empty, and meant to stay that way. It exists because the check below
 * needs somewhere for a deliberate exemption to go: a primitive left out
 * on purpose should say so here rather than be quietly absent, which is
 * the difference between a decision and an oversight.
 */
export const CONTRACT_EXEMPT: Record<string, string> = {}

/**
 * Every primitive named by at least one contract above.
 *
 * The expectations cannot be derived -- what `<Nav>` becomes on each
 * platform is Hozo's decision and appears in no specification, which is
 * why `aria-roles.ts` could read `aria-query` and this cannot. The
 * *coverage* can be, and that is the half that goes stale: `FlatList`,
 * `ScrollView` and `Svg` had no contract at all when this was written, and
 * nothing said so.
 */
export function primitivesUnderContract(): Set<string> {
  const named = new Set<string>()
  for (const testCase of A11Y_CONTEXTUAL_CASES) {
    for (const match of testCase.source.matchAll(/<([A-Z][A-Za-z]*)/g)) named.add(match[1])
  }
  return named
}

export function compareA11yContextual(testCase: A11yContextualCase): A11yContextualResult {
  const source =
    `import { Address, Article, Aside, Button, Code, Description, Details, Dialog, Emphasis, Fieldset, Figcaption, Figure, Footer, Header, Heading, Image, Legend, Link, List, ListItem, Main, Mark, Nav, NoBreak, Paragraph, Pressable, Progress, Ruby, RubyText, Search, Section, Separator, Small, Strikethrough, Strong, Sub, Summary, Sup, Term, TermList, Time, TextInput, Underline } from '@hozo/core'\n` +
    `export function C() { return ${testCase.source} }\n`
  const [web] = compile(source)
  const [native] = compileNative(source)
  if (!web || !native)
    return { ...testCase, covered: false, detail: 'one backend emitted no component' }

  const failures: string[] = []
  for (const marker of testCase.web) if (!web.jsx.includes(marker)) failures.push(`Web: ${marker}`)
  for (const marker of testCase.native)
    if (!native.jsx.includes(marker)) failures.push(`Native: ${marker}`)
  const expectedDiagnostics = testCase.diagnostics ?? []
  for (const code of expectedDiagnostics) {
    if (!web.diagnostics.some((diagnostic) => diagnostic.code === code))
      failures.push(`Web diagnostic: ${code}`)
    if (!native.diagnostics.some((diagnostic) => diagnostic.code === code))
      failures.push(`Native diagnostic: ${code}`)
  }
  if (expectedDiagnostics.length === 0) {
    if (web.diagnostics.length > 0)
      failures.push(`unexpected Web diagnostic: ${web.diagnostics[0].code}`)
    if (native.diagnostics.length > 0)
      failures.push(`unexpected Native diagnostic: ${native.diagnostics[0].code}`)
  }
  return failures.length === 0
    ? { ...testCase, covered: true }
    : { ...testCase, covered: false, detail: failures.join(', ') }
}
