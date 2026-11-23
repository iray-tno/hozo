//! The primitives Hozo lowers, and the SVG elements among them.

/// Phase 0 primitive set (proposal §13). Image/Link land in a later phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Primitive {
    /// The box everything else is built from: `<div>` on Web and
    /// `View` on React Native.
    ///
    /// A column flex container on both, which is React Native's
    /// default and not CSS's -- the Web side carries a base style that
    /// says so, and `is_view_box` names every primitive that shares it.
    View,
    /// A run of text: `<span>` on Web and `Text` on React Native.
    ///
    /// Not a box. It carries no flex base on either platform, so
    /// `display: flex` on one means what CSS says it means.
    Text,
    /// A block of prose: `<p>` on Web and `Text` on React Native.
    Paragraph,
    /// A document heading: `<h1>`...`<h6>` on Web and an accessible
    /// header `Text` on React Native.
    Heading,
    /// A thematic document region: `<section>` on Web and `View` on
    /// React Native, where there is no corresponding layout primitive.
    Section,
    /// A self-contained document composition: `<article>` on Web and a
    /// role-bearing `View` on React Native.
    Article,
    /// A navigation landmark: `<nav>` on Web and a role-bearing `View` on
    /// React Native.
    Nav,
    /// The primary content landmark: `<main>` on Web and `role="main"` `View` on React Native.
    Main,
    /// A landmark header/banner: `<header>` on Web and `role="banner"` `View` on React Native.
    Header,
    /// A landmark footer/contentinfo: `<footer>` on Web and `role="contentinfo"` `View` on React Native.
    Footer,
    /// A complementary region/sidebar: `<aside>` on Web and `role="complementary"` `View` on React Native.
    Aside,
    /// A search landmark container: `<search>` on Web and `role="search"` `View` on React Native.
    Search,
    /// A figure container: `<figure>` on Web and `role="figure"` `View` on React Native.
    Figure,
    /// A figure caption: `<figcaption>` on Web and `Text` on React Native.
    Figcaption,
    /// A machine-readable date/time representation: `<time>` on Web and `Text` on React Native.
    Time,
    /// Contact/address semantics: `<address>` on Web and `View` on React Native.
    Address,
    /// A form control grouping container: `<fieldset>` on Web and `role="group"` `View` on React Native.
    Fieldset,
    /// A caption/label for a fieldset: `<legend>` on Web and bold `Text` on React Native.
    Legend,
    /// A disclosure widget container: `<details>` on Web and collapsible `View` on React Native.
    Details,
    /// A disclosure summary/trigger: `<summary>` on Web and `Pressable` on React Native.
    Summary,
    /// A term-and-description list container: `<dl>` on Web and `role="list"` `View` on React Native.
    TermList,
    /// A term/name within a term list: `<dt>` on Web and bold `Text` on React Native.
    Term,
    /// A description/value within a term list: `<dd>` on Web and `View` on React Native.
    Description,
    /// A thematic break or divider: `<hr>` on Web and `role="separator"` `View` on React Native.
    Separator,
    /// A progress indicator bar: `<progress>` on Web and `role="progressbar"` `View` on React Native.
    Progress,
    /// A scalar within a known range -- a disk's fill, a password's strength:
    /// `<meter>` on Web and a `View` carrying `accessibilityValue` on React
    /// Native. Not `Progress`, which is how far a task has got.
    Meter,
    /// A short status label, and the one that is a number: `count` shows
    /// "3" and is read as its `accessibilityLabel` ("3 unread messages").
    /// `HozoBadge` on both platforms, because the Web half needs a second
    /// element -- a `<span>` cannot carry an accessible name.
    Badge,
    /// A compact token -- a filter that is on or off, an entry that can be
    /// removed, or both. `HozoChip` on both platforms, the pattern from
    /// `@hozo/patterns`; the compiler's part is its styling, which is two
    /// class lists, one for the chip and one for its remove button (#787).
    /// React Native has no class list to hand a component, so on Native both
    /// become style props, which `class_slots` names.
    Chip,
    /// A person's picture, or their initials when it is absent or fails to
    /// load, read as one image named for the person (#144). `HozoAvatar` on
    /// both platforms, the pattern from `@hozo/patterns`; like `Chip`, the
    /// compiler's part is its class lists -- the avatar's, and its picture's,
    /// initials' and status dot's, which are style props on Native.
    Avatar,
    /// Numbered pages with previous and next (#150): a named `<nav>` of
    /// buttons, or of links with `getPageHref`. `HozoPagination` on both
    /// platforms; the compiler's part is its class lists, including the
    /// ones for a state -- the current page, a disabled end -- which the
    /// pattern applies because React Native has no selector to.
    Pagination,
    /// Where a person is in a process of several steps (#150), each step's
    /// position and status said in words. `HozoStepper` on both platforms;
    /// like `Pagination`, its class lists include one per status, for the
    /// step and for its indicator, applied by the pattern.
    Stepper,
    /// A one-time code or a PIN (#149): one real input drawn as cells, so a
    /// reader finds one field and the operating system can fill it from a
    /// text message. `HozoOtpInput` on both platforms; its class lists are
    /// the box, every cell, and the active and filled cells, applied by the
    /// pattern.
    OtpInput,
    /// A searchable list of commands in a modal (#152): a dialog holding a
    /// combobox and a grouped listbox. `HozoCommandPalette` on both
    /// platforms; the compiler's part is its class lists -- the overlay,
    /// scrim, panel, field, list, headings, items, the active item and the
    /// shortcut badge -- which are style props on Native.
    CommandPalette,
    /// An editable field and filtered popup whose input, list and options
    /// keep independent class owners. Runtime behavior stays in the pattern.
    Combobox,
    /// A list whose options own focus and their committed selection state.
    Listbox,
    /// An action menu with a button trigger and focusable non-form items.
    Menu,
    /// A colour, from swatches, three sliders or its hex (#153): a radio
    /// group of swatches, hue/saturation/lightness as ordinary sliders
    /// rather than a two-dimensional square, each read in words.
    /// `HozoColorPicker` on both platforms; its class lists are the swatch,
    /// the selected swatch, the slider track and thumb, and the field.
    ColorPicker,
    /// A data table (#144): `<table>` on Web, and on React Native a
    /// `HozoTable` that sizes its columns from every cell in them, the way
    /// the browser's automatic table layout does, since a flex row knows
    /// nothing of the rows above it.
    Table,
    /// `<caption>`: the table's name.
    TableCaption,
    /// `<thead>`: the rows that head the columns. `HozoTableSection` on
    /// Native, where their header cells name the data cells below.
    TableHeader,
    /// `<tbody>`: the data rows. `HozoTableSection` on Native.
    TableBody,
    /// `<tfoot>`: totals and notes under the data. `HozoTableSection` on
    /// Native.
    TableFooter,
    /// `<tr>`; `HozoTableRow` on Native, which numbers its cells.
    TableRow,
    /// `<th>` -- `scope="col"` unless the author says otherwise -- and on
    /// Native a `HozoTableCell` that names the column for its data cells.
    TableHead,
    /// `<td>`; on Native a `HozoTableCell` that a reader hears with its
    /// column's header, since Android has no table to navigate.
    TableCell,
    /// A loading placeholder: a box with no meaning of its own, hidden from
    /// assistive technology, whose animation stops under reduced motion
    /// whatever classes put it there (decision 007, section 5). `<div>` on
    /// Web and `View` on React Native.
    Skeleton,
    /// A static semantic list: `<ul>`/`<ol>` on Web and a list-role
    /// `View` on React Native. Data-heavy lists remain `FlatList`.
    List,
    /// One static list entry: `<li>` on Web and a listitem-role `View` on
    /// React Native.
    ListItem,
    /// A busy indicator: `HozoActivityIndicator` on Web, which draws
    /// its own spinner, and React Native's `ActivityIndicator`.
    ///
    /// The Web half exists because there is no element for this and a
    /// project should not have to bring one.
    ActivityIndicator,
    /// A surface that responds to a press: `<div>` with the keyboard
    /// handlers a `<button>` gets for free on Web, and `Pressable` on
    /// React Native.
    ///
    /// Carries no role of its own, which is why writing one is the
    /// commonest thing `A11Y_INTERACTIVE_WITHOUT_ROLE` asks for.
    Pressable,
    /// React Native's opacity-feedback press target. Web lowering keeps the
    /// feedback in a tiny runtime component; Native keeps TouchableOpacity.
    TouchableOpacity,
    /// A press target that attaches behavior to its only child instead of
    /// introducing a layout box.
    TouchableWithoutFeedback,
    /// A control that submits an intent: `<button>` on Web and a
    /// `Pressable` carrying `accessibilityRole="button"` on React
    /// Native.
    ///
    /// Not React Native's own `Button`, which takes a `title` and
    /// renders no children -- see `INCOMPATIBLE_PRIMITIVES`.
    Button,
    /// A destination-bearing interaction: `<a>` on Web and Hozo's
    /// `Linking.openURL` wrapper on React Native.
    Link,
    /// A modal dialog (proposal §10.3, v1's first hard primitive).
    ///
    /// A primitive rather than a component the compiler walks past,
    /// because otherwise its `className` never compiles and its missing
    /// accessible name is never noticed -- both backends lower it to
    /// `/behaviors`'s `Dialog`, which owns the runtime behaviour.
    Dialog,
    /// A single-line text field. `<input>` on Web, `TextInput` on React
    /// Native -- and the reason `placeholder-*` can lower at all, since
    /// React Native carries that colour as a prop on this component
    /// rather than as a style on anything.
    TextInput,
    /// An image with a universal string `src`: `<img src>` on Web and
    /// React Native's `<Image source={{ uri }}>` on Native.
    Image,
    /// A viewport that scrolls vertically by default and horizontally when
    /// `horizontal` is set. Its content layout stays explicit in children.
    ScrollView,
    /// A data-driven list. Web keeps the lightweight core renderer while
    /// Native lowers to React Native's virtualized FlatList.
    FlatList,
    /// Pull-to-refresh intent nested in a ScrollView or FlatList.
    RefreshControl,
    /// React Native's top-layer presentation surface.
    Modal,
    /// React Native Animated's namespace View component.
    AnimatedView,
    /// An SVG element, by its own name: `Svg`, `Rect`, `Path`, `G`.
    ///
    /// One variant rather than fourteen because the lowering really is
    /// uniform -- Web writes the lowercase tag, React Native imports the
    /// capitalised component of the same name from `react-native-svg` --
    /// so a variant each would be fourteen identical match arms in every
    /// backend and one more place to forget an element.
    ///
    /// The name is the SVG one, and the JSX spelling is `<Svg.Rect>`: a
    /// namespace rather than a prefix, because `Text` is both an SVG
    /// element and a Hozo primitive and `SvgText` would be a name neither
    /// the specification nor `react-native-svg` uses.
    Svg(SvgElement),
    /// Bold/strong importance: `<strong>` on Web and `Text` with bold font weight on React Native.
    Strong,
    /// Stress emphasis: `<em>` on Web and `Text` with italic font style on React Native.
    Emphasis,
    /// Underlined text: `<u>` on Web and `Text` with underline text decoration on React Native.
    Underline,
    /// Strikethrough/deleted text: `<s>` on Web and `Text` with line-through on React Native.
    Strikethrough,
    /// Subscript: `<sub>` on Web and subscripted `Text` on React Native.
    Sub,
    /// Superscript: `<sup>` on Web and superscripted `Text` on React Native.
    Sup,
    /// Inline code literal: `<code>` on Web and monospace `Text` on React Native.
    Code,
    /// Preformatted text, a code block above all: `<pre>` on Web and monospace `Text` on React Native, which keeps spaces and line breaks as written.
    Preformatted,
    /// Side comments and small print: `<small>` on Web and small `Text` on React Native.
    Small,
    /// Highlighted/marked text: `<mark>` on Web and highlighted `Text` on React Native.
    Mark,
    /// Non-breaking inline container: `<span style="white-space: nowrap">` on Web and non-breaking space replacement on React Native.
    NoBreak,
    /// CJK ruby annotation container: `<ruby>` on Web and ruby layout with duplicate-speech suppression on React Native.
    Ruby,
    /// CJK ruby text annotation: `<rt>` on Web and furigana text on React Native.
    RubyText,
}

