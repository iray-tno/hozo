---
"@hozo/compiler": patch
"@hozo/primitives": patch
"@hozo/core": patch
---

A `TextInput` whose props reach it through a spread (`function F(props) { return <TextInput {...props} /> }`) works on the Web. The spread reached the `<input>` or `<textarea>` raw, so `onChangeText` was never called and a controlled `@hozo/ui` `Input` could not be typed into. The spread now goes through the same translation as the uncompiled `TextInput`: `onChangeText`, `onSubmitEditing`, `editable`, `keyboardType`, `secureTextEntry`, `returnKeyType`, `autoCorrect`, the `accessibility*` props, `testID` and `nativeID`. A named `onChangeText` that is `undefined` no longer throws when the field is typed into.
