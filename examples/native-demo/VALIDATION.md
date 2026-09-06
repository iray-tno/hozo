# Native device acceptance

The automated suite proves that this source passes the real Metro transformer, that generated modules evaluate against the Native component contract, and that measured Grid state settles under synthetic `onLayout` events. A simulator or device is still required for the platform behaviors below.

## Production bundle measurement

Run `pnpm measure:production` in this directory. It creates minified, non-development Android Metro bundles for the full acceptance app and for a matched pair of small screens: one authored with Hozo and one with React Native styles directly. Raw and gzip sizes plus the Hozo-minus-Native delta are written to the ignored `dist/bundle-sizes.json` file.

The reference measurement on 2026-08-18 was:

| Bundle | Raw | gzip |
| --- | ---: | ---: |
| Full acceptance app | 895,433 B | 216,573 B |
| Matched Hozo screen | 889,580 B | 215,092 B |
| Matched Native screen | 889,438 B | 215,064 B |
| Hozo increment | **142 B** | **28 B** |

The matched pair deliberately uses only compile-away features. It is a guard against the compiler or an accidental runtime dependency entering every app bundle, not a claim that runtime-backed features such as Grid or Native interaction transitions cost zero.

There is a host now. `android/` is a React Native 0.87 project that registers `HozoNativeDemo` from `index.js`, and the `native` workflow builds a release APK, boots it on an emulator, and fails if it does not come up (#297). Run the same thing locally with an emulator attached:

```sh
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
bash ../scripts/android-smoke.sh
```

iOS has no host yet, so everything below is still Android-with-your-own-eyes and iOS-with-your-own-everything.

What the automated boot establishes is narrow: the process starts, stays up, and its accessibility tree contains a `testID` the app renders. It says nothing about any of the passes below.

## Visual and interaction pass

_Screenshots of each of these are the next phase of #297; the judgement about what the screenshots show is not._

- `smoke-image`: the remote logo loads, is 80×80, cropped, and rounded.
- `smoke-horizontal-scroll`: a horizontal gesture reaches cards three and four without vertical-axis capture.
- `smoke-grid`: the tall tile spans both measured rows; the displayed width is non-zero and updates after rotation.
- `smoke-list`: rows scroll smoothly and retain their content after recycling.
- `smoke-interaction`: pointer hover changes color where supported; keyboard focus has a visible color; pressing opens the dialog.
- Dialog: Android Back requests close and focus does not escape the modal.

## Screen-reader pass

_The tree these announce from is machine-readable, and #297 will assert it against the contract in #260. What a screen reader says out loud stays here._

- VoiceOver and TalkBack announce the acceptance screen as a list and each virtual row once.
- The logo is announced as “React Native logo”.
- The input is announced as “Email address”, followed by its hint; the placeholder is not used as its name.
- Continue is announced as a button named “Review email address”.
- Opening the dialog announces “Confirm your address”; dismissing it returns focus to Continue.

Record OS, device/simulator, screen reader, result, and any failing `testID`. Do not mark the device gate complete from the Metro bundle alone.
