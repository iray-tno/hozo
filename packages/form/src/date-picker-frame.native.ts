import { hozoSplitTextStyle } from '@hozo/engine'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import { nonControlClassFacts } from './class-facts.native.ts'

/** Same inline CSS ancestry as the Web pickers, explicitly routed to owned
 * labels across Native Modal. Inherited text stays below a child's own
 * declarations; it must not become the child's highest-priority style prop.
 * No context, element cloning or new layout host is needed for these slots. */
export function resolveDatePickerFrame({
  className,
  style,
  dialogClassName,
  dialogStyle,
  open,
}: {
  className?: string
  style?: StyleProp<ViewStyle>
  dialogClassName?: string
  dialogStyle?: StyleProp<ViewStyle>
  open: boolean
}): {
  box: ViewStyle
  text: TextStyle
  dialogBox: ViewStyle
  contentText: StyleProp<TextStyle>
} {
  const [box, text] = hozoSplitTextStyle(
    StyleSheet.flatten([hozoClasses(className, nonControlClassFacts), hozoAuthoredStyle(style)]) ??
      {},
  )
  // A closed Native Modal does not render its children. Do not resolve (or
  // diagnose missing facts for) an owner that does not exist on either side.
  const [dialogBox, dialogText] = hozoSplitTextStyle(
    open
      ? (StyleSheet.flatten([
          hozoClasses(dialogClassName, nonControlClassFacts),
          hozoAuthoredStyle(dialogStyle),
        ]) ?? {})
      : {},
  )
  return {
    box: box as ViewStyle,
    text: text as TextStyle,
    dialogBox: dialogBox as ViewStyle,
    contentText: [text as TextStyle, dialogText as TextStyle],
  }
}
