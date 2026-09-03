import {
  DismissableLayer,
  FloatingPositioner,
  isTypeaheadKey,
  nextIndex,
  nextSearch,
  type RovingKey,
  searchIndex,
  tabStops,
} from '@hozo/behaviors'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

export interface HozoMenuItem {
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

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
        <FloatingPositioner
          anchorRef={triggerRef}
          placement="bottom-start"
          offset={4}
          flip
          shift
          className="z-50"
        >
          {() => (
            <DismissableLayer onDismiss={() => close(false)}>
              <div
                role="menu"
                id={`${base}-menu`}
                aria-label={accessibilityLabel}
                className={menuClassName}
                onKeyDown={onMenuKeyDown}
              >
                {items.map((item, at) => (
                  <div
                    key={`item-${at}`}
                    ref={(node) => {
                      itemRefs.current[at] = node
                    }}
                    role="menuitem"
                    aria-disabled={item.disabled || undefined}
                    tabIndex={stops[at]}
                    className={itemClassName}
                    onClick={() => select(at)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            </DismissableLayer>
          )}
        </FloatingPositioner>
      ) : null}
    </div>
  )
}

export { HozoMenu as Menu, type HozoMenuItem as MenuItem, type HozoMenuProps as MenuProps }
