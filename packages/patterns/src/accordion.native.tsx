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

import { hozoTextChildren } from '@hozo/behaviors'
import { usePresence } from '@hozo/behaviors/native'
import { createClassTransitions } from '@hozo/engine'
import {
  HozoAnimated,
  PresenceContext,
  type PresenceContextValue,
} from '@hozo/engine/generated/animated'
import { useHozoEnvironment } from '@hozo/engine/generated/environment'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses, hozoClassTransitions } from '@hozo/engine/project'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { controlIndicator } from './control-indicator.native.tsx'
import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

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
   * `StyleSheet` entry. Here they arrive as strings and are resolved through
   * the project's candidate map (#886), a trigger with its interaction,
   * `aria-expanded` and `disabled` state. There is no heading element, so
   * `headingClassName` goes on the trigger before its own classes. Each
   * `*Style` prop comes after its class list.
   */
  className?: string
  sectionClassName?: string
  headingClassName?: string
  triggerClassName?: string
  panelClassName?: string
  /** On the view inside the panel that holds the content; see the Web half. */
  panelContentClassName?: string
  style?: StyleProp<ViewStyle>
  sectionStyle?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  triggerTextStyle?: StyleProp<TextStyle>
  panelStyle?: StyleProp<ViewStyle>
  panelContentStyle?: StyleProp<ViewStyle>
  /**
   * What marks a header open or closed, as classes for a decorative node
   * after the header: `className` for it, and `markClassName` for an
   * optional node inside. It gets the state the header announces.
   *
   * A real node rather than an `after:` class, because React Native has no
   * pseudo-elements: a chevron drawn with `::after` showed on the Web only
   * (#1205). Left out, the header has no marker, as before.
   */
  indicator?: (state: { expanded: boolean; disabled: boolean }) => HozoControlIndicatorClasses
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
    className,
    sectionClassName,
    headingClassName,
    triggerClassName,
    indicator,
    panelClassName,
    panelContentClassName,
    style,
    sectionStyle,
    triggerStyle,
    triggerTextStyle,
    panelStyle,
    panelContentStyle,
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
    <View
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel}
      style={[hozoClasses(className), hozoAuthoredStyle(style)]}
    >
      {items.map((item, at) => {
        const key = keyOf(item, at)
        const expanded = open.includes(key)
        // Box and label: a Pressable is a View and drops a label's colour
        // and weight, so those go to the Text (see `splitTextStyle`).
        const triggerState = (interaction: InteractionState) => ({
          ...interaction,
          disabled: Boolean(item.disabled),
          'aria-expanded': expanded,
          'aria-disabled': Boolean(item.disabled),
        })
        const trigger = (interaction: InteractionState) => {
          const state = triggerState(interaction)
          return splitTextStyle([
            hozoClasses(headingClassName, state),
            hozoClasses(triggerClassName, state),
          ])
        }
        return (
          <View key={key} style={[hozoClasses(sectionClassName), hozoAuthoredStyle(sectionStyle)]}>
            <Pressable
              accessibilityRole="header"
              accessibilityState={{ expanded, disabled: item.disabled }}
              disabled={item.disabled}
              style={(interaction) => [trigger(interaction)[0], hozoAuthoredStyle(triggerStyle)]}
              onPress={() => toggle(at)}
            >
              {(interaction) => {
                const header =
                  typeof item.header === 'string' ? (
                    <Text style={[trigger(interaction)[1], triggerTextStyle]}>{item.header}</Text>
                  ) : (
                    item.header
                  )
                // Without an indicator the header is what it was before one existed.
                if (!indicator) return header
                return (
                  <>
                    {header}
                    {controlIndicator(
                      indicator({ expanded, disabled: Boolean(item.disabled) }),
                      triggerState(interaction),
                    )}
                  </>
                )
              }}
            </Pressable>
            <Panel
              expanded={expanded}
              className={panelClassName}
              style={panelStyle}
              contentClassName={panelContentClassName}
              contentStyle={panelContentStyle}
              content={item.content}
            />
          </View>
        )
      })}
    </View>
  )
}

