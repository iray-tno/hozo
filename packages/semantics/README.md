# @hozo/semantics

Universal landmarks, document sectioning, forms, disclosures, and semantic page structure primitives for Hozo.

```tsx
import {
  Main,
  Header,
  Footer,
  Aside,
  Search,
  Section,
  Article,
  Nav,
  Figure,
  Figcaption,
  Time,
  Address,
  Fieldset,
  Legend,
  Details,
  Summary,
  TermList,
  Separator,
  Progress,
} from '@hozo/semantics'

export function Layout({ children }) {
  return (
    <>
      <Header>
        <Nav accessibilityLabel="Main Navigation" />
      </Header>
      <Main>
        <Article>
          <Time dateTime="2026-09-02">September 2, 2026</Time>
          <Figure>
            <Figcaption>Documentation overview</Figcaption>
          </Figure>
          {children}
        </Article>
        <Aside>
          <Search />
        </Aside>
      </Main>
      <Footer>
        <Address>support@hozo.dev</Address>
      </Footer>
    </>
  )
}
```

## Component Catalog

### 1. Landmarks & Sectioning
- **`Main`**: The primary content landmark. Web lowers to `<main>`; Native lowers to `<View role="main">`.
- **`Header`**: Page or section header. Web lowers to `<header>`; Native lowers to `<View role="banner">`.
- **`Footer`**: Page or section footer. Web lowers to `<footer>`; Native lowers to `<View role="contentinfo">`.
- **`Aside`**: Complementary content / sidebar. Web lowers to `<aside>`; Native lowers to `<View role="complementary">`.
- **`Search`**: Search landmark container. Web lowers to `<search>`; Native lowers to `<View role="search">`.
- **`Nav`**: Navigation landmark. Web lowers to `<nav>`; Native lowers to `<View role="navigation">`.
- **`Section`**: Thematic section of a document. Web lowers to `<section>`; Native lowers to `<View>`.
- **`Article`**: Self-contained composition. Web lowers to `<article>`; Native lowers to `<View role="article">`.

### 2. Informational & Figures
- **`Figure` / `Figcaption`**: Annotated figure and caption. Web lowers to `<figure>` and `<figcaption>`; Native lowers to `<View role="figure">` and `<Text>`.
- **`Time`**: Machine-readable time (`dateTime`). Web lowers to `<time dateTime="...">`; Native lowers to `<Text>`.
- **`Address`**: Contact information container. Web lowers to `<address>`; Native lowers to `<View>`.

### 3. Forms & Grouping
- **`Fieldset` / `Legend`**: Grouping form controls with a caption. Web lowers to `<fieldset>` and `<legend>`; Native lowers to `<View role="group">` and `<Text>`.

### 4. Disclosures
- **`Details` / `Summary`**: Native HTML disclosure element. Web lowers to `<details>` and `<summary>`; Native maps to an accessible disclosure container.

### 5. Description Lists
- **`TermList` / `Term` / `Description`**: Definition lists (`<dl>`, `<dt>`, `<dd>`). Accessible via `TermList.Term` and `TermList.Description` or standalone imports.

### 6. Separators & Progress
- **`Separator`**: Content divider. Supports `orientation="horizontal" | "vertical"` and `decorative`. Web lowers to `<hr>`; Native lowers to an accessible separator view with `accessibilityRole="separator"`.
- **`Progress`**: Completion indicator (`value`, `max`). Web lowers to `<progress>`; Native lowers to an accessible bar with `accessibilityRole="progressbar"`.

### 7. Data display
- **`Meter`**: An amount within a known range. Web lowers to `<meter>`. Native draws a track and a fill coloured by `low`/`high`/`optimum`, and is read as a percentage ("Disk usage, 60%").
- **`Badge`**: A short status label. With `count` it draws the number and is read as its `accessibilityLabel` ("3 unread messages").
- **`Skeleton`**: A loading placeholder, hidden from assistive technology. Its animation stops under reduced motion, its descendants' included.
- **`Table`** with `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead` and `TableCell`. Web lowers to the table elements. On Native, each column is as wide as its widest cell, and a data cell is read with its column ("Price, $12").

## Verification Matrix: data display

| | axe (every PR) | Virtual reader (every PR) | NVDA (weekly) | VoiceOver, macOS (weekly) | TalkBack | iOS VoiceOver |
|---|---|---|---|---|---|---|
| `Meter` | ✅ | ✅ approved | ✅ approved | ✅ approved | ✅ census walk | ⬜ |
| `Badge` (`count`) | ✅ | ✅ approved | ✅ approved | ✅ approved | ✅ census walk | ⬜ |
| `Skeleton` | ✅ | ✅ approved (silent) | ✅ approved | ✅ approved | ✅ census walk (silent) | ⬜ |
| `Table` | ✅ | ✅ approved | ✅ approved | ✅ approved | ✅ census walk | ⬜ |

- **axe and the virtual reader** run on the `Semantics/Data Display` story. NVDA and VoiceOver walk the same story, which is named in `examples/screen-readers/stories.spec.ts`.
- **Their first reading** (run 37790021610):
  - Both read the table with its caption, and each cell with its row, column and header ("row 2, Item, column 1, Tea" / "Price $8 column 3 of 3").
  - Both read the badge as "3 unread messages". The skeleton was silent.
  - **The meter was read as the fraction:** NVDA said "Disk usage, progress bar, 0.6" and VoiceOver said "0.6, suboptimal value Disk usage level indicator".
  - #802 gives the Web `<meter>` an `aria-valuetext` of its percentage, as Native already had.
- **The reading after that fix** (run 37796061776) is the approved one. NVDA says "Disk usage, progress bar, 60 percent" and VoiceOver "60% Disk usage level indicator". NVDA calling a meter a progress bar is NVDA's mapping and is not something Hozo can change.
- **TalkBack: the census walk** (`examples/native-demo/CensusWalk.tsx`, #789) has read three of them on an emulator:
  - the meter as "Disk usage, 60%";
  - the badge as "3 unread messages";
  - the skeleton as nothing.

  Those readings are reported by the job, not yet asserted.
- **The virtual reader's "max value 100" for a `<meter>` with no `max` is the virtual reader's mapping.** Neither real reader mentioned a maximum.
- **On Native, `Table` on an Android emulator** (the census walk, #804):
  - **Layout:** every column's cells landed at the same x and width, measured with `measureInWindow` on the device's own layout engine, not the stub the unit tests use.
  - **Speech:** TalkBack read the data cell as "Price, $12".
  - **Not announced:** row and column numbers. Android sets a table's `CollectionInfo` only inside a ScrollView, through the cast #525 is waiting on.
  - Header cells were first read as "Price, Heading", which put every column header into heading navigation. They no longer carry a heading role.

A ✅ in the reader columns means a person read the phrases and approved them, never only that a job ran.

## Features

- **Semantic HTML5 Web Output**: Direct compiler lowering to real HTML5 landmark and semantic elements, completely free of `react-native-web`.
- **Accessible React Native Output**: Automatically injects canonical accessibility roles (`role="main"`, `role="banner"`, `role="contentinfo"`, `role="complementary"`, `role="search"`, `role="figure"`) and maps captions to accessible `<Text>`.
- **Zero Runtime**: Direct compiler lowerings with working React component fallbacks when uncompiled.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
