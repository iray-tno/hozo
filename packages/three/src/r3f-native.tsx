import type { CanvasAccessibilityProps } from '@hozo/canvas'
import { activateHozoNavigation, useHozoNavigation } from '@hozo/engine/navigation'
import {
  Canvas as FiberCanvas,
  type CanvasProps as FiberCanvasProps,
} from '@react-three/fiber/native'
import type { ReactNode } from 'react'
import {
  Linking,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'

import {
  type R3FAccessibleObject,
  type R3FAccessibleObjectEvent,
  resolveR3FAccessibleObject,
} from './r3f-accessibility.ts'

export type {
  R3FAccessibleObject,
  R3FAccessibleObjectEvent,
  R3FAccessibleObjectTarget,
} from './r3f-accessibility.ts'

type NativeFiberCanvasProps = Omit<
  FiberCanvasProps,
  | 'accessibilityElementsHidden'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessible'
  | 'children'
  | 'importantForAccessibility'
  | 'style'
>

export type ThreeCanvasProps = CanvasAccessibilityProps &
  NativeFiberCanvasProps & {
    /** Explicit public bridge from R3F objects to screen-reader controls. */
    accessibleObjects?: readonly R3FAccessibleObject[]
    children?: ReactNode
    /** Reports semantic-control focus without competing with R3F pointer events. */
    onObjectActiveChange?: (event: R3FAccessibleObjectEvent | undefined) => void
    style?: StyleProp<ViewStyle>
  }

/**
 * Experimental Expo GL host for React Three Fiber Native.
 *
 * R3F owns the GL context, reconciler, frame loop, and pointer raycasting.
 * Hozo adds one explicit accessibility envelope and public semantic controls.
 */
export function ThreeCanvas({
  accessibilityLabel,
  accessibleFallback,
  accessibleObjects = [],
  children,
  decorative,
  onObjectActiveChange,
  style,
  ...fiberProps
}: ThreeCanvasProps) {
  const navigation = useHozoNavigation()
  const hasFallback = accessibleFallback !== undefined
  const labelled = !decorative && !hasFallback
  const controls = accessibleObjects.filter(({ disabled }) => !disabled)
  const fallbackContent =
    typeof accessibleFallback === 'string' ||
    typeof accessibleFallback === 'number' ||
    typeof accessibleFallback === 'bigint' ? (
      <Text>{String(accessibleFallback)}</Text>
    ) : (
      accessibleFallback
    )

  return (
    <View
      style={[styles.root, style]}
      accessible={labelled && controls.length === 0}
      accessibilityRole={labelled && controls.length === 0 ? 'image' : undefined}
      accessibilityLabel={labelled && controls.length === 0 ? accessibilityLabel : undefined}
      accessibilityElementsHidden={decorative || undefined}
      importantForAccessibility={decorative ? 'no-hide-descendants' : undefined}
    >
      <View
        style={StyleSheet.absoluteFill}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <FiberCanvas {...fiberProps} style={StyleSheet.absoluteFill}>
          {children}
        </FiberCanvas>
      </View>
      {labelled && controls.length > 0 ? (
        <View
          style={styles.accessibilityDescription}
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
      {controls.length > 0 ? (
        <View style={styles.accessibilityLayer} pointerEvents="box-none">
          {controls.map((control, index) => {
            const focus = () => {
              const object = resolveR3FAccessibleObject(control.object)
              if (object) onObjectActiveChange?.({ id: control.id, object })
            }
            return (
              <Pressable
                key={control.id}
                style={[styles.accessibilityControl, { top: index * 44 }]}
                pointerEvents="box-none"
                accessible
                accessibilityRole={control.href === undefined ? 'button' : 'link'}
                accessibilityLabel={control.label}
                testID={control.testID}
                onFocus={focus}
                onBlur={() => onObjectActiveChange?.(undefined)}
                onPress={() => {
                  const object = resolveR3FAccessibleObject(control.object)
                  if (!object) return
                  if (control.href === undefined) {
                    control.onPress({ id: control.id, object })
                    return
                  }
                  void activateHozoNavigation(
                    navigation,
                    {
                      href: control.href,
                      external: control.external,
                      replace: control.replace,
                    },
                    Linking.openURL,
                  )
                }}
              />
            )
          })}
        </View>
      ) : null}
      {hasFallback ? (
        <View style={styles.accessibleFallback} accessible={false} pointerEvents="none">
          {accessibilityLabel ? <Text>{accessibilityLabel}</Text> : null}
          {fallbackContent}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // FiberCanvas is absolutely positioned inside this accessibility envelope,
  // so the envelope must claim its parent's available space itself. Without
  // flex the wrapper collapses to zero height and Expo GL never creates a
  // rendering context.
  root: { flex: 1, position: 'relative', overflow: 'hidden' },
  accessibilityLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  accessibilityDescription: { position: 'absolute', width: 1, height: 1 },
  accessibilityControl: { position: 'absolute', left: 0, width: 44, height: 44 },
  accessibleFallback: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
  },
})
