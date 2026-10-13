import type { ClassResolver } from '@hozo/engine'
import { hozoClasses } from '@hozo/engine/project'
import { View } from 'react-native'
import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'

/** Real layout nodes, with the same decorative contract as the Web spans. */
export function controlIndicator(
  look: HozoControlIndicatorClasses | undefined,
  state: NonNullable<Parameters<ClassResolver>[1]>,
) {
  if (!look) return null
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={hozoClasses(look.className, state)}
    >
      {look.markClassName !== undefined ? (
        <View accessible={false} style={hozoClasses(look.markClassName, state)} />
      ) : null}
    </View>
  )
}
