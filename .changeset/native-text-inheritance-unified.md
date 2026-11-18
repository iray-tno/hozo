---
"@hozo/metro": minor
"@hozo/compiler": minor
"@hozo/primitives": minor
---

On Native, text classes on a container now reach a `Text` the compiler cannot see: one rendered by a component from another file, passed in as `children`, or returned by an expression. `<View className="text-red-500 text-lg"><Label /></View>` colours and sizes `Label`'s text, as it does on the Web. Before, React Native's `Text` inherited only from an enclosing `Text`, so the classes stopped at the component boundary and nothing reported it.

Where the compiler can see the `Text`, nothing changes: the classes are still copied onto it. Only what it cannot see is read at run time. An outermost `Text` that does not set all of colour, size, weight, line height, letter spacing, alignment and transform reads the rest from the nearest container. A container whose children include one it cannot see wraps them in a scope that renders no host. See [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md).

To keep the previous behaviour, pass `nativeTextInheritance: 'compiled'` to `withHozo`.
