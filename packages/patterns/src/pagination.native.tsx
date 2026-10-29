import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { activateHozoNavigation, useHozoNavigation } from '@hozo/engine/navigation'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { Linking, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { nonControlSlotFacts } from './non-control-facts.native.ts'
import { paginationItems } from './pagination-rules.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import type { PaginationSlotFacts } from './slot-facts.native.ts'
import { splitTextStyle } from './text-style.native.ts'

type PaginationSlotState = InteractionState & PaginationSlotFacts

export interface HozoPaginationProps {
  page?: number
  defaultPage?: number
  onPageChange?: (page: number) => void
  pageCount: number
  siblingCount?: number
  boundaryCount?: number
  getPageHref?: (page: number) => string
  accessibilityLabel?: string
  previousIcon?: ReactNode
  nextIcon?: ReactNode
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here as strings, resolved through the project's
   * candidate map (#886) before the matching style prop, an item with its
   * interaction and its actual Web button/link semantic facts. Native's
   * selected announcement does not create a Web `aria-selected` attribute.
   */
  className?: string
  itemClassName?: string
  currentItemClassName?: string
  disabledItemClassName?: string
  ellipsisClassName?: string
  style?: StyleProp<ViewStyle | TextStyle>
  itemStyle?: StyleProp<ViewStyle | TextStyle>
  currentItemStyle?: StyleProp<ViewStyle | TextStyle>
  disabledItemStyle?: StyleProp<ViewStyle | TextStyle>
  ellipsisStyle?: StyleProp<ViewStyle | TextStyle>
  /** @internal Static state styles consumed by each page control. */
  hozoItemStyle?: (state: PaginationSlotState) => StyleProp<ViewStyle | TextStyle>
  /** @internal Applied only to the current control, with that host's facts. */
  hozoCurrentItemStyle?: (state: PaginationSlotState) => StyleProp<ViewStyle | TextStyle>
  /** @internal Applied only to disabled boundary controls. */
  hozoDisabledItemStyle?: (state: PaginationSlotState) => StyleProp<ViewStyle | TextStyle>
  testID?: string
}

/**
 * Numbered pages with previous and next, on React Native: a row of buttons
 * -- or of links, with `getPageHref` -- the current one `selected`, previous
 * and next disabled at the ends. Android has no landmark for a navigation,
 * so the row is not one; each control carries its own name.
 *
 * A link goes through the installed router as `Link` does, falling back to
 * the platform's URL handler. The text half of each style -- a colour, a
 * weight -- goes to the control's label, where a `Text` can draw it.
 */
export function HozoPagination({
  page,
  defaultPage,
  onPageChange,
  pageCount,
  siblingCount,
  boundaryCount,
  getPageHref,
  previousIcon,
  nextIcon,
  className,
  itemClassName,
  currentItemClassName,
  disabledItemClassName,
  ellipsisClassName,
  style,
  itemStyle,
  currentItemStyle,
  disabledItemStyle,
  ellipsisStyle,
  hozoItemStyle,
  hozoCurrentItemStyle,
  hozoDisabledItemStyle,
  testID,
}: HozoPaginationProps) {
  const message = useHozoMessage()
  const { dir } = useHozoI18n()
  const navigation = useHozoNavigation()
  const [uncontrolled, setUncontrolled] = useState(defaultPage ?? 1)
  const current = Math.min(Math.max(1, page ?? uncontrolled), Math.max(1, pageCount))
  const go = useCallback(
    (next: number) => {
      if (page === undefined) setUncontrolled(next)
      onPageChange?.(next)
      if (getPageHref) {
        void activateHozoNavigation(navigation, { href: getPageHref(next) }, Linking.openURL)
      }
    },
    [getPageHref, navigation, onPageChange, page],
  )
  const items = paginationItems({ page: current, pageCount, siblingCount, boundaryCount })
  const back = previousIcon ?? (dir === 'rtl' ? '›' : '‹')
  const forward = nextIcon ?? (dir === 'rtl' ? '‹' : '›')
  const [box, rowText] = splitTextStyle([hozoClasses(className), hozoAuthoredStyle(style)])
  const role = getPageHref ? 'link' : 'button'

  const control = (
    key: string,
    target: number,
    label: string,
    content: ReactNode,
    state: 'current' | 'disabled' | 'idle',
  ) => {
    // Every class slot belongs to this host; current/disabled are not modality.
    const look = (interaction: InteractionState) => {
      // A disabled Web link has aria-disabled, not the button-only :disabled
      // pseudo-class. The current-page slot is gated independently below.
      const facts: PaginationSlotState = {
        ...interaction,
        disabled: !getPageHref && state === 'disabled',
        enabled: !getPageHref && state !== 'disabled',
        'aria-selected': false,
        'aria-disabled': Boolean(getPageHref) && state === 'disabled',
      }
      return splitTextStyle([
        hozoClasses(itemClassName, facts),
        hozoItemStyle?.(facts),
        hozoAuthoredStyle(itemStyle),
        state === 'current' && [
          hozoClasses(currentItemClassName, facts),
          hozoCurrentItemStyle?.(facts),
          hozoAuthoredStyle(currentItemStyle),
        ],
        state === 'disabled' && [
          hozoClasses(disabledItemClassName, facts),
          hozoDisabledItemStyle?.(facts),
          hozoAuthoredStyle(disabledItemStyle),
        ],
      ])
    }
    return (
      <Pressable
        key={key}
        accessibilityRole={role}
        accessibilityLabel={label}
        accessibilityState={{ selected: state === 'current', disabled: state === 'disabled' }}
        disabled={state === 'disabled'}
        style={(interaction) => look(interaction)[0]}
        onPress={() => go(target)}
      >
        {(interaction) =>
          typeof content === 'string' || typeof content === 'number' ? (
            <Text style={[rowText, look(interaction)[1]]}>{content}</Text>
          ) : (
            content
          )
        }
      </Pressable>
    )
  }

  const [ellipsisBox, ellipsisText] = splitTextStyle([
    hozoClasses(ellipsisClassName, nonControlSlotFacts),
    hozoAuthoredStyle(ellipsisStyle),
  ])
  return (
    <View style={[ROW, box]} testID={testID}>
      {control(
        'previous',
        current - 1,
        message('hozo.pagination.previous'),
        back,
        current <= 1 ? 'disabled' : 'idle',
      )}
      {items.map((item) =>
        item.type === 'ellipsis' ? (
          <View
            key={`ellipsis-${item.side}`}
            style={ellipsisBox}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[rowText, ellipsisText]}>…</Text>
          </View>
        ) : (
          control(
            String(item.page),
            item.page,
            message('hozo.pagination.page', { page: item.page }),
            item.page,
            item.page === current ? 'current' : 'idle',
          )
        ),
      )}
      {control(
        'next',
        current + 1,
        message('hozo.pagination.next'),
        forward,
        current >= pageCount ? 'disabled' : 'idle',
      )}
    </View>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }

export { HozoPagination as Pagination, type HozoPaginationProps as PaginationProps }
