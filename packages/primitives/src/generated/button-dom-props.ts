// What a Button's spread means on the Web, once the compiler has decided
// the element (#1096).
//
// `function B({ href, ...rest }) { return <Button {...rest} /> }` lowers to
// a `<button>` at build time (#656), but `rest` still holds the props in the
// primitive's vocabulary -- `onPress`, `accessibilityLabel` -- and spread raw
// onto the DOM they are unknown attributes. The click handler was the one
// that showed: an `@hozo/ui` Button that did nothing when clicked.
//
// So the spread goes through the same translation the uncompiled `Button`
// applies to its named props, and drops what that `Button` drops. Keys the
// spread does not hold are not set, because explicit attributes the
// compiler wrote before the spread must survive it.

import { type HozoDomStyle, hozoDomStyle } from '@hozo/engine'

type Props = Record<string, unknown>

const prevent = (event: { preventDefault(): void }) => event.preventDefault()

function common(props: Props, out: Props, name: string, value: unknown): boolean {
  switch (name) {
    case 'accessibilityLabel':
      out['aria-label'] = value
      return true
    case 'accessibilityHint':
      out['aria-description'] = value
      return true
    case 'testID':
      out['data-testid'] = value
      return true
    case 'nativeID':
      out.id = value
      return true
    case 'className':
    case 'children':
      out[name] = value
      return true
    case 'style':
      out.style = hozoDomStyle(value as HozoDomStyle)
      return true
  }
  if (name.startsWith('data-')) {
    out[name] = props[name]
    return true
  }
  return false
}

/** A Button's spread onto the `<button>` the compiler chose. */
export function hozoButtonDomProps<T>(props: T): T {
  if (!props || typeof props !== 'object') return props
  const source = props as Props
  const out: Props = {}
  for (const name in source) {
    if (!Object.hasOwn(source, name)) continue
    const value = source[name]
    if (common(source, out, name, value)) continue
    if (name === 'onPress') {
      out.onClick = value
      if (value) out['data-hozo-pressable'] = ''
    } else if (name === 'disabled') {
      out.disabled = value
      out['data-hozo-disabled'] = value ? '' : undefined
    }
    // Anything else -- link-only props with no href, unknown keys -- the
    // uncompiled Button does not forward either.
  }
  return out as T
}

/**
 * A Button's spread onto the `<a>` the compiler chose because it was given
 * an `href`. An anchor has no disabled state, so a press is suppressed
 * while disabled, as the compiler does for a named `onPress`. `disabled` is
 * the one the compiler saw named on the element, if any; one inside the
 * spread counts too.
 */
export function hozoLinkDomProps<T>(props: T, disabled?: unknown): T {
  if (!props || typeof props !== 'object') return props
  const source = props as Props
  const off = Boolean(disabled ?? source.disabled)
  const out: Props = {}
  for (const name in source) {
    if (!Object.hasOwn(source, name)) continue
    const value = source[name]
    if (common(source, out, name, value)) continue
    switch (name) {
      case 'onPress':
        out.onClick = off ? prevent : value
        break
      case 'disabled':
        out['aria-disabled'] = value ? true : undefined
        out['data-hozo-disabled'] = value ? '' : undefined
        out.tabIndex = value ? -1 : undefined
        if (value) {
          out.onClick ??= prevent
          out.onAuxClick = prevent
        }
        break
      case 'target':
      case 'rel':
      case 'download':
        out[name] = value
        break
    }
  }
  return out as T
}
