---
title: "Text styles reach the text"
description: "How a container's text classes reach a Text on React Native, which only inherits from another Text."
sidebar:
  order: 4
---

On the Web, a container's `text-*`, `font-*`, `leading-*` and `tracking-*` classes reach every piece of text inside it, whatever component renders that text. React Native's `Text` inherits only from an enclosing `Text`, never from a `View`. Hozo closes that gap, so this behaves the same on both platforms:

```tsx
// Card.tsx
<View className="text-red-500 text-lg">
  <Text>Shown in red, at 18px</Text>
  <Label />           {/* from another file: also red, also 18px */}
  {children}          {/* whatever the caller passes: also red */}
</View>
```

## What Hozo does

**Where the compiler can see the `Text`, it copies the container's classes onto it.** The first `Text` above gets them in its own `StyleSheet` entry, and nothing runs on the device.

**Where it cannot see the `Text`, it reads the values at run time.** A component from another file, `children`, and an expression are all out of its sight.

- **A container whose children include one the compiler cannot see** wraps them in a scope that renders no host. The container keeps its own `View`.
- **The outermost `Text` of a component** reads whatever it does not set itself from the nearest scope above it. Its own classes always win.
- **A `Text` nested in another `Text` is left plain**, because React Native already passes styles down there.

## What is carried

Seven properties, the ones React Native's `Text` inherits:

- colour;
- font size;
- weight;
- line height;
- letter spacing;
- alignment;
- text transform.

A few things stay where they are written, and keep the build warning that says so:

- a value under a condition, such as `dark:` or `hover:`;
- an animation;
- a relative size (`em`);
- a font family.

To apply one of those, put the class on the `Text` itself.

## Where there is no scope

Some components read their own children: a table section measures its rows, and a `ScrollView` counts its children for sticky headers. A scope between them and their children would hide the children, so a text class on one of these does not reach an unseen `Text`, and the build warns.

Pressables are different: they hand their text classes to their label themselves. That includes their `active:` and `disabled:` states.

## Cost and opting out

A `Text` that reads costs about 0.25 µs per render. The runtime adds about 10 KB to a development bundle. To keep only the copying, which is what earlier releases did:

```js
// metro.config.js
module.exports = withHozo(config, { nativeTextInheritance: 'compiled' })
```

With it, text classes on a container stop at anything the compiler cannot see. The Web is unaffected either way: CSS already does this.

The rule and its measurements are in [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md).
