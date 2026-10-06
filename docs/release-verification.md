# Release verification

Run these on the source intended for the version PR, and again on that version
before pushing a tag. A dispatch of `release.yml` is a dry run: neither npm nor
crates.io is written. Keep the run link with the release notes.

1. Normal CI, documentation checks and the complete conformance snapshot check
   must pass. The slow main report is not replaced by the PR's bounded checks.
2. Dispatch `release.yml`: all eight platform bindings, the npm artifact checks,
   packaged-crate verification, Android and iOS showcase build/device checks and
   showcase asset/evidence assembly must succeed, with publish jobs skipped.
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

## Showcase signing and release gate

Before the next version tag, create a dedicated fixed Android key. Do not reuse a
private production-app key, commit this key, or paste its password into a PR/chat.
In a private directory with a JDK installed, run (the password is prompted):

```sh
keytool -genkeypair -keystore hozo-showcase.keystore -storetype PKCS12 \
  -alias hozo-showcase -keyalg RSA -keysize 3072 -validity 10000 \
  -dname "CN=Hozo Showcase"
```

Use the same password for the PKCS12 store and private key. Securely back up both
the file and password: changing the key prevents existing Android installs from
updating in place. Configure these **repository Actions secrets**:

- `SHOWCASE_ANDROID_KEYSTORE_BASE64`: Base64 of the keystore file (not its path).
- `SHOWCASE_ANDROID_KEYSTORE_PASSWORD`: its password.

On PowerShell, copy the Base64 directly to your clipboard, without printing it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath .\hozo-showcase.keystore).Path)) | Set-Clipboard
```

Paste it into GitHub Settings → Secrets and variables → Actions, add the password
secret separately, and clear the clipboard afterward. The CI script writes the
key only to its own ephemeral runner-temp directory, passes passwords through
environment variables rather than command arguments, and removes that directory
on success or failure. APK certificate fingerprints are public, not secrets.

Before publishing, manually run `native-showcase` on the intended source with
`platform=both`, `release-assets=true`, `release-signing=true`, fresh builds,
diagnostics off and the default full/demand scenarios. This verifies the actual
fixed-key signing path without publishing anything. Fork/untrusted PR checks do
not receive the signing secrets; ordinary PR/weekly builds keep debug signing.
The release dry run also deliberately uses debug signing, so **it alone does not
verify fixed-key signing**. Missing keys fail a real tag release before npm starts;
there is no fallback to debug signing for a published showcase.

### Order and failure handling

1. The tag builds all eight compiler bindings and calls the same native workflow
   for fresh Android/iOS showcase builds. Release app versions match the library;
   build numbers use the release workflow's increasing run number.
2. Android is re-signed and verified **before** smoke installation. Its fingerprint
   and APK hash, plus the iOS archive hash, actual architectures and minimum OS,
   are recorded alongside the binaries.
3. `showcase-assets` requires canonical non-diagnostic full runs (Android's ten and
   iOS's nine checks) plus all five SVG pixel checks on both platforms, exact source
   and current build run. Missing, failed, reused, rebundled or partial evidence
   blocks publication. It checks binary hashes and prepares versioned downloads,
   installation notes, evidence manifest and root `CHANGELOG.md` release notes.
4. Only then may npm publish; crates.io follows npm. GitHub Release is created as
   a draft after both succeed. The two binaries and three supporting files are
   uploaded before the draft becomes public. Existing published releases are not
   overwritten. The usual `0.x` prerelease designation is retained.

Do not push another tag or rerun registry publication blindly after a failure.
Build/evidence failure happens before registry writes. **Registry publication and
GitHub asset upload cannot be atomic**: an npm/crates failure can leave a partially
published version, and an upload failure can happen after both registries publish.
The latter keeps the GitHub Release draft; retain the `hozo-showcase-release-assets`
artifact and resume only the failed GitHub job using the same verified tag/source.
Never republish already-published npm/crate versions just to retry an asset upload.

This adds APK and iOS Simulator downloads only. Paid Apple credentials, iPhone IPA
distribution and TestFlight are not configured. See the showcase's
[release download instructions](../examples/native-showcase/README.md#release-downloads).
