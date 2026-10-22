import { HozoInteractionContext } from '@hozo/behaviors/pressable-interaction'
import { canBlendColor } from '@hozo/engine'
import {
  HOZO_INHERITED_TEXT_FIELDS,
  type HozoInheritedTextFrame,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import {
  Children,
  type ComponentPropsWithRef,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from 'react'
import type { Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native'
import { HozoInheritedText } from './inherited-text.native.tsx'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'
import { HozoPressable, type HozoPressableProps } from './pressable.native.tsx'
import { useHozoTextColorTransition } from './text-color-transition.native.ts'

type Props = Omit<HozoPressableProps, 'style'> & {
  style?: StyleProp<ViewStyle & TextStyle>
  ref?: ComponentPropsWithRef<typeof Pressable>['ref']
}

/** Only the label reads/publishes typography; there is no extra native box. */
function LabelScope({
  own,
  resolve,
  transition,
  children,
}: {
  own: TextStyle
  resolve: HozoPressableProps['hozoTextStyle']
  transition?: HozoPressableProps['hozoTransition']
  children?: ReactNode
}) {
  const interaction = useContext(HozoInteractionContext)
  if (!interaction) throw new Error('Inherited label requires the existing Pressable owner')
  // The existing owner is the only state machine. Resolve the class label
  // once from its committed snapshot, then apply the owner's explicit style.
  const frame = useHozoInheritedTextFrame(
    flattenInheritedTextStyle([resolve?.({ ...interaction }), own]),
  )
  const labelled = Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <HozoInheritedText>{child}</HozoInheritedText>
    ) : (
      child
    ),
  )
  return transition ? (
    <MotionScope frame={frame} transition={transition}>
      {labelled}
    </MotionScope>
  ) : (
    <HozoInheritedTextScope frame={frame}>{labelled}</HozoInheritedTextScope>
  )
}

function MotionScope({
  frame,
  transition,
  children,
}: {
  frame: HozoInheritedTextFrame
  transition: NonNullable<HozoPressableProps['hozoTransition']>
  children?: ReactNode
}) {
  if (
    typeof frame.paint.color !== 'string' ||
    !canBlendColor(frame.paint.color) ||
    frame.paint.motion?.color != null
  )
    throw new Error(
      'Native text inheritance does not assess unresolved colours or nested inherited motion',
    )
  const color = useHozoTextColorTransition(frame.paint.color, '', transition)
  const paint = useMemo(
    () => Object.freeze({ color: frame.paint.color, motion: Object.freeze({ color }) }),
    [color, frame.paint.color],
  )
  return (
    <HozoInheritedTextScope frame={{ metrics: frame.metrics, paint }}>
      {children}
    </HozoInheritedTextScope>
  )
}

/** Internal generated ABI. Ordinary Pressable is unchanged. */
export function HozoInheritedPressable({
  style,
  children,
  hozoTextStyle,
  hozoTransition,
  ...props
}: Props) {
  const motion = Boolean(hozoTransition)
  const initialMotion = useRef(motion)
  if (motion !== initialMotion.current)
    throw new Error('Inherited colour motion does not assess changing transition presence')
  if (
    hozoTransition &&
    (!hozoTransition.colors || hozoTransition.opacity || hozoTransition.transform)
  )
    throw new Error('Native text inheritance does not assess non-colour label transitions')
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
        <LabelScope own={own as TextStyle} resolve={hozoTextStyle} transition={hozoTransition}>
          {typeof children === 'function' ? children(state) : children}
        </LabelScope>
      )}
    </HozoPressable>
  )
}
