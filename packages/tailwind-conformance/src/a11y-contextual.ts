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
    web: ['<section className="hozo-view">', '<h2>Title</h2>', '<p>Body</p>'],
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
    web: ['<article className="hozo-view">', '<nav className="hozo-view" aria-label={"Primary"}>'],
    native: ['<View role="article">', '<View role="navigation" accessibilityLabel={"Primary"}>'],
  },
  {
    name: 'invalid document nesting diagnostic',
    purpose: 'a statically invalid paragraph structure never ships silently',
    source: '<Paragraph>Intro<Section>Details</Section></Paragraph>',
    web: [`<p>Intro<section className="hozo-view">Details</section></p>`],
    native: ['<Text>Intro<View><Text>Details</Text></View></Text>'],
    diagnostics: ['INVALID_SEMANTIC_NESTING'],
  },
  {
    name: 'ordered static list',
    purpose: 'ordered list and item semantics survive without virtualizing a small document list',
    source: '<List ordered><ListItem>First</ListItem><ListItem>Second</ListItem></List>',
    web: [
      '<ol className="hozo-view">',
      '<li className="hozo-view">First</li>',
      '<li className="hozo-view">Second</li>',
    ],
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
    // docs/decisions/001 and `@hozo/engine`'s `interactive.ts`.
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
    purpose: 'a long list reaches both platforms as a runtime component that knows its length',
    // Symmetric now, and it was not. Web lowered to the RNW-free
    // `HozoFlatList` and Native to React Native's own list, and the
    // asymmetry was pinned here as deliberate. It cost something: a
    // windowed list has a length its accessibility tree does not, and the
    // prop that tells Android otherwise -- `accessibilityCollection` -- is
    // not something a list can set for itself from inside `renderItem`. So
    // both sides go through `@hozo/engine` now, and the role Native adds
    // is still added.
    //
    // That prop is no longer set -- it crashes the app (#512) -- and the
    // wrapper stays for the per-cell half, which is the same argument.
    source:
      '<FlatList accessibilityLabel="Rows" data={rows} ' +
      'renderItem={({ item }) => <Text>{item}</Text>} />',
    web: ['<HozoFlatList accessibilityLabel={"Rows"}'],
    native: ['<HozoFlatList accessibilityRole="list" accessibilityLabel={"Rows"}'],
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
    web: [
      '<main className="hozo-view">',
      '<header className="hozo-view">',
      '<aside className="hozo-view">',
      '<footer className="hozo-view">',
    ],
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
    web: ['<search className="hozo-view">'],
    native: ['<View><Text>S</Text></View>'],
  },
  {
    name: 'figure and its caption',
    purpose: 'a figure keeps the association between the drawing and what it is called',
    source: '<Figure><Figcaption>Caption</Figcaption></Figure>',
    web: ['<figure className="hozo-view">', '<figcaption>'],
    native: ['<View role="figure">', '<Text>Caption</Text>'],
  },
  {
    name: 'contact address',
    purpose: 'an address is a block on both platforms and claims no role it cannot keep',
    source: '<Address>Somewhere</Address>',
    web: ['<address className="hozo-view">'],
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
    web: ['<fieldset className="hozo-view">', '<legend>'],
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
    web: ['<dl className="hozo-view">', '<dt>', '<dd className="hozo-view">'],
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
    purpose: 'a rule between sections is announced as one, and is a rule rather than an empty box',
    source: '<Separator />',
    web: ['<hr />'],
    // The style is half the contract. `<hr>` takes its line from the
    // browser's user-agent stylesheet; React Native has none, so a `View`
    // with no size is zero pixels tall and draws nothing at all. This case
    // used to match `<View role="separator">` and passed while the
    // compiled rule was invisible on a device (#309).
    native: ['<View style={hozoStyles.hozo0} role="separator">'],
  },
  {
    name: 'a decorative separator is silent',
    purpose: 'a rule drawn to look like a line is not announced as structure',
    // The other half of the same prop. `decorative` says the rule carries
    // no meaning, and both backends used to emit it verbatim -- an
    // attribute neither platform reads -- while still announcing the
    // element as a separator.
    source: '<Separator decorative />',
    web: ['<hr role="none" aria-hidden={true} />'],
    native: ['role="none"', 'accessibilityRole="none"'],
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
    // Each of the three carries a size now. Nothing here names one, so
    // the ratios are applied to React Native's own default rather than
    // skipped -- which used to leave small print the size of the print
    // around it.
    native: ['<Text>x<Text style={hozoStyles.hozo1}>1</Text>', 'no\u00A0break'],
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
    native: [
      '<Text accessibilityLabel="漢字">漢字<Text style={hozoStyles.hozo1}>かんじ</Text></Text>',
    ],
  },
  {
    name: 'preformatted text keeps its spaces',
    purpose: 'a code block is a block on both platforms, with the spacing as written',
    // `<pre>` keeps whitespace through the UA stylesheet. React Native's
    // `Text` keeps it anyway; what it lacks is the monospace face, which
    // is the style.
    source: '<Preformatted>a  b</Preformatted>',
    web: ['<pre>a  b</pre>'],
    native: ['<Text style={hozoStyles.hozo0}>a  b</Text>'],
  },
  {
    name: 'a named busy indicator',
    purpose: 'a spinner is announced by its name on both platforms, and draws on the Web',
    // There is no element for this, so the Web half is a runtime
    // component rather than a bare box with nothing to draw.
    source: '<ActivityIndicator accessibilityLabel="Loading" />',
    web: ['<HozoActivityIndicator accessibilityLabel={"Loading"}'],
    native: ['<ActivityIndicator accessibilityLabel={"Loading"}'],
  },
  {
    name: 'a meter reports where it stands',
    purpose: 'a value within a range is read as one, not as a progress bar or as nothing',
    // `<meter>` alone is read as a bare number by some readers, so the
    // Web carries the reading as words. React Native has no element, and
    // the value travels on the runtime component's `accessibilityValue`.
    source: '<Meter value={0.6} min={0} max={1} accessibilityLabel="Disk" />',
    web: ['<meter', "aria-valuetext={'60%'}", 'aria-label={"Disk"}', 'value={0.6}'],
    native: ['<HozoMeter accessibilityLabel={"Disk"} value={0.6} min={0} max={1}'],
  },
  {
    name: 'a skeleton is silent and stills under reduced motion',
    purpose: 'a placeholder is hidden from assistive technology, and its pulse is conditional',
    // Decision 007, section 5. On the Web the marker lets one stylesheet
    // rule stop the animation whatever class started it; on Native the
    // pulse is gated by the motion environment in the style itself.
    source: '<Skeleton className="h-4 animate-pulse" />',
    web: ['aria-hidden={true}', 'data-hozo-skeleton=""'],
    native: ['<Animated.View', '__hozoEnv_motion_safe && __hozoAnim_pulse', 'aria-hidden'],
  },
  {
    name: 'a counted badge',
    purpose: 'a number is read with what it counts, which a bare span cannot carry',
    source: '<Badge count={3} accessibilityLabel="3 unread">3</Badge>',
    web: ['<HozoBadge accessibilityLabel={"3 unread"} count={3}>'],
    native: ['<HozoBadge accessibilityLabel={"3 unread"} count={3}>'],
  },
  {
    name: 'an avatar and its parts',
    purpose: 'a picture named for the person, its part classes reaching each platform owner',
    // Like every pattern here, the compiler's share is the class lists:
    // class names on the Web and the pattern's style props on Native.
    source:
      '<Avatar src="https://example.com/a.png" name="Ada Lovelace" className="size-10" imageClassName="rounded-full" />',
    web: ['<HozoAvatar className="hozo-0" imageClassName="hozo-1"', 'name="Ada Lovelace"'],
    native: ['<HozoAvatar style={hozoStyles.hozo0} imageStyle={hozoStyles.hozo1}'],
  },
  {
    name: 'a selectable, removable chip',
    purpose: 'a state class reaches the element that has the state, on both platforms',
    // `disabled:` is asked of the chip's own control on the Web (#993) and
    // of the fact the pattern supplies on Native; neither reads a marker.
    source:
      '<Chip selected={on} onSelectedChange={setOn} onRemove={drop} removeLabel="Remove tag" className="rounded-full disabled:opacity-50" removeClassName="p-1">Tag</Chip>',
    web: ['<HozoChip className="hozo-0" removeClassName="hozo-1"', 'removeLabel="Remove tag"'],
    native: [
      '<HozoChip hozoStyle={({',
      '__hozoSlotDisabled && hozoStyles.hozo0_disabled',
      'removeStyle={hozoStyles.hozo1}',
    ],
  },
  {
    name: 'a named colour picker',
    purpose: 'the group name and the swatch classes reach the pattern on both platforms',
    source:
      '<ColorPicker value={color} onChange={setColor} accessibilityLabel="Accent" swatchClassName="size-6" />',
    web: ['<HozoColorPicker swatchClassName="hozo-1" accessibilityLabel={"Accent"}'],
    native: ['<HozoColorPicker accessibilityLabel={"Accent"} swatchStyle={hozoStyles.hozo1}'],
  },
  {
    name: 'a named command palette',
    purpose: 'the dialog name, its open state and the item classes reach the pattern',
    source:
      '<CommandPalette open={open} onOpenChange={setOpen} commands={commands} accessibilityLabel="Commands" itemClassName="px-2" />',
    web: ['<HozoCommandPalette itemClassName="hozo-1" accessibilityLabel={"Commands"} open={open}'],
    native: ['<HozoCommandPalette accessibilityLabel={"Commands"} open={open}', 'itemStyle='],
  },
  {
    name: 'a one-time code field',
    purpose: 'one named field, drawn as cells, on both platforms',
    source:
      '<OtpInput length={6} value={code} onChange={setCode} accessibilityLabel="Code" cellClassName="size-10" />',
    web: ['<HozoOtpInput cellClassName="hozo-1" accessibilityLabel={"Code"} length={6}'],
    native: ['<HozoOtpInput accessibilityLabel={"Code"} cellStyle={hozoStyles.hozo1}'],
  },
  {
    name: 'named pagination',
    purpose: 'a named navigation of pages, its current-page class applied by the pattern',
    // The current page is a state React Native has no selector for, so the
    // class is a prop the pattern applies rather than a selector.
    source:
      '<Pagination page={page} pageCount={10} onPageChange={setPage} accessibilityLabel="Results pages" currentItemClassName="font-bold" />',
    web: ['<HozoPagination currentItemClassName="hozo-1" accessibilityLabel={"Results pages"}'],
    native: [
      '<HozoPagination accessibilityLabel={"Results pages"} currentItemStyle={hozoStyles.hozo1}',
    ],
  },
  {
    name: 'a named stepper',
    purpose: 'a process is named, and the current step class reaches the pattern',
    source:
      '<Stepper steps={steps} activeStep={1} accessibilityLabel="Checkout" currentStepClassName="font-bold" />',
    web: ['<HozoStepper currentStepClassName="hozo-1" accessibilityLabel={"Checkout"}'],
    native: ['<HozoStepper accessibilityLabel={"Checkout"} currentStepStyle={hozoStyles.hozo1}'],
  },
  {
    name: 'a data table',
    purpose: 'caption, sections, header cells and data cells keep their table relationships',
    // The Web has the elements and the browser does the rest. Android has
    // no table to navigate, so on Native the sections, rows and cells are
    // runtime components that size columns together and read a data cell
    // with its column's header -- `head` marks the cell that names it.
    source:
      '<Table><TableCaption>Totals</TableCaption>' +
      '<TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>' +
      '<TableBody><TableRow><TableCell>Ada</TableCell></TableRow></TableBody>' +
      '<TableFooter><TableRow><TableCell>1</TableCell></TableRow></TableFooter></Table>',
    web: [
      '<table><caption>Totals</caption>',
      '<thead><tr><th scope="col">Name</th></tr></thead>',
      '<tbody><tr><td>Ada</td></tr></tbody>',
      '<tfoot>',
    ],
    native: [
      '<HozoTable><HozoTableCaption>Totals</HozoTableCaption>',
      '<HozoTableSection section="header"><HozoTableRow><HozoTableCell head>Name</HozoTableCell>',
      '<HozoTableSection section="body"><HozoTableRow><HozoTableCell>Ada</HozoTableCell>',
      '<HozoTableSection section="footer">',
    ],
  },
  {
    name: 'an opacity press target',
    purpose: 'the role, the name and the press survive, with the same activation as Pressable',
    // The feedback is a tiny runtime component on the Web; the tab stop
    // and keyboard activation come from the same call Pressable uses.
    source:
      '<TouchableOpacity onPress={go} accessibilityRole="button" accessibilityLabel="Go"><Text>Go</Text></TouchableOpacity>',
    web: ['<HozoTouchableOpacity role="button"', '{...hozoInteractive(go)}'],
    native: ['<TouchableOpacity role="button" accessibilityLabel={"Go"} onPress={go}>'],
  },
  {
    name: 'a press target without feedback',
    purpose: 'the role, the name and the press attach to the child, adding no layout box',
    source:
      '<TouchableWithoutFeedback onPress={go} accessibilityRole="button" accessibilityLabel="Go"><View><Text>Go</Text></View></TouchableWithoutFeedback>',
    web: ['<HozoTouchableWithoutFeedback role="button"', '{...hozoInteractive(go)}'],
    native: ['<TouchableWithoutFeedback role="button" accessibilityLabel={"Go"} onPress={go}>'],
  },
  {
    name: 'a modal and its system dismissal',
    purpose: 'the visibility and the back/escape dismissal reach the top-layer surface',
    // No name here, deliberately. React Native's Modal types accept View
    // props but forward none of them to the host, and the Web runtime
    // matches it, so an `accessibilityLabel` on a Modal is dropped on
    // both. A modal that needs a name is a `Dialog`, which has a contract
    // above that says so.
    source: '<Modal visible={open} onRequestClose={close}><Text>x</Text></Modal>',
    web: ['<HozoModal visible={open} onRequestClose={close}>'],
    native: ['<Modal visible={open} onRequestClose={close}>'],
  },
  {
    name: 'pull to refresh, spelled as React Native spells it',
    purpose: 'a nested refresh control reaches a scroll container that draws it on both',
    // The Web lowering used to keep a bare `div` here and hand it the
    // control as an unknown attribute: a pull did nothing and the
    // indicator never appeared. The runtime reads the nested element.
    source:
      '<ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={reload} />}><Text>a</Text></ScrollView>',
    web: [
      '<HozoScrollView',
      'refreshControl={<HozoRefreshControl refreshing={busy} onRefresh={reload}>',
    ],
    native: ['refreshControl={<RefreshControl refreshing={busy} onRefresh={reload}>'],
  },
  {
    name: 'an animated view',
    purpose: 'an Animated.View keeps the role and name a View would have',
    source: '<Animated.View role="img" accessibilityLabel="Box" />',
    web: ['<HozoAnimatedView className="hozo-view" role="img" accessibilityLabel={"Box"}>'],
    native: ['<Animated.View role="img" accessibilityLabel={"Box"}>'],
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
    for (const name of componentsIn(testCase.source)) named.add(name)
  }
  return named
}