impl Primitive {
    /// React Native components that have no DOM element to become, and on
    /// the Web lower to a stand-in from `@hozo/rn-compat` instead.
    ///
    /// One definition, read by the parser to decide whether they may lower
    /// at all (`hozo_parser::ReactNativeCompat`) -- the Web backend's
    /// stand-in names are the other half of the same fact.
    pub fn is_react_native_compat(self) -> bool {
        matches!(
            self,
            Primitive::ActivityIndicator
                | Primitive::TouchableOpacity
                | Primitive::TouchableWithoutFeedback
                | Primitive::Modal
                | Primitive::AnimatedView
        )
    }

    /// Whether this primitive is one of React Native's boxes.
    ///
    /// Every one of these lowers to a React Native `View`, so every one is
    /// a column flex container on device -- and the Web backend gives them
    /// the same base so they are one in a browser too. Here rather than in
    /// either backend because it is a fact about the primitive: the Web
    /// side needs it to pick a class and the parser needs it to say
    /// anything about `flex`, and two lists would be one rule with two
    /// answers.
    ///
    /// `Separator` and `Progress` are deliberately absent. They are `View`s
    /// on Native only because React Native has no `<hr>` and no
    /// `<progress>`; on the Web they are a void element and a replaced
    /// element, and `display: flex` on either is meaningless at best.
    pub fn is_view_box(self) -> bool {
        matches!(
            self,
            Primitive::View
                | Primitive::AnimatedView
                | Primitive::Skeleton
                | Primitive::Section
                | Primitive::Article
                | Primitive::Nav
                | Primitive::Main
                | Primitive::Header
                | Primitive::Footer
                | Primitive::Aside
                | Primitive::Search
                | Primitive::Figure
                | Primitive::Address
                | Primitive::Fieldset
                | Primitive::TermList
                | Primitive::Description
                | Primitive::List
                | Primitive::ListItem
        )
    }
}

