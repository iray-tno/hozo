// Lays out compiled JSX for the REPL's panes, one element per line.
//
// The compiler writes each component back as a single line on purpose: it
// replaces a span of the author's file, and output spread over several lines
// would move every line below it, so stack traces and source maps would stop
// pointing at the source. The REPL shows that output as it is, which is
// correct and unreadable. Laying it out is a display concern, so it happens
// here and nowhere else.
//
// Deliberately small rather than a formatter. It understands exactly what the
// compiler emits -- elements, fragments, quoted and braced attribute values,
// spreads, text and `{expressions}` -- and anything it cannot follow is
// returned unchanged, so the worst it can do is show the one line the compiler
// wrote. Expressions are not re-laid out inside: `{items.map(...)}` stays as
// written.

type JsxNode =
  | { kind: 'element'; name: string; attrs: string[]; selfClosing: boolean; children: JsxNode[] }
  | { kind: 'text'; text: string }
  | { kind: 'expression'; text: string }

class Unparseable extends Error {}

/** The index just past a quoted string starting at `start`. */
function skipString(source: string, start: number): number {
  const quote = source[start]
  let at = start + 1
  while (at < source.length) {
    const character = source[at]
    if (character === '\\') {
      at += 2
      continue
    }
    if (quote === '`' && character === '$' && source[at + 1] === '{') {
      at = skipBraces(source, at + 1)
      continue
    }
    if (character === quote) return at + 1
    at += 1
  }
  throw new Unparseable('unterminated string')
}

/** The index just past the `}` matching the `{` at `start`. */
function skipBraces(source: string, start: number): number {
  let depth = 0
  let at = start
  while (at < source.length) {
    const character = source[at]
    if (character === '"' || character === "'" || character === '`') {
      at = skipString(source, at)
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return at + 1
    }
    at += 1
  }
  throw new Unparseable('unbalanced braces')
}

const NAME = /[A-Za-z0-9_.:$-]/

function parse(source: string): JsxNode[] {
  let at = 0

  function readName(): string {
    const start = at
    while (at < source.length && NAME.test(source[at] as string)) at += 1
    return source.slice(start, at)
  }

  function skipSpace() {
    while (at < source.length && /\s/.test(source[at] as string)) at += 1
  }

  function readElement(): JsxNode {
    at += 1 // `<`
    const name = readName()
    const attrs: string[] = []
    for (;;) {
      skipSpace()
      if (at >= source.length) throw new Unparseable('unterminated tag')
      if (source.startsWith('/>', at)) {
        at += 2
        return { kind: 'element', name, attrs, selfClosing: true, children: [] }
      }
      if (source[at] === '>') {
        at += 1
        break
      }
      const start = at
      if (source[at] === '{') {
        at = skipBraces(source, at) // `{...spread}`
      } else {
        if (readName() === '') throw new Unparseable('expected an attribute')
        if (source[at] === '=') {
          at += 1
          const opener = source[at]
          if (opener === '"' || opener === "'") at = skipString(source, at)
          else if (opener === '{') at = skipBraces(source, at)
          else throw new Unparseable('expected an attribute value')
        }
      }
      attrs.push(source.slice(start, at))
    }
    const children = readChildren(name)
    return { kind: 'element', name, attrs, selfClosing: false, children }
  }

  function readChildren(closing: string | undefined): JsxNode[] {
    const children: JsxNode[] = []
    while (at < source.length) {
      if (source.startsWith('</', at)) {
        if (closing === undefined) throw new Unparseable('a closing tag with nothing open')
        at += 2
        const name = readName()
        skipSpace()
        if (name !== closing || source[at] !== '>') throw new Unparseable('mismatched closing tag')
        at += 1
        return children
      }
      if (source[at] === '<') {
        children.push(readElement())
      } else if (source[at] === '{') {
        const start = at
        at = skipBraces(source, at)
        children.push({ kind: 'expression', text: source.slice(start, at) })
      } else {
        const start = at
        while (at < source.length && source[at] !== '<' && source[at] !== '{') at += 1
        const text = source.slice(start, at).replace(/\s+/g, ' ').trim()
        if (text !== '') children.push({ kind: 'text', text })
      }
    }
    if (closing !== undefined) throw new Unparseable(`<${closing}> is never closed`)
    return children
  }

  return readChildren(undefined)
}

function print(nodes: JsxNode[], indent: string, width: number): string[] {
  const lines: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'element') {
      lines.push(indent + node.text)
      continue
    }
    const head = node.attrs.length > 0 ? `<${node.name} ${node.attrs.join(' ')}` : `<${node.name}`
    const end = node.selfClosing ? ' />' : '>'
    const openLines =
      indent.length + head.length + end.length > width && node.attrs.length > 1
        ? [
            `${indent}<${node.name}`,
            ...node.attrs.map((attr) => `${indent}  ${attr}`),
            `${indent}${node.selfClosing ? '/>' : '>'}`,
          ]
        : [indent + head + end]
    if (node.selfClosing) {
      lines.push(...openLines)
      continue
    }
    const closing = `</${node.name}>`
    // Text and expressions only, and short enough: one line, the way a
    // person writes `<Text className="...">Welcome</Text>`.
    const inline = node.children.every((child) => child.kind !== 'element')
    if (inline && openLines.length === 1) {
      const line = `${openLines[0]}${node.children.map((child) => (child as { text: string }).text).join(' ')}${closing}`
      if (line.length <= width) {
        lines.push(line)
        continue
      }
    }
    lines.push(...openLines)
    lines.push(...print(node.children, `${indent}  `, width))
    lines.push(indent + closing)
  }
  return lines
}

/** `code` laid out one element per line, or `code` itself if it cannot be followed. */
export function formatJsx(code: string, width = 80): string {
  try {
    const nodes = parse(code.trim())
    if (nodes.length === 0) return code
    return print(nodes, '', width).join('\n')
  } catch (error) {
    if (error instanceof Unparseable) return code
    throw error
  }
}