/**
 * The primitives a source names, as the enum spells them. `Animated.View`
 * is one primitive, `AnimatedView`; `Svg.Rect` is a shape of `Svg`.
 */
export function componentsIn(source: string): Set<string> {
  const named = new Set<string>()
  for (const match of source.matchAll(/<([A-Z][A-Za-z]*)(?:\.([A-Z][A-Za-z]*))?/g))
    named.add(match[1] === 'Animated' ? `Animated${match[2]}` : (match[1] as string))
  return named
}

/**
 * The import a case compiles under: every component it names, from where
 * an application would take it. Derived, so a new case cannot pass by
 * leaning on a name some other case happened to import.
 */
function importsFor(source: string): string {
  const core = [...componentsIn(source)]
    .filter((name) => !name.startsWith('Animated') && name !== 'Svg')
    .sort()
  const lines = [`import { ${core.join(', ')} } from '@hozo/core'`]
  if (/<Animated\./.test(source)) lines.push("import { Animated } from 'react-native'")
  if (/<Svg\b/.test(source)) lines.push("import { Svg } from '@hozo/svg'")
  return `${lines.join('\n')}\n`
}

export function compareA11yContextual(testCase: A11yContextualCase): A11yContextualResult {
  const source = `${importsFor(testCase.source)}export function C() { return ${testCase.source} }\n`
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
