import {
  DismissableLayer,
  FocusScope,
  LiveRegion,
  Portal,
  useHozoI18n,
  useHozoMessage,
} from '@hozo/behaviors'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { nextActive, rankCommands } from './command-rules.ts'
import { useScrollLock } from './scroll-lock.ts'

export interface HozoCommand {
  /** Stable across renders; the option's identity. */
  id: string
  label: string
  /** The heading it is listed under. Commands without one come first. */
  group?: string
  /** Other words it is found by: "preferences" for "Settings". */
  keywords?: readonly string[]
  /** Shown beside the label -- "⌘S". Hidden from a reader, who has the label. */
  shortcut?: string
  disabled?: boolean
  onSelect: () => void
}

export interface HozoCommandPaletteProps {
  open?: boolean
  /** Called with `false` when the palette asks to close: Escape, a press outside, a command run. */
  onOpenChange?: (open: boolean) => void
  commands: readonly HozoCommand[]
  placeholder?: string
  /** The dialog's name, "Command palette" by default. */
  accessibilityLabel?: string
  /** False is for tests; see `Drawer`'s `portal`. */
  portal?: boolean
  className?: string
  scrimClassName?: string
  panelClassName?: string
  inputClassName?: string
  listClassName?: string
  groupHeadingClassName?: string
  itemClassName?: string
  /** Added to the command the arrow keys are on. */
  activeItemClassName?: string
  shortcutClassName?: string
  emptyClassName?: string
  testID?: string
}

/**
 * A searchable list of commands in a modal, opened from anywhere (#152).
 *
 * ## A dialog holding a combobox
 *
 * Focus moves into the field, Tab cannot leave the dialog, and Escape or a
 * press outside closes it and puts focus back where it was -- `Drawer`'s
 * composition, `Portal + FocusScope + DismissableLayer`. Inside, the field is
 * a `combobox` whose `aria-activedescendant` points at the command the arrow
 * keys are on, so a reader hears each one as it moves while focus stays where
 * typing goes. The commands are a `listbox`, grouped under their headings
 * with `role="group"`. Enter runs the active command and closes.
 *
 * How many commands match is announced politely as the query narrows them,
 * because a list that silently shrinks under a reader's typing gives them
 * nothing to go on until they arrow into it.
 *
 * Where the panel sits -- centred, near the top -- is the look, and is
 * `@hozo/ui`'s; this places nothing, as `Drawer` and `BottomSheet` do not.
 */
export function HozoCommandPalette({
  open = false,
  onOpenChange,
  commands,
  placeholder,
  accessibilityLabel,
  portal = true,
  className,
  scrimClassName,
  panelClassName,
  inputClassName,
  listClassName,
  groupHeadingClassName,
  itemClassName,
  activeItemClassName,
  shortcutClassName,
  emptyClassName,
  testID,
}: HozoCommandPaletteProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const base = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<number | null>(null)
  useScrollLock(open)

  // A palette opens empty, every time: last time's query is not this time's.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(null)
    }
  }, [open])

  const ranked = rankCommands(commands, query, locale)
  // Grouped in order of first appearance among the ranked results, so the
  // best match's group leads; within a group, rank order holds.
  const groups: { name: string | undefined; members: number[] }[] = []
  for (const index of ranked) {
    const name = commands[index]?.group
    const found = groups.find((group) => group.name === name)
    if (found) found.members.push(index)
    else groups.push({ name, members: [index] })
  }
  const order = groups.flatMap((group) => group.members)
  const current =
    active !== null && order.includes(active) ? active : nextActive(order, commands, null, 1)
  const optionId = (index: number) => `${base}-option-${index}`

  if (!open) return null

  const close = () => onOpenChange?.(false)
  const run = (index: number) => {
    const command = commands[index]
    if (!command || command.disabled) return
    close()
    command.onSelect()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(nextActive(order, commands, current, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(nextActive(order, commands, null, event.key === 'Home' ? 1 : -1))
    } else if (event.key === 'Enter' && current !== null && !event.nativeEvent.isComposing) {
      event.preventDefault()
      run(current)
    }
  }

  const count = order.length
  return (
    <Portal disabled={!portal}>
      <div className={className} data-testid={testID}>
        <div aria-hidden="true" className={scrimClassName} />
        <DismissableLayer onDismiss={close} style={{ display: 'contents' }}>
          <FocusScope trapped autoFocus restoreFocus style={{ display: 'contents' }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={message('hozo.commandPalette.label', {}, accessibilityLabel)}
              className={panelClassName}
            >
              <input
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${base}-list`}
                aria-autocomplete="list"
                aria-activedescendant={current === null ? undefined : optionId(current)}
                aria-label={
                  placeholder ?? message('hozo.commandPalette.label', {}, accessibilityLabel)
                }
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(null)
                }}
                onKeyDown={onKeyDown}
                className={inputClassName}
              />
              <div
                id={`${base}-list`}
                role="listbox"
                aria-label={message('hozo.commandPalette.label', {}, accessibilityLabel)}
                className={listClassName}
              >
                {groups.map((group, groupIndex) => {
                  const headingId = `${base}-group-${groupIndex}`
                  const items = group.members.map((index) => {
                    const command = commands[index] as HozoCommand
                    const isActive = index === current
                    return (
                      <div
                        key={command.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={command.disabled || undefined}
                        data-hozo-active={isActive ? '' : undefined}
                        className={
                          [itemClassName, isActive && activeItemClassName]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        // The field keeps focus; a press runs the command
                        // without taking it away first.
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => {
                          if (!command.disabled && index !== current) setActive(index)
                        }}
                        onClick={() => run(index)}
                      >
                        {command.label}
                        {command.shortcut ? (
                          <span aria-hidden className={shortcutClassName}>
                            {command.shortcut}
                          </span>
                        ) : null}
                      </div>
                    )
                  })
                  return group.name === undefined ? (
                    items
                  ) : (
                    <div key={group.name} role="group" aria-labelledby={headingId}>
                      <div id={headingId} role="presentation" className={groupHeadingClassName}>
                        {group.name}
                      </div>
                      {items}
                    </div>
                  )
                })}
              </div>
              {count === 0 ? (
                <div className={emptyClassName}>{message('hozo.commandPalette.empty')}</div>
              ) : null}
              <LiveRegion>
                {query.trim() === ''
                  ? ''
                  : count === 0
                    ? message('hozo.commandPalette.empty')
                    : count === 1
                      ? message('hozo.commandPalette.oneResult')
                      : message('hozo.commandPalette.results', { count })}
              </LiveRegion>
            </div>
          </FocusScope>
        </DismissableLayer>
      </div>
    </Portal>
  )
}

export {
  type HozoCommand as Command,
  HozoCommandPalette as CommandPalette,
  type HozoCommandPaletteProps as CommandPaletteProps,
}
