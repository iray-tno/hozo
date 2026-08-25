// The Web side of `@hozo/runtime/svg`, which has nothing to re-export.
//
// SVG on Web is intrinsic elements, so the compiler emits `<rect>`
// directly and never imports anything. The file exists so the subpath
// resolves on both platforms rather than being a Native-only entry that
// breaks a bundler configured for one resolution.
export {}
