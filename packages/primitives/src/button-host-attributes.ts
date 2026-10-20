/** The documented DOM metadata channel; never forward arbitrary leftover props. */
export interface ButtonDataProps {
  [name: `data-${string}`]: string | number | boolean | undefined
}

export function buttonDataProps(props: ButtonDataProps): ButtonDataProps {
  const data: ButtonDataProps = {}
  for (const name in props) {
    if (Object.hasOwn(props, name) && name.startsWith('data-')) {
      data[name as `data-${string}`] = props[name as `data-${string}`]
    }
  }
  return data
}

/**
 * What a wrapper hands a Button to make it a trigger, by platform.
 *
 * `Tooltip` clones its child with a ref to position against, the handlers
 * that open it, and -- on the Web -- `aria-describedby` naming the bubble.
 * A Button that dropped them was a trigger nothing could hear (#1137).
 * Still a list rather than "every leftover prop": the rule above stands,
 * and these are the ones a known wrapper writes.
 */
export const BUTTON_TRIGGER_PROPS_WEB = [
  'ref',
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onPointerEnter',
  'onPointerLeave',
  'aria-describedby',
] as const

export const BUTTON_TRIGGER_PROPS_NATIVE = [
  'ref',
  'onFocus',
  'onBlur',
  'onHoverIn',
  'onHoverOut',
  'onLongPress',
] as const

export function buttonTriggerProps(
  props: Record<string, unknown>,
  names: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of names) {
    if (Object.hasOwn(props, name)) out[name] = props[name]
  }
  return out
}
