# hozo_parser

TSX analysis for the Hozo compiler, built on [oxc](https://oxc.rs). It reads components written against Hozo's primitives or React Native, resolves `className` to style properties, and builds the `hozo_ir` tree that the Web and Native backends lower.

Part of [Hozo](https://iray-tno.github.io/hozo/) ([source](https://github.com/iray-tno/hozo)), a Rust-powered universal UI compiler and accessibility-first layer for React Native.

## Stability

These crates are published so they can depend on one another from crates.io and so the compiler can be read and embedded. The supported way to use Hozo is the `@hozo/*` packages on npm. The Rust API has no stability guarantee beyond Cargo's `0.x` rules: any minor release may change it.

Crates and npm packages release together under one version.

## License

MIT
