// The compiler reads a `cx(...)` call argument by argument, as it reads
// `clsx`, so a component can merge a caller's className and still have its
// own classes compiled, `hover:` and `disabled:` included on Native (#873).
// This body only runs where the compiler did not take the call apart. It
// has to agree with the compiler's reading, which is why it accepts strings
// and nothing that clsx would expand, such as objects and arrays.

export type CxValue = string | false | null | undefined

/** Joins the truthy class strings with a space, as `clsx` does for strings. */
export function cx(...classes: CxValue[]): string {
  let joined = ''
  for (const value of classes) {
    if (!value) continue
    joined = joined ? `${joined} ${value}` : value
  }
  return joined
}
