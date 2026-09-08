# Hozo + Expo Router fixture

This app is both a minimal integration example and a regression test. It imports the real
`expo-router` package, passes its generated router object to `ExpoRouterNavigationProvider`, and
exports production Web and Android bundles through Expo's Metro configuration wrapped by
`@hozo/metro`.

```sh
pnpm --filter @hozo/example-expo-router-demo test
pnpm --filter @hozo/example-expo-router-demo build
```

The fixture intentionally does not claim typed Hozo destinations; that work is tracked separately
in #328.
