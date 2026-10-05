# Release verification

Run these on the source intended for the version PR, and again on that version
before pushing a tag. A dispatch of `release.yml` is a dry run: neither npm nor
crates.io is written. Keep the run link with the release notes.

1. Normal CI, documentation checks and the complete conformance snapshot check
   must pass. The slow main report is not replaced by the PR's bounded checks.
2. Dispatch `release.yml`: all eight platform bindings, the npm artifact checks
   and packaged-crate verification must succeed, with publish jobs skipped.
3. Dispatch `packed-consumer.yml`. Node 22 and 24 consume fresh local tarballs
   outside the workspace, with no module aliases or development binding override.

For local reproduction, build the packages then run:

```sh
pnpm turbo run build --filter='./packages/*'
pnpm test:packed-consumer
```

The consumer run builds and packs the host platform binding. To consume binding
artifacts already downloaded from a release dry run, pass their containing folder:

```sh
pnpm test:packed-consumer --bindings-dir artifacts/release-bindings
```

The isolated projects are retained in the OS temporary directory (the run prints
their exact path); evidence, tarballs, command logs, a browser screenshot, production
Metro bundles and generated Android specs are under `artifacts/packed-consumer/run-*`.
Failures are retained too. Each run starts with `passed=false`, records its source
commit and dirty-tree status, runner/fixture hashes, runtime/peer versions and
tarball/binding hashes, and only becomes successful
after every required check completes.

## What this proves

- The prepared compiler manifest installs and executes the matching optional
  platform binding, without a development `.node` beside the compiler.
- Both consumer applications type-check using installed public entry points;
  Native uses the `react-native` export condition, not the Web declarations.
- Both compilation backends execute; canonical components render on the server;
  an ordinary portable Three scene can be projected.
- A Vite production build discovers the installed source-distributed UI package.
  A real browser checks the application's overridden theme colour and exercises
  pointer and keyboard activation. Neither React Native nor RNW is installed in
  that Web application.
- Fresh Android and iOS production Metro bundles resolve the installed Native
  entry points. RN's own CLI discovers the optional Android module and its actual
  codegen produces specs from the installed tarball.

## What this does not prove

Local tarballs substitute only the Hozo packages, using normal semver-rewritten
pack output under pnpm's isolated layout. This does not test registry credentials,
OIDC trust, eventual registry availability, every integration, every public API,
Gradle/CocoaPods compilation, or device behaviour/performance. Existing real-device
and native-build workflows remain necessary.

`@hozo/ui` is in the generated public-package list, preserving its source entry
and theme CSS. Evidence records `releaseListed` per package, but a successful
consumer does not make the package published. First create a new package's
registry identity with the explicit bootstrap workflow, then configure its
Trusted Publisher. Dry runs do neither; those remain release prerequisites.

Native type acceptance of shared widget styling slots is not proof of their
visual appearance. Native patterns currently carry class-name slots without
resolving them at runtime; use their style props for the runtime appearance.
This smoke checks a UI Button bundle, not every widget's styling on a device.