/// The SVG elements Hozo lowers.
///
/// Chosen for what a chart needs to exist -- shapes, grouping, gradients,
/// clipping, text -- rather than for coverage of the specification. Filters
/// are a separate surface: only a subset has a Native implementation in
/// `react-native-svg`, and an element name does not guarantee prop parity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SvgElement {
    /// The root. Also the namespace object, so `<Svg>` and `<Svg.Rect>`
    /// come from one import.
    Root,
    /// A destination-bearing group: a real SVG anchor on Web and a
    /// router-aware pressable group on React Native.
    Link,
    G,
    Rect,
    Circle,
    Ellipse,
    Line,
    Path,
    Polygon,
    Polyline,
    Text,
    Defs,
    LinearGradient,
    RadialGradient,
    Stop,
    ClipPath,
    Use,
    /// A run inside a `Text`, which is how a label gets a second line.
    /// SVG has no wrapping of its own, so this is the wrapping.
    TSpan,
    /// Text along a path.
    TextPath,
    /// A shape drawn at the vertices of another, which is what a data
    /// point and an arrowhead are.
    Marker,
    /// A mask, which is the alpha counterpart of `ClipPath`.
    Mask,
    /// A tile, which is how a series survives being printed in grey.
    Pattern,
    /// A definition instantiated by `Use`, unlike `Defs` which only holds.
    Symbol,
    /// A raster image. `Svg.Image` rather than `Image`: Hozo has a
    /// primitive of that name, and the namespace is what keeps the two
    /// from arguing.
    Image,
    /// A hole for host markup inside a drawing. Web renders anything;
    /// `react-native-svg` documents its own limits, which is why this is
    /// carried rather than described.
    ForeignObject,
    /// Shared filter subset; element support does not imply prop parity.
    Filter,
    FeColorMatrix,
    FeGaussianBlur,
    FeBlend,
    FeComposite,
    FeDropShadow,
    FeFlood,
    FeMerge,
    FeMergeNode,
    FeOffset,
}

