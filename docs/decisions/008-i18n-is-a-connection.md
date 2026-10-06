# 8. Hozo connects to an i18n library rather than being one, and the connection is a behaviour

**Status:** decided
**Date:** 2026-10-06

## What #157 asked for, and what already exists

#157 named four pillars: logical properties and bidirectional layout, an
`<I18nProvider>`, localisation of Hozo's own components, and CJK line breaking.

The first is mostly done. `ms-*`, `pe-*`, `start-*`, `rounded-s-*` and the
`rtl:`/`ltr:` variants compile on both platforms. Two utilities do not reach
Native yet: `border-s-*`, which React Native has as `borderStartWidth`, and
`text-start`. They are tracked with this decision but do not depend on it.

The other three have not started. Hozo's components each carry their own
English strings as prop defaults, roughly fifteen of them: `Calendar`'s
"Previous month" and "start of range", the pickers' dialog names, `TimePicker`'s
field names, `NativeSelect`'s "Cancel", `TextArea`'s "12 of 200 characters left",
and `BottomSheet`'s "Resize". The date components also take a `locale` prop of
their own. An application in another language has to pass every one of these,
on every instance.

## Decision

### 1. Hozo does not translate; it asks

Applications already have a translation library (i18next, react-intl, Lingui),
with plural rules, interpolation, lazy catalogues and tooling. Hozo building a
second one would duplicate that, and it would make Hozo's strings the only
ones in the app that are not in the project's catalogue.

So Hozo defines a small connection, and nothing behind it:

```ts
interface HozoI18n {
  locale?: string               // BCP 47, for Intl: dates, numbers, week start
  dir?: 'ltr' | 'rtl'           // read by behaviours that mirror, never applied
  translate?: (key: HozoMessageKey, params: Record<string, string | number>, fallback: string) => string
}
```

`<HozoI18nProvider value={…}>` puts it in context, and `useHozoI18n()` reads it.

### 2. Adapters, not dependencies

Each adapter is a few lines and typed structurally, so `@hozo/*` gains no
dependency on any library:

- `fromI18next(i18n)` calls `i18n.t(key, { ...params, defaultValue: fallback })` and takes `locale` from `i18n.language`.
- `fromReactIntl(intl)` calls `intl.formatMessage({ id: key, defaultMessage: fallback }, params)` and takes `locale` from `intl.locale`.

A project on anything else writes its own `translate` in the same three lines.

### 3. How a string is decided

From most to least specific:

1. **The component's own prop** (`previousMonthLabel="…"`). Unchanged, so no
   existing code moves.
2. **The provider's `translate(key, params, fallback)`.**
3. **Hozo's English default**, which is also the `fallback` passed to step 2.

Keys are dotted and namespaced by component: `hozo.calendar.previousMonth`,
`hozo.textArea.remaining`. Parameters are named (`{remaining}`, `{maxLength}`)
rather than positional, because every library listed interpolates by name.
The English defaults are exported as one object, `hozoMessages`, so a project
can seed its catalogue from it and a test can check that none is missing.

`locale` follows the same order: the component's prop, then the provider's,
then the runtime's default.

### 4. Direction is read, not applied

`dir` is the document's on the Web (`<html dir>`) and `I18nManager`'s on
Native. Both are the application's to set: Native's needs a restart, and a
provider rewriting either would fight the platform. The provider only tells
behaviours which way the content runs when they cannot ask the platform.
`RovingFocus` already mirrors the horizontal arrows from the document's
direction, and that stays the source on the Web.

### 5. It lives in `@hozo/behaviors`, and that changes what behaviors is

Everything that shows a string already depends on `@hozo/behaviors`:
`@hozo/patterns`, `@hozo/form` and `@hozo/semantics`, and `@hozo/primitives`
through it. Behaviors depends on nothing. A separate package would add a
dependency to each consumer and one more package to publish. Putting the
provider in behaviors adds neither.

It also matches what behaviors already holds. `RovingFocus` reads text
direction, `LiveRegion` decides what is announced, and the ruby control decides
how a word is read. Those are about how content reaches a person, not only about
interaction mechanics.

So behaviors is now described as the layer where **accessibility and
internationalisation are first-class behaviours**. These are the two concerns
that should be designed in from the start and are usually added at the end.
Defining them as behaviours, below every component, is how Hozo makes "from the
start" the default. The package description and README say this.

## Rejected

- **A built-in translation system** (message catalogues, plural rules,
  loading). That is 1: it would be a second system beside the app's.
- **Depending on i18next** (or any one library). It would make every Hozo user
  install it, and it would leave out projects on react-intl or Lingui.
- **A separate `@hozo/i18n` package.** It is cleaner on paper, but it adds a
  dependency to every consumer and a package to publish. A publish also needs a
  bootstrap and a Trusted Publisher, which 0.2.0 showed are not free.
- **The provider setting `dir`.** That is 4.

## Order of work

1. This decision, and behaviors' description.
2. `HozoI18nProvider`, `useHozoI18n`, `hozoMessages` and the two adapters in
   `@hozo/behaviors`, re-exported by `@hozo/core`. Then the existing strings and
   `locale` props read through them. No component API changes.
3. CJK line breaking (#157's fourth pillar) is separate: it is a compiler and
   styling question (`line-break`, `word-break: auto-phrase`), not a provider one.

## When to revisit

- A string Hozo needs that is not a fixed sentence: a list, or a plural that
  depends on more than one number. That case may need the adapter to carry more
  than `translate`.
- React Native gaining a per-subtree direction. The provider would then have
  something to apply.
