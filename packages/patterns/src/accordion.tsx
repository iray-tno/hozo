/**
 * An accordion: a set of disclosures that know about each other.
 *
 * One panel or several, which is the only thing that makes this more than a
 * stack of `<details>` elements. A set where opening one closes the rest has
 * to be a set; a set where they open independently does not, and is offered
 * anyway because a caller should not have to change component to change their
 * mind about that.
 *
 * ## Not roving focus, which is what it looks like
 *
 * Every header is its own tab stop. The Authoring Practices are explicit
 * about it -- "all focusable elements in the accordion are included in the
 * page Tab sequence" -- and it is the opposite of `Tabs` next door, where the
 * strip is one stop and the arrows move within it. The difference is what the
 * control is for: a tab strip is a chooser, so stopping on each tab would make
 * a reader pass six things to reach the content, while an accordion's headers
 * are each a thing to act on.
 *
 * The arrow keys are still wired, because APG offers them and because a
 * ten-item accordion is unpleasant to Tab through. They move focus and change
 * nothing else -- `nextIndex` from `@hozo/behaviors`, the same function
 * `RadioGroup` and `Tabs` use, so Home and End and the disabled-skipping come
 * for free and cannot drift from the others.
 *
 * ## The heading level is the caller's
 *
 * Each header sits inside an element the caller names with `headingLevel`,
 * because only the caller knows what is above it. A component that hard-coded
 * `<h3>` would produce a document that jumps from `<h1>` to `<h3>` in half the
 * pages it appears on, and heading order is one of the few things a screen
 * reader user navigates by.
 */

import { nextIndex, type RovingKey } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'

export interface HozoAccordionItem {
  /**
   * An identity of the caller's own.
   *
   * Sections are keyed by this when it is given and by their position when it
   * is not, which is the same bargain `RadioGroup` makes: position works until
   * the list is reordered, and then it silently moves the open panel.
   */
  id?: string
  header: ReactNode
  content: ReactNode
  disabled?: boolean
}

interface Shared {
  items: readonly HozoAccordionItem[]
  accessibilityLabel?: string
  /**
   * The level of the element each header sits in, 1 to 6.
   *
   * Defaults to 3, which is a guess, and the only prop here that has to be
   * one. A heading level is a fact about the page rather than the component.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  className?: string
  /** On the element that wraps one header and its panel. */
  sectionClassName?: string
  /** On the heading element, which is what `headingLevel` chooses. */
  headingClassName?: string
  /** On the button inside the heading, which is what a person presses. */
  triggerClassName?: string
  /** On the panel, which is a labelled region whether it is open or not. */
  panelClassName?: string
}

/** One at a time: opening a section closes whichever was open. */
export interface HozoAccordionSingleProps extends Shared {
  multiple?: false
  defaultExpanded?: string | null
  expanded?: string | null
  onExpandedChange?: (expanded: string | null) => void
}

/** Any number at once, including none. */
export interface HozoAccordionMultipleProps extends Shared {
  multiple: true
  defaultExpanded?: readonly string[]
  expanded?: readonly string[]
  onExpandedChange?: (expanded: string[]) => void
}

export type HozoAccordionProps = HozoAccordionSingleProps | HozoAccordionMultipleProps

/** What a section is called, which is the caller's id or else its place. */
const keyOf = (item: HozoAccordionItem, at: number) => item.id ?? String(at)

export function HozoAccordion(props: HozoAccordionProps) {
  const {
    items,
    accessibilityLabel,
    headingLevel = 3,
    className,
    sectionClassName,
    headingClassName,
    triggerClassName,
    panelClassName,
  } = props
  const multiple = props.multiple === true
  const base = useId()
  const triggers = useRef<(HTMLButtonElement | null)[]>([])

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
      // Pressing the open one closes it. APG leaves that to the
      // implementation and allows a set where one is always open; this is the
      // half that does not, because a person who opened something by accident
      // has no other way to put it back.
      const next = open.includes(key) ? null : key
      if (props.expanded === undefined) setUncontrolledOne(next)
      props.onExpandedChange?.(next)
    },
    [items, open, props],
  )

  const disabled = items.flatMap((item, at) => (item.disabled ? [at] : []))

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    // Space and Enter are the button's own, and the browser turns them into a
    // click. Handling them here would fire twice.
    const moved = nextIndex(event.key as RovingKey, {
      count: items.length,
      active: at,
      orientation: 'vertical',
      disabled,
    })
    if (moved === null) return
    event.preventDefault()
    triggers.current[moved]?.focus()
  }

  const Heading = `h${headingLevel}` as const

  return (
    <div role="group" aria-label={accessibilityLabel} className={className}>
      {items.map((item, at) => {
        const key = keyOf(item, at)
        const expanded = open.includes(key)
        return (
          <div key={key} className={sectionClassName}>
            <Heading className={headingClassName}>
              <button
                ref={(node) => {
                  triggers.current[at] = node
                }}
                type="button"
                id={`${base}-trigger-${at}`}
                aria-expanded={expanded}
                aria-controls={`${base}-panel-${at}`}
                disabled={item.disabled}
                // The styling hook that goes with the attribute, because
                // Hozo's `disabled:` variant compiles to `[data-hozo-disabled]`
                // rather than to `:disabled` -- one selector for a `<button
                // disabled>`, a `Pressable` and a dimmed region alike. Without
                // it a `disabled:` class on this trigger is CSS that can never
                // match, which is the exact cost decision 001 records.
                data-hozo-disabled={item.disabled ? '' : undefined}
                className={triggerClassName}
                data-hozo-state={expanded ? 'open' : 'closed'}
                onClick={() => toggle(at)}
                onKeyDown={(event) => onKeyDown(event, at)}
              >
                {item.header}
              </button>
            </Heading>
            {/*
              Always rendered, and hidden when closed rather than removed.

              `aria-controls` has to point at something that exists, and a
              reader that follows it into nothing is worse than one that finds
              a collapsed region. `hidden` is the attribute rather than a
              class, because this package ships no CSS and a panel that stayed
              visible until a stylesheet arrived would be a broken control
              rather than an unstyled one.
            */}
            <div
              id={`${base}-panel-${at}`}
              role="region"
              aria-labelledby={`${base}-trigger-${at}`}
              hidden={!expanded}
              className={panelClassName}
              data-hozo-state={expanded ? 'open' : 'closed'}
            >
              {item.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export {
  HozoAccordion as Accordion,
  type HozoAccordionItem as AccordionItem,
  type HozoAccordionMultipleProps as AccordionMultipleProps,
  type HozoAccordionProps as AccordionProps,
  type HozoAccordionSingleProps as AccordionSingleProps,
}