impl SvgElement {
    /// The name under `Svg.` in JSX, which is also `react-native-svg`'s
    /// export and the capitalised form of the SVG tag.
    pub fn name(self) -> &'static str {
        match self {
            SvgElement::Root => "Svg",
            SvgElement::Link => "Link",
            SvgElement::G => "G",
            SvgElement::Rect => "Rect",
            SvgElement::Circle => "Circle",
            SvgElement::Ellipse => "Ellipse",
            SvgElement::Line => "Line",
            SvgElement::Path => "Path",
            SvgElement::Polygon => "Polygon",
            SvgElement::Polyline => "Polyline",
            SvgElement::Text => "Text",
            SvgElement::Defs => "Defs",
            SvgElement::LinearGradient => "LinearGradient",
            SvgElement::RadialGradient => "RadialGradient",
            SvgElement::Stop => "Stop",
            SvgElement::ClipPath => "ClipPath",
            SvgElement::Use => "Use",
            SvgElement::TSpan => "TSpan",
            SvgElement::TextPath => "TextPath",
            SvgElement::Marker => "Marker",
            SvgElement::Mask => "Mask",
            SvgElement::Pattern => "Pattern",
            SvgElement::Symbol => "Symbol",
            SvgElement::Image => "Image",
            SvgElement::ForeignObject => "ForeignObject",
            SvgElement::Filter => "Filter",
            SvgElement::FeColorMatrix => "FeColorMatrix",
            SvgElement::FeGaussianBlur => "FeGaussianBlur",
            SvgElement::FeBlend => "FeBlend",
            SvgElement::FeComposite => "FeComposite",
            SvgElement::FeDropShadow => "FeDropShadow",
            SvgElement::FeFlood => "FeFlood",
            SvgElement::FeMerge => "FeMerge",
            SvgElement::FeMergeNode => "FeMergeNode",
            SvgElement::FeOffset => "FeOffset",
        }
    }

    /// The name the emitted React Native code uses.
    ///
    /// The same as `name()` except for text. Generated files already
    /// import `Text` from `react-native` -- the compiler inserts one
    /// around any bare string, because a raw string outside a `Text` is a
    /// crash on that platform -- so an SVG `Text` imported beside it would
    /// be two bindings of one name in a file neither of them wrote.
    /// `@hozo/engine` re-exports it under this name for the same reason.
    pub fn runtime_name(self) -> &'static str {
        match self {
            SvgElement::Link => "SvgLink",
            // Three collide with a name the generated file already has.
            // `Text` is React Native's own; `Image` is Hozo's primitive,
            // which the compiler emits around a bare `<Image>`; `Symbol`
            // is a JavaScript global. Two bindings of one name in a file
            // neither of them wrote is not a collision anyone could be
            // expected to debug.
            SvgElement::Text => "SvgText",
            SvgElement::Image => "SvgImage",
            SvgElement::Symbol => "SvgSymbol",
            other => other.name(),
        }
    }

    /// The DOM tag. Not `name().to_lowercase()`: three of these are
    /// camelCase in SVG and lowercasing them produces elements that parse
    /// and never render.
    pub fn tag(self) -> &'static str {
        match self {
            SvgElement::Root => "svg",
            SvgElement::Link => "a",
            SvgElement::LinearGradient => "linearGradient",
            SvgElement::RadialGradient => "radialGradient",
            SvgElement::ClipPath => "clipPath",
            SvgElement::TextPath => "textPath",
            SvgElement::ForeignObject => "foreignObject",
            SvgElement::Filter => "filter",
            SvgElement::FeColorMatrix => "feColorMatrix",
            SvgElement::FeGaussianBlur => "feGaussianBlur",
            SvgElement::FeBlend => "feBlend",
            SvgElement::FeComposite => "feComposite",
            SvgElement::FeDropShadow => "feDropShadow",
            SvgElement::FeFlood => "feFlood",
            SvgElement::FeMerge => "feMerge",
            SvgElement::FeMergeNode => "feMergeNode",
            SvgElement::FeOffset => "feOffset",
            other => match other {
                SvgElement::G => "g",
                SvgElement::Rect => "rect",
                SvgElement::Circle => "circle",
                SvgElement::Ellipse => "ellipse",
                SvgElement::Line => "line",
                SvgElement::Path => "path",
                SvgElement::Polygon => "polygon",
                SvgElement::Polyline => "polyline",
                SvgElement::Text => "text",
                SvgElement::Defs => "defs",
                SvgElement::Stop => "stop",
                SvgElement::Use => "use",
                SvgElement::TSpan => "tspan",
                SvgElement::Marker => "marker",
                SvgElement::Mask => "mask",
                SvgElement::Pattern => "pattern",
                SvgElement::Symbol => "symbol",
                SvgElement::Image => "image",
                _ => unreachable!("handled above"),
            },
        }
    }

    /// Reads the name after `Svg.`, or the bare `Svg` root.
    pub fn from_name(name: &str) -> Option<SvgElement> {
        Some(match name {
            "Svg" => SvgElement::Root,
            "Link" => SvgElement::Link,
            "G" => SvgElement::G,
            "Rect" => SvgElement::Rect,
            "Circle" => SvgElement::Circle,
            "Ellipse" => SvgElement::Ellipse,
            "Line" => SvgElement::Line,
            "Path" => SvgElement::Path,
            "Polygon" => SvgElement::Polygon,
            "Polyline" => SvgElement::Polyline,
            "Text" => SvgElement::Text,
            "Defs" => SvgElement::Defs,
            "LinearGradient" => SvgElement::LinearGradient,
            "RadialGradient" => SvgElement::RadialGradient,
            "Stop" => SvgElement::Stop,
            "ClipPath" => SvgElement::ClipPath,
            "Use" => SvgElement::Use,
            "TSpan" => SvgElement::TSpan,
            "TextPath" => SvgElement::TextPath,
            "Marker" => SvgElement::Marker,
            "Mask" => SvgElement::Mask,
            "Pattern" => SvgElement::Pattern,
            "Symbol" => SvgElement::Symbol,
            "Image" => SvgElement::Image,
            "ForeignObject" => SvgElement::ForeignObject,
            "Filter" => SvgElement::Filter,
            "FeColorMatrix" => SvgElement::FeColorMatrix,
            "FeGaussianBlur" => SvgElement::FeGaussianBlur,
            "FeBlend" => SvgElement::FeBlend,
            "FeComposite" => SvgElement::FeComposite,
            "FeDropShadow" => SvgElement::FeDropShadow,
            "FeFlood" => SvgElement::FeFlood,
            "FeMerge" => SvgElement::FeMerge,
            "FeMergeNode" => SvgElement::FeMergeNode,
            "FeOffset" => SvgElement::FeOffset,
            _ => return None,
        })
    }
}

