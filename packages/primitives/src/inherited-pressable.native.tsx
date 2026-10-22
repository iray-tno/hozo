import { HozoInteractionContext } from '@hozo/behaviors/pressable-interaction'
import {
  HOZO_INHERITED_TEXT_FIELDS,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { Children, type ComponentPropsWithRef, type ReactNode, useContext } from 'react'
import type { Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native'
import { HozoInheritedText } from './inherited-text.native.tsx'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'
import { HozoPressable, type HozoPressableProps } from './pressable.native.tsx'

type Props = Omit<HozoPressableProps, 'style'> & {
  style?: StyleProp<ViewStyle & TextStyle>
  ref?: ComponentPropsWithRef<typeof Pressable>['ref']
}

/** Only the label reads/publishes typography; there is no extra native box. */
function LabelScope({
  own,
  resolve,
  children,
}: {
  own: TextStyle
  resolve: HozoPressableProps['hozoTextStyle']
  children?: ReactNode
}) {
  const interaction = useContext(HozoInteractionContext)
  if (!interaction) throw new Error('Inherited label requires the existing Pressable owner')
  // The existing owner is the only state machine. Resolve the class label
  // once from its committed snapshot, then apply the owner's explicit style.
  const frame = useHozoInheritedTextFrame(
    flattenInheritedTextStyle([resolve?.({ ...interaction }), own]),
  )
  return (
    <HozoInheritedTextScope frame={frame}>
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <HozoInheritedText>{child}</HozoInheritedText>
        ) : (
          child
        ),
      )}
    </HozoInheritedTextScope>
  )
}

/** Internal, non-animated generated ABI. Ordinary Pressable is unchanged. */
export function HozoInheritedPressable({
  style,
  children,
  hozoTextStyle,
  hozoTransition,
  ...props
}: Props) {
  if (hozoTransition) throw new Error('Native text inheritance does not assess label transitions')
  const flat = flattenInheritedTextStyle(style)
  const box = { ...flat }
  const own: Record<string, unknown> = {}
  for (const field of HOZO_INHERITED_TEXT_FIELDS) {
    if (Object.hasOwn(flat, field)) own[field] = flat[field]
    delete box[field]
  }
  return (
    <HozoPressable {...props} style={box as ViewStyle}>
      {(state) => (
        <LabelScope own={own as TextStyle} resolve={hozoTextStyle}>
          {typeof children === 'function' ? children(state) : children}
        </LabelScope>
      )}
    </HozoPressable>
  )
}