// Read once: the table is the project's, and it does not change while the
// app runs.
const transitionOf = createClassTransitions(hozoClassTransitions)

/** How long past the transition to wait for an exit that never reports. */
const GRACE_MS = 100

interface PanelProps {
  expanded: boolean
  className: string | undefined
  style: StyleProp<ViewStyle>
  contentClassName: string | undefined
  contentStyle: StyleProp<ViewStyle>
  content: ReactNode
}

/**
 * A panel, which animates its height when its classes ask for a transition
 * of it and is otherwise there or not, as before.
 *
 * The content is measured by `onLayout` on the view that holds it, whose
 * height does not depend on the panel's, and the panel's height runs between
 * `0` and that number through `HozoAnimated` -- `auto` has nothing to
 * interpolate. The exit is `HozoAnimated`'s own, under a `PresenceContext`
 * this panel provides, so the content is removed when its height reaches `0`.
 *
 * While it closes it is drawn and nothing else: no touches, and hidden from
 * TalkBack and VoiceOver, the Web half's `inert`. The header already says
 * collapsed.
 */
function Panel({
  expanded,
  className,
  style,
  contentClassName,
  contentStyle,
  content,
}: PanelProps) {
  const reduceMotion = useHozoEnvironment('motion-reduce')
  const spec = transitionOf(className, { reduceMotion })
  const presence = usePresence(expanded)
  const [height, setHeight] = useState<number | null>(null)
  // A panel open on mount has nothing to enter from. Every later opening does.
  const [entersFromZero, setEntersFromZero] = useState(!expanded)
  if (!presence.mounted && !entersFromZero) setEntersFromZero(true)

  const exitMs = useRef(0)
  const { done, state } = presence
  const context = useMemo<PresenceContextValue>(
    () => ({
      state,
      register: (_id, durationMs) => {
        exitMs.current = durationMs
        return () => {}
      },
      done: () => done(),
    }),
    [state, done],
  )
  // An exit interrupted by something above, or dropped by the runtime, would
  // otherwise leave an inert panel on screen for good.
  useEffect(() => {
    if (expanded || !presence.mounted) return
    const timer = setTimeout(done, exitMs.current + GRACE_MS)
    return () => clearTimeout(timer)
  }, [expanded, presence.mounted, done])

  const [box, text] = splitTextStyle([
    hozoClasses(contentClassName),
    hozoAuthoredStyle(contentStyle),
  ])
  // The state the Web half writes as `data-hozo-state`, so a
  // `data-[hozo-state=closed]:` class resolves here too.
  const [outerBox, outerText] = splitTextStyle([
    hozoClasses(className, {
      'data-hozo-state=open': expanded,
      'data-hozo-state=closed': !expanded,
    }),
    hozoAuthoredStyle(style),
  ])

  if (!spec) {
    if (!expanded) return null
    // A panel's box and its text, split as a header's are: a `View` drops the
    // panel's colour and size, so they go to the content's `Text`.
    return (
      <View style={outerBox}>
        <View style={box}>{hozoTextChildren(content, [outerText, text])}</View>
      </View>
    )
  }
  if (!presence.mounted) return null

  const leaving = !expanded
  return (
    <PresenceContext.Provider value={context}>
      <HozoAnimated
        style={[
          outerBox,
          { overflow: 'hidden' },
          height === null ? (entersFromZero ? { height: 0 } : null) : { height },
        ]}
        hozoTransition={spec}
        hozoStarting={entersFromZero ? { height: 0 } : undefined}
        hozoExit={{ height: 0 }}
        pointerEvents={leaving ? 'none' : 'auto'}
        accessibilityElementsHidden={leaving}
        importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      >
        <View style={box} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
          {hozoTextChildren(content, [outerText, text])}
        </View>
      </HozoAnimated>
    </PresenceContext.Provider>
  )
}

export {
  HozoAccordion as Accordion,
  type HozoAccordionItem as AccordionItem,
  type HozoAccordionMultipleProps as AccordionMultipleProps,
  type HozoAccordionProps as AccordionProps,
  type HozoAccordionSingleProps as AccordionSingleProps,
}