#[cfg(test)]
mod svg_element_tests {
    use super::SvgElement;

    #[test]
    fn every_name_round_trips() {
        // The three lists -- the enum, `from_name`, `name` -- are written
        // by hand and can drift apart silently: a member missing from
        // `from_name` is an element the parser never recognises, and
        // `<Svg.Marker>` would be carried as a foreign component with no
        // error anywhere.
        for &element in ALL {
            assert_eq!(
                SvgElement::from_name(element.name()),
                Some(element),
                "{:?}",
                element
            );
        }
    }

    #[test]
    fn the_camel_case_tags_keep_their_capitals() {
        // Lowercasing these produces elements that parse and never render,
        // which is the quietest way an SVG can be wrong.
        assert_eq!(SvgElement::LinearGradient.tag(), "linearGradient");
        assert_eq!(SvgElement::RadialGradient.tag(), "radialGradient");
        assert_eq!(SvgElement::ClipPath.tag(), "clipPath");
        assert_eq!(SvgElement::TextPath.tag(), "textPath");
        assert_eq!(SvgElement::ForeignObject.tag(), "foreignObject");
        assert_eq!(SvgElement::FeColorMatrix.tag(), "feColorMatrix");
        assert_eq!(SvgElement::FeGaussianBlur.tag(), "feGaussianBlur");
        assert_eq!(SvgElement::FeBlend.tag(), "feBlend");
        assert_eq!(SvgElement::FeComposite.tag(), "feComposite");
        assert_eq!(SvgElement::FeDropShadow.tag(), "feDropShadow");
        assert_eq!(SvgElement::FeFlood.tag(), "feFlood");
        assert_eq!(SvgElement::FeMerge.tag(), "feMerge");
        assert_eq!(SvgElement::FeMergeNode.tag(), "feMergeNode");
        assert_eq!(SvgElement::FeOffset.tag(), "feOffset");
    }

