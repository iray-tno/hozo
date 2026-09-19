// The codegen numeric aliases, declared here rather than imported.
//
// React Native has them at `react-native/Libraries/Types/CodegenTypes`, and
// that path cannot be imported for types under this repo's `nodenext`
// resolution. Two reasons, either of which is enough: the package's `exports`
// map gives `./Libraries/*` a `"types": null` condition, so TypeScript is told
// there are no declarations there; and `CodegenTypes.d.ts` does not exist in
// the first place -- the directory ships `CodegenTypes.js` beside an unrelated
// `CodegenTypesNamespace.d.ts`.
//
// A separate file rather than a `type Double = number` in the spec itself, and
// that distinction is load-bearing. Codegen builds its type table from the
// declarations in the file it is parsing, and `translateTypeAnnotation`
// resolves aliases *before* it looks the name up. An alias declared beside the
// spec is therefore followed to `number` and emitted through
// `NumberTypeAnnotation`; imported from here it stays a reference named
// `Double` and reaches `emitDouble`, which is what the annotation was for.

/** A JavaScript number, and a `double` on the native side. */
export type Double = number
