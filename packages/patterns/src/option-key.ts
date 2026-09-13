// A React key for an option a widget selects by value.
//
// `Listbox` and `RadioGroup` identify an option by its `value` --
// selection is `chosen.includes(option.value)` -- and rendered it by its
// position: `key={`option-${at}`}`. Those two do not have to agree, and
// when they disagree React is told the wrong thing.
//
// Reorder the options while the selection stays put, and React sees the
// same keys in the same order holding different content. It keeps the DOM
// nodes and updates them in place, which is what it was asked to do. The
// props follow, so `aria-selected` and the roving `tabIndex` end up right
// -- but the browser's focus is on an *element*, not on a prop, and that
// element now shows a different option. A person tabbed to "France" and
// is now on "Germany" with nothing announced.
//
// `Tabs`, `Menu` and `Toolbar` key by position too and are right to: their
// API is positional throughout (`defaultIndex`, `onKeyDown(event, at)`),
// so position *is* the identity there. These two are the pair that says
// one thing and does the other.

/**
 * The identity of an option, as a string React can compare.
 *
 * `id` first, for a caller whose values are objects or whose two options
 * genuinely share one. Then the value itself, tagged with its type so a
 * `1` and a `'1'` stay apart -- they select differently, so they are
 * different options. Then position, for a value that has no stable string
 * form at all, which is where this started and is no worse than it was.
 *
 * A key is per-list, so this does not need to be unique in the world; it
 * needs to be the same option across two renders and a different one from
 * its neighbours. Two options sharing a primitive value collide here --
 * and they already select as one another, so the collision is a bug
 * surfacing rather than a bug added.
 */
export function optionKey(value: unknown, id: string | undefined, at: number): string {
  if (id !== undefined) return id
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
      return `${typeof value}:${String(value)}`
    default:
      return `at:${at}`
  }
}