    #[test]
    fn a_tag_is_lowercase_unless_svg_says_otherwise() {
        for &element in ALL {
            let tag = element.tag();
            let camel = tag.chars().any(|c| c.is_ascii_uppercase());
            assert_eq!(
                camel,
                matches!(
                    element,
                    SvgElement::LinearGradient
                        | SvgElement::RadialGradient
                        | SvgElement::ClipPath
                        | SvgElement::TextPath
                        | SvgElement::ForeignObject
                        | SvgElement::FeColorMatrix
                        | SvgElement::FeGaussianBlur
                        | SvgElement::FeBlend
                        | SvgElement::FeComposite
                        | SvgElement::FeDropShadow
                        | SvgElement::FeFlood
                        | SvgElement::FeMerge
                        | SvgElement::FeMergeNode
                        | SvgElement::FeOffset
                ),
                "{:?} has tag {tag}",
                element,
            );
        }
    }

    #[test]
    fn the_names_that_would_collide_are_renamed_for_native() {
        // Each collides with something already in a generated file:
        // `Text` is React Native's, `Image` is Hozo's own primitive, and
        // `Symbol` is a JavaScript global.
        assert_eq!(SvgElement::Text.runtime_name(), "SvgText");
        assert_eq!(SvgElement::Image.runtime_name(), "SvgImage");
        assert_eq!(SvgElement::Symbol.runtime_name(), "SvgSymbol");
        assert_eq!(SvgElement::Rect.runtime_name(), "Rect");
    }

