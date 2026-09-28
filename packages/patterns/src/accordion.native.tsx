/**
 * An accordion on React Native. See `accordion.tsx` for the shape and for why
 * the headers are not a roving group.
 *
 * Two differences the platform forces, both worth naming:
 *
 * `aria-controls` has no equivalent, so the panel is not pointed at. What
 * carries the relationship instead is order and containment -- the panel is
 * the next thing after its header, inside the same view -- which is what
 * TalkBack and VoiceOver walk anyway.
 *
 * A closed panel is not rendered at all, where the Web half renders it with
 * `hidden`. The Web needs the element to exist because `aria-controls` points
 * at it; here nothing points at it, and a `View` that is present and
 * unreachable is a thing an explore-by-touch gesture can still land on.
 *
 * `accessibilityState.expanded` is the one both platforms have, and it is
 * what makes a reader say "collapsed" or "expanded" on the header.
 */

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'

export interface HozoAccordionItem {
  /** An identity of the caller's own; see the Web half. */
  id?: string
  header: ReactNode
  content: ReactNode
  disabled?: boolean
}

interface Shared {
  items: readonly HozoAccordionItem[]
  accessibilityLabel?: string
  /**
   * Accepted for parity with the Web half, where it chooses the heading
   * element each header sits in. There are no heading elements here; a header
   * is a `Pressable` with `accessibilityRole="header"` either way.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else they are carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and the
   * types still have to accept them, because an app is type-checked against
   * the source the compiler reads rather than its output.
   */
  className?: string
  sectionClassName?: string
  headingClassName?: string
  triggerClassName?: string
  panelClassName?: string
  style?: StyleProp<ViewStyle>
  sectionStyle?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  triggerTextStyle?: StyleProp<TextStyle>
  panelStyle?: StyleProp<ViewStyle>
}

export interface HozoAccordionSingleProps extends Shared {
  multiple?: false
  defaultExpanded?: string | null
  expanded?: string | null
  onExpandedChange?: (expanded: string | null) => void
}

export interface HozoAccordionMultipleProps extends Shared {
  multiple: true
  defaultExpanded?: readonly string[]
  expanded?: readonly string[]
  onExpandedChange?: (expanded: string[]) => void
}

export type HozoAccordionProps = HozoAccordionSingleProps | HozoAccordionMultipleProps

const keyOf = (item: HozoAccordionItem, at: number) => item.id ?? String(at)

export function HozoAccordion(props: HozoAccordionProps) {
  const {
    items,
    accessibilityLabel,
    style,
    sectionStyle,
    triggerStyle,
    triggerTextStyle,
    panelStyle,
  } = props
  const multiple = props.multiple === true

  const [uncontrolledOne, setUncontrolledOne] = useState<string | null>(
    props.multiple === true ? null : (props.defaultExpanded ?? null),
  )
  const [uncontrolledMany, setUncontrolledMany] = useState<readonly string[]>(
    props.multiple === true ? (props.defaultExpanded ?? []) : [],
  )

  const open: readonly string[] = multiple
    ? ((props as HozoAccordionMultipleProps).expanded ?? uncontrolledMany)
    : (() => {
        const one = (props as HozoAccordionSingleProps).expanded
        const current = one === undefined ? uncontrolledOne : one
        return current === null ? [] : [current]
      })()

  const toggle = useCallback(
    (at: number) => {
      const item = items[at]
      if (!item || item.disabled) return
      const key = keyOf(item, at)
      if (props.multiple === true) {
        const next = open.includes(key) ? open.filter((one) => one !== key) : [...open, key]
        if (props.expanded === undefined) setUncontrolledMany(next)
        props.onExpandedChange?.([...next])
        return
      }
      const next = open.includes(key) ? null : key
      if (props.expanded === undefined) setUncontrolledOne(next)
      props.onExpandedChange?.(next)
    },
    [items, open, props],
  )

  return (
    <View accessibilityRole="none" accessibilityLabel={accessibilityLabel} style={style}>
      {items.map((item, at) => {
        const key = keyOf(item, at)
        const expanded = open.includes(key)
        return (
          <View key={key} style={sectionStyle}>
            <Pressable
              accessibilityRole="header"
              accessibilityState={{ expanded, disabled: item.disabled }}
              disabled={item.disabled}
              style={triggerStyle}
              onPress={() => toggle(at)}
            >
              {typeof item.header === 'string' ? (
                <Text style={triggerTextStyle}>{item.header}</Text>
              ) : (
                item.header
              )}
            </Pressable>
            {expanded ? <View style={panelStyle}>{item.content}</View> : null}
          </View>
        )
      })}
    </View>
  )
}

export {
  HozoAccordion as Accordion,
  type HozoAccordionItem as AccordionItem,
  type HozoAccordionMultipleProps as AccordionMultipleProps,
  type HozoAccordionProps as AccordionProps,
  type HozoAccordionSingleProps as AccordionSingleProps,
}
