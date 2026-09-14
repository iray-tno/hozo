# hozo_ir

The intermediate representation shared by the Hozo compiler: primitives, style properties, accessibility semantics and diagnostics, with nothing specific to any one platform. `hozo_parser` builds it from TSX; `hozo_web` and `hozo_native` lower it.

Part of [Hozo](https://github.com/iray-tno/hozo), a Rust-powered universal UI compiler and accessibility-first layer for React Native.

## Stability

These crates are published so they can depend on one another from crates.io and so the compiler can be read and embedded. The supported way to use Hozo is the `@hozo/*` packages on npm. The Rust API has no stability guarantee beyond Cargo's `0.x` rules: any minor release may change it.

Crates and npm packages release together under one version.

## License

MIT
