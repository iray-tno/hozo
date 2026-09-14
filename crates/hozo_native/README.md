# hozo_native

The Native backend of the Hozo compiler. It lowers `hozo_ir` to React Native primitives and `StyleSheet` objects, and names the few runtime hooks a condition like `dark:` or `md:` needs on a device.

Part of [Hozo](https://github.com/iray-tno/hozo), a Rust-powered universal UI compiler and accessibility-first layer for React Native.

## Stability

These crates are published so they can depend on one another from crates.io and so the compiler can be read and embedded. The supported way to use Hozo is the `@hozo/*` packages on npm. The Rust API has no stability guarantee beyond Cargo's `0.x` rules: any minor release may change it.

Crates and npm packages release together under one version.

## License

MIT
