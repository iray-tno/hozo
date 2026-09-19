// The TurboModule specification codegen reads.
//
// `Double` rather than `Int32` for the tag, deliberately. Codegen's mapping of
// `Int32` onto a Kotlin parameter type has moved between React Native
// versions, and a mismatch there is a compile error in generated code that
// names neither this file nor the reason. `Double` maps to `double`
// everywhere, and the Kotlin side narrows it once. A view tag is small enough
// that nothing is lost.
//
// `get` rather than `getEnforcing`: this package is optional by design, and
// the caller degrades to React Native's own event when it resolves to null.
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

import type { Double } from './codegen-types.ts'

export interface Spec extends TurboModule {
  /**
   * Move accessibility focus to the view behind a React tag.
   *
   * Performs `ACTION_ACCESSIBILITY_FOCUS`, which is an action rather than the
   * `TYPE_VIEW_FOCUSED` event every JavaScript route ends at. See #491.
   */
  moveAccessibilityFocus(reactTag: Double): void
}

export default TurboModuleRegistry.get<Spec>('HozoAccessibility')
