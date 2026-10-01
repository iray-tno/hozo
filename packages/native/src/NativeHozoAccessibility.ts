import { type TurboModule, TurboModuleRegistry } from 'react-native'

/**
 * The codegen specification, and the only file in this package React Native's
 * build reads.
 *
 * `codegenConfig` in `package.json` points at this directory, and the generator
 * finds this file by its name: `Native*.ts` is the convention, not a choice. It
 * produces `NativeHozoAccessibilitySpec`, the abstract Kotlin class
 * `HozoAccessibilityModule` extends, so the two sides cannot disagree about the
 * signature without failing the Gradle build.
 *
 * `number` rather than a view: a codegen spec's argument types are the ones the
 * bridge can carry, and a React tag is what crosses. The public API in
 * `index.ts` takes the component and does the `findNodeHandle` itself, because
 * asking a caller for a tag would be asking them to know about the bridge.
 */
export interface Spec extends TurboModule {
  /**
   * Performs `ACTION_ACCESSIBILITY_FOCUS` on the view behind a React tag.
   *
   * Returns nothing, deliberately. The work happens on the UI thread -- the view
   * cannot be resolved off it -- so a synchronous answer could only be "the
   * request was made", which the caller already knows. Whether focus landed is a
   * question for TalkBack rather than for a return value, and the measurement in
   * #491 is how it is answered.
   */
  moveAccessibilityFocus(viewTag: number): void
}

/**
 * `get` rather than `getEnforcing`.
 *
 * `getEnforcing` throws when the module is missing, and the whole arrangement in
 * `docs/decisions/006-shipping-native-code.md` rests on absence being a
 * degradation rather than a crash. The one case that reaches here with nothing
 * behind it is a JavaScript bundle that has this package but an app binary built
 * before it was installed -- which is exactly the state a developer is in halfway
 * through adding it, and the worst possible moment to throw.
 */
export default TurboModuleRegistry.get<Spec>('HozoAccessibility')
