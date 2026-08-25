// A menu button: a control that opens a list of actions.
//
// Third on the same terms as `./dialog.tsx` and `./tabs.tsx` -- the rules
// are pure modules (`./roving.ts`, `./typeahead.ts`) and this is the glue.
// There is no platform element to hand it to, so the glue is the larger
// half here; what is worth reading is which of these behaviours is not
// optional, because a menu missing any one of them is a menu that keyboard
// users cannot use and that looks entirely correct.
//
//   - the button says `aria-haspopup` and `aria-expanded`
//   - ArrowDown opens onto the first item, ArrowUp onto the last
//   - the arrows move within, and the menu is one tab stop
//   - typing jumps
//   - Escape closes and puts focus back on the button
//   - choosing an item closes and puts focus back on the button
//
// The last two are the ones that get left out, and they are the ones that
// matter most: a menu that closes without returning focus drops the user
// at the top of the document, and nothing announces that it happened.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { nextIndex, tabStops, type RovingKey } from './roving.ts'
import { isTypeaheadKey, nextSearch, searchIndex } from './typeahead.ts'

export interface HozoMenuItem {
  /**
   * What the item says.
   *
   * A string rather than a node because typeahead has to match against it
   * and a screen reader has to read it. An item whose label is a picture
   * is an item nobody can search for.
   */
  label: string
  onSelect?: () => void
  disabled?: boolean
}

export interface HozoMenuProps {
  /** The button that opens the menu. */
  trigger: ReactNode
  items: readonly HozoMenuItem[]
  /** The menu's accessible name. Defaults to the button's own. */
  accessibilityLabel?: string
  className?: string
  triggerClassName?: string
  menuClassName?: string
  itemClassName?: string
}

export function HozoMenu({
  trigger,
  items,
  accessibilityLabel,
  className,
  triggerClassName,
  menuClassName,
  itemClassName,
}: HozoMenuProps) {
  const base = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const search = useRef({ text: '', at: 0 })

  const disabled = items.flatMap((item, at) => (item.disabled ? [at] : []))
  const labels = items.map((item) => item.label)

  // Every close goes through here, because every close owes the user their
  // focus back. A menu that closes and leaves focus on a removed element
  // drops it to the document body, and nothing says so -- the next Tab
  // starts from the top of the page.
  const close = useCallback((restore = true) => {
    setOpen(false)
    search.current = { text: '', at: 0 }
    if (restore) triggerRef.current?.focus()
  }, [])

  const openAt = (at: 'first' | 'last') => {
    const from = at === 'first' ? 0 : items.length - 1
    const step = at === 'first' ? 1 : -1
    let index = from
    while (index >= 0 && index < items.length && disabled.includes(index)) index += step
    setActive(index >= 0 && index < items.length ? index : 0)
    setOpen(true)
  }

  // Focus follows the active item while the menu is open. Done here rather
  // than in each handler so opening by any route lands in the same place.
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  // A click anywhere else closes it, and does *not* restore focus: the
  // pointer has already moved the user somewhere deliberately, and pulling
  // focus back to the button would undo that.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (target instanceof Node && triggerRef.current?.parentElement?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Opening onto the *last* item with ArrowUp is not symmetry for its
    // own sake: it is how someone reaches the bottom of a long menu
    // without arrowing through it.
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAt('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt('last')
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      // Tab closes too, and lets the browser move on. A menu that stayed
      // open behind the next control would be a second thing on screen
      // claiming to be where the user is.
      if (event.key === 'Escape') event.preventDefault()
      close()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(active)
      return
    }

    const moved = nextIndex(event.key as RovingKey, {
      count: items.length,
      active,
      orientation: 'vertical',
      disabled,
    })
    if (moved !== null) {
      event.preventDefault()
      setActive(moved)
      return
    }

    if (isTypeaheadKey(event.key, search.current.text !== '')) {
      const now = Date.now()
      const text = nextSearch(search.current.text, event.key, now - search.current.at)
      search.current = { text, at: now }
      const found = searchIndex(text, { labels, active, disabled })
      if (found !== null) {
        event.preventDefault()
        setActive(found)
      }
    }
  }

  const select = (at: number) => {
    if (items[at]?.disabled) return
    items[at]?.onSelect?.()
    close()
  }

  const stops = tabStops({ count: items.length, active, disabled })

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${base}-menu` : undefined}
        className={triggerClassName}
        onClick={() => (open ? close() : openAt('first'))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          id={`${base}-menu`}
          aria-label={accessibilityLabel}
          className={menuClassName}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, at) => (
            <div
              key={at}
              ref={(node) => {
                itemRefs.current[at] = node
              }}
              role="menuitem"
              // The same choice as the tab strip: announced and skipped,
              // rather than removed from the accessibility tree where it
              // becomes a gap nobody can be told about.
              aria-disabled={item.disabled || undefined}
              tabIndex={stops[at]}
              className={itemClassName}
              onClick={() => select(at)}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
