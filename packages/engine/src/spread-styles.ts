// A caller's spread composed after the styles compiled from a class, rather
// than replacing them (#1054).
//
// Compiled output calls this only for an element that has both a style
// compiled from its classes and a spread that might carry the same prop:
//
//     <Listbox {...hozoSpreadStyles({ style: hozoStyles.hozo0 }, [], rest)} />
//
// Every owner Hozo ships composes class styles first and the caller's style
// after; a spread re-emitted after the compiled attribute used to throw the
// compiled one away instead. Sources are copied in order, each once, the way
// JSX spreads them, so a getter on `rest` runs once and `rest.style` is never
// read a second time.

type StyleValue = unknown
type StyleFunction = (state: unknown) => StyleValue

function resolve(value: StyleValue, state: unknown): StyleValue {
  return typeof value === 'function' ? (value as StyleFunction)(state) : value
}

/** Class styles first, the caller's after; a pressable's style function stays one. */
function compose(
  compiled: StyleValue,
  own: StyleValue,
  normalize?: (value: StyleValue) => StyleValue,
): StyleValue {
  if (typeof compiled === 'function' || typeof own === 'function') {
    return (state: unknown) => {
      const generated = resolve(compiled, state)
      const author = resolve(own, state)
      return [generated, normalize ? normalize(author) : author]
    }
  }
  return [compiled, normalize ? normalize(own) : own]
}

/**
 * @param styles What was compiled for each style prop.
 * @param writtenLast Props whose compiled value already ends with a style the
 *   author wrote after every spread. In source that style replaced whatever a
 *   spread carried, so a spread's copy is dropped rather than composed.
 * @param sources The spreads, and any props written between them as
 *   one-entry objects, in source order.
 */
export function hozoSpreadStyles(
  styles: Readonly<Record<string, StyleValue>>,
  writtenLast: readonly string[],
  ...sources: readonly unknown[]
): Record<string, unknown> {
  return composeSpreadStyles(styles, writtenLast, sources)
}

/** Internal core shared by the ordinary and gap-aware generated boundaries. */
export function composeSpreadStyles(
  styles: Readonly<Record<string, StyleValue>>,
  writtenLast: readonly string[],
  sources: readonly unknown[],
  normalize?: (value: StyleValue) => StyleValue,
): Record<string, unknown> {
  let props: Record<string, unknown> = {}
  for (const source of sources) {
    // Object spread, not `Object.assign`: it defines rather than sets, so an
    // own `__proto__` key stays a key, exactly as `{...source}` in JSX.
    if (source != null) props = { ...props, ...(source as object) }
  }
  for (const [name, compiled] of Object.entries(styles)) {
    props[name] =
      !writtenLast.includes(name) && Object.hasOwn(props, name)
        ? compose(compiled, props[name], normalize)
        : compiled
  }
  return props
}
