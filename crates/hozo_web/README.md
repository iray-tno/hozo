# hozo_web

The Web backend of the Hozo compiler. It lowers `hozo_ir` to semantic HTML, CSS and ARIA, so a static path needs no React Native Web and no runtime styling.

Part of [Hozo](https://iray-tno.github.io/hozo/) ([source](https://github.com/iray-tno/hozo)), a Rust-powered universal UI compiler and accessibility-first layer for React Native.

## Stability

These crates are published so they can depend on one another from crates.io and so the compiler can be read and embedded. The supported way to use Hozo is the `@hozo/*` packages on npm. The Rust API has no stability guarantee beyond Cargo's `0.x` rules: any minor release may change it.

Crates and npm packages release together under one version.

## License

MIT