    // A slice rather than a sized array: a hand-written count is the same
    // drift these tests exist to catch, one level down.
    const ALL: &[SvgElement] = &[
        SvgElement::Root,
        SvgElement::Link,
        SvgElement::G,
        SvgElement::Rect,
        SvgElement::Circle,
        SvgElement::Ellipse,
        SvgElement::Line,
        SvgElement::Path,
        SvgElement::Polygon,
        SvgElement::Polyline,
        SvgElement::Text,
        SvgElement::Defs,
        SvgElement::LinearGradient,
        SvgElement::RadialGradient,
        SvgElement::Stop,
        SvgElement::ClipPath,
        SvgElement::Use,
        SvgElement::TSpan,
        SvgElement::TextPath,
        SvgElement::Marker,
        SvgElement::Mask,
        SvgElement::Pattern,
        SvgElement::Symbol,
        SvgElement::Image,
        SvgElement::ForeignObject,
        SvgElement::Filter,
        SvgElement::FeColorMatrix,
        SvgElement::FeGaussianBlur,
        SvgElement::FeBlend,
        SvgElement::FeComposite,
        SvgElement::FeDropShadow,
        SvgElement::FeFlood,
        SvgElement::FeMerge,
        SvgElement::FeMergeNode,
        SvgElement::FeOffset,
    ];
}
