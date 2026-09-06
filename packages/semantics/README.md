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

## Features

- **Semantic HTML5 Web Output**: Direct compiler lowering to real HTML5 landmark and semantic elements, completely free of `react-native-web`.
- **Accessible React Native Output**: Automatically injects canonical accessibility roles (`role="main"`, `role="banner"`, `role="contentinfo"`, `role="complementary"`, `role="search"`, `role="figure"`) and maps captions to accessible `<Text>`.
- **Zero Runtime**: Direct compiler lowerings with working React component fallbacks when uncompiled.
