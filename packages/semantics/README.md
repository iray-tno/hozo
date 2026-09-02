# @hozo/semantics

Universal landmarks, document sectioning, and semantic page structure primitives for Hozo.

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

## Features

- **Semantic HTML5 Web Output**: Lowers directly to `<main>`, `<header>`, `<footer>`, `<aside>`, `<search>`, `<section>`, `<article>`, `<nav>`, `<figure>`, `<figcaption>`, `<time>`, and `<address>`.
- **Accessible React Native Output**: Automatically adds canonical accessibility roles (`role="main"`, `role="banner"`, `role="contentinfo"`, `role="complementary"`, `role="search"`, `role="figure"`) to `<View>` or lowers to `<Text>` (`Figcaption`, `Time`).
- **Zero Runtime**: Direct compiler lowerings with working React component fallbacks when uncompiled.
