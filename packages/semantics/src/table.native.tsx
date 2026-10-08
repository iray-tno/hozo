import {
  Children,
  type ComponentRef,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type LayoutChangeEvent,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

/**
 * A data table on React Native, which has none.
 *
 * ## The columns are sized the way a browser sizes them
 *
 * A Web table's columns are as wide as their widest cell, so every row lines
 * up; a React Native row is a flex row that knows nothing of the rows above
 * it. So the table measures: each cell renders at its natural width first,
 * reports it, and every cell in a column is then given the widest. That is
 * the browser's automatic table layout (CSS 2.2 section 17.5.2.2), reduced
 * to what a reader of the result can see:
 *
 * - a table is as wide as its columns, unless it is told to fill (`w-full`),
 *   when the room left over is shared in proportion to the columns' widths;
 * - a table wider than the room it has shrinks its columns in the same
 *   proportion and lets their text wrap -- or, with `scrollable`, keeps its
 *   width and scrolls sideways;
 * - a cell spanning columns takes their sum and is not measured into them.
 *
 * The table is invisible until the measurement is in, so the frame with
 * every row its own width is never seen; a change to a cell's text measures
 * again.
 *
 * ## A reader hears the column with the cell
 *
 * Android has no table role and no table navigation, so a data cell whose
 * content is text is named with its column's header -- "Price, $12" -- and
 * every cell carries `accessibilityCollectionItem`, the row and column
 * TalkBack reads where it has a collection to read them against.
 */

type Element = ReactElement<Record<string, unknown>>

interface ColumnInfo {
  widths: readonly number[] | null
  headers: readonly (string | undefined)[]
  measuring: boolean
  report: (key: string, column: number, width: number) => void
}

const TableContext = createContext<ColumnInfo | null>(null)
const RowContext = createContext<{ row: number } | null>(null)
const CellContext = createContext<{ column: number; span: number } | null>(null)

/** The words in a cell, for naming it, or `undefined` if it holds more. */
function textOf(node: ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    const parts = node.map(textOf)
    return parts.every((part) => part !== undefined) ? parts.join('') : undefined
  }
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return undefined
}

const elements = (children: ReactNode) =>
  Children.toArray(children).filter(isValidElement) as Element[]

/**
 * What a child of the table is: read off a marker on its component rather
 * than by identity, so `TableHeader` and `TableHead` -- the names an
 * uncompiled file renders -- are recognised as the section and the header
 * cell they stand for.
 */
type Part = 'section' | 'row' | 'cell' | 'head'
const part = (element: Element): Part | undefined =>
  (element.type as { hozoTablePart?: Part }).hozoTablePart
const isHeadCell = (cell: Element) => part(cell) === 'head' || isHead(cell.props.head)

const span = (cell: Element) =>
  typeof cell.props.colSpan === 'number' && cell.props.colSpan > 1 ? cell.props.colSpan : 1

/**
 * Rows in document order and the cells in each, read off the element tree
 * rather than counted as they render, so the numbering does not depend on
 * render order and survives `rows.map(...)`.
 */
function structure(children: ReactNode): Element[][] {
  const rows: Element[] = []
  for (const child of elements(children)) {
    if (part(child) === 'section') rows.push(...elements(child.props.children as ReactNode))
    else if (part(child) === 'row') rows.push(child)
  }
  return rows.map((row) => elements(row.props.children as ReactNode))
}

export interface HozoTableProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle | TextStyle>
  /** Keep the table's width and scroll sideways when it does not fit. */
  scrollable?: boolean
  accessibilityLabel?: string
  testID?: string
  /** Read by the compiler; see `SemanticsNativeProps.className`. */
  className?: string
}

export function HozoTable({
  children,
  style,
  scrollable,
  accessibilityLabel,
  testID,
}: HozoTableProps) {
  const rows = structure(children)
  const columnCount = Math.max(
    0,
    ...rows.map((cells) => cells.reduce((sum, cell) => sum + span(cell), 0)),
  )
  // What the measurement depends on: every cell's text, and the shape. A
  // cell holding more than text contributes only its place.
  const signature = rows
    .map((cells) =>
      cells
        .map((cell) => `${span(cell)}:${textOf(cell.props.children as ReactNode) ?? '*'}`)
        .join('|'),
    )
    .join('\n')
  const headers: (string | undefined)[] = []
  for (const cells of rows) {
    let column = 0
    for (const cell of cells) {
      if (isHeadCell(cell) && cell.props.scope !== 'row' && headers[column] === undefined) {
        headers[column] = textOf(cell.props.children as ReactNode)
      }
      column += span(cell)
    }
  }

  const measured = useRef(new Map<string, { column: number; width: number }>())
  const takenFor = useRef(signature)
  if (takenFor.current !== signature) {
    // The cells changed since these were taken: start again.
    measured.current = new Map()
    takenFor.current = signature
  }
  const [natural, setNatural] = useState<number[] | null>(null)
  const [measuredFor, setMeasuredFor] = useState<string | null>(null)
  const [available, setAvailable] = useState<number | null>(null)
  const measuring = measuredFor !== signature
  const expected = rows.reduce(
    (sum, cells) => sum + cells.filter((cell) => span(cell) === 1).length,
    0,
  )

  const report = useCallback(
    (key: string, column: number, width: number) => {
      measured.current.set(key, { column, width })
      if (measured.current.size < expected) return
      const widths = Array.from({ length: columnCount }, () => 0)
      for (const entry of measured.current.values()) {
        widths[entry.column] = Math.max(widths[entry.column] ?? 0, entry.width)
      }
      setNatural(widths)
      setMeasuredFor(signature)
    },
    [columnCount, expected, signature],
  )

  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle
  const fills = flat.width !== undefined || flat.flex !== undefined || flat.alignSelf === 'stretch'
  const widths = useMemo(() => {
    if (!natural || measuring) return null
    const total = natural.reduce((sum, w) => sum + w, 0)
    if (available === null || total === 0) return natural
    const scale =
      (fills && total < available) || (!scrollable && total > available) ? available / total : 1
    return natural.map((w) => w * scale)
  }, [available, fills, measuring, natural, scrollable])

  const info: ColumnInfo = { widths, headers, measuring, report }
  const table = (
    <View
      style={[TABLE, style, measuring ? HIDDEN : null]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <TableContext.Provider value={info}>{numbered(children)}</TableContext.Provider>
    </View>
  )
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setAvailable(event.nativeEvent.layout.width)}
      style={OUTER}
    >
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </View>
  )
}

const isHead = (value: unknown) => value !== undefined && value !== false

/** Gives each row its index in document order, sections included. */
function numbered(children: ReactNode): ReactNode {
  let row = 0
  const wrap = (child: Element): ReactNode => {
    const index = row++
    return (
      <RowContext.Provider key={child.key ?? index} value={{ row: index }}>
        {child}
      </RowContext.Provider>
    )
  }
  return elements(children).map((child) => {
    if (part(child) === 'section') {
      const rows = elements(child.props.children as ReactNode).map(wrap)
      return { ...child, props: { ...child.props, children: rows } }
    }
    if (part(child) === 'row') return wrap(child)
    return child
  })
}

export interface HozoTableSectionProps {
  children?: ReactNode
  section?: 'header' | 'body' | 'footer'
  style?: StyleProp<ViewStyle>
  testID?: string
  /** Read by the compiler; see `SemanticsNativeProps.className`. */
  className?: string
}

/** `<thead>`, `<tbody>` or `<tfoot>`: a group of rows, and nothing to read. */
export function HozoTableSection({ children, style, testID }: HozoTableSectionProps) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  )
}

export interface HozoTableRowProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
  /** Read by the compiler; see `SemanticsNativeProps.className`. */
  className?: string
}

/** `<tr>`: numbers its cells, columns spanned included. */
export function HozoTableRow({ children, style, testID }: HozoTableRowProps) {
  let column = 0
  return (
    <View style={[ROW, style]} testID={testID}>
      {elements(children).map((cell, index) => {
        const at = column
        column += span(cell)
        return (
          <CellContext.Provider key={cell.key ?? index} value={{ column: at, span: span(cell) }}>
            {cell}
          </CellContext.Provider>
        )
      })}
    </View>
  )
}

export interface HozoTableCellProps {
  children?: ReactNode
  /** A header cell: `<th>`. */
  head?: boolean
  /** `"row"` for a header that heads its row rather than its column. */
  scope?: 'col' | 'row'
  colSpan?: number
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle | TextStyle>
  testID?: string
  /** Read by the compiler; see `SemanticsNativeProps.className`. */
  className?: string
  /**
   * The cell's View: for focusing it, or measuring where it landed. A prop
   * rather than `forwardRef`, as React 19 hands a function component its ref.
   */
  ref?: Ref<ComponentRef<typeof View>>
}

/** What a `View` cannot draw: handed to the cell's `Text`. */
const TEXT_KEYS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationLine',
  'textTransform',
])

/** `<th>` or `<td>`. */
export function HozoTableCell({
  children,
  head,
  scope,
  accessibilityLabel,
  style,
  testID,
  ref,
}: HozoTableCellProps) {
  const table = useContext(TableContext)
  const row = useContext(RowContext)
  const cell = useContext(CellContext) ?? { column: 0, span: 1 }
  const key = `${row?.row ?? 0}:${cell.column}`
  const box: Record<string, unknown> = {}
  const text: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    ;(TEXT_KEYS.has(name) ? text : box)[name] = value
  }
  const width = table?.widths
    ? table.widths.slice(cell.column, cell.column + cell.span).reduce((sum, w) => sum + w, 0)
    : undefined
  const words = textOf(children)
  const header = isHead(head)
  const columnHeader = table?.headers[cell.column]
  const label =
    accessibilityLabel ??
    (!header && words !== undefined && columnHeader ? `${columnHeader}, ${words}` : undefined)

  return (
    <View
      ref={ref}
      style={[CELL, box, width !== undefined ? { width } : null]}
      testID={testID}
      onLayout={
        table?.measuring && cell.span === 1
          ? (event: LayoutChangeEvent) =>
              table.report(key, cell.column, event.nativeEvent.layout.width)
          : undefined
      }
      accessible={words !== undefined ? true : undefined}
      accessibilityLabel={label}
      // Not `accessibilityRole="header"`: TalkBack calls that a heading and
      // puts it in heading navigation, so every column header became a stop
      // there -- "Price, Heading" (#804). A `<th>` is not a heading on the
      // Web either; that a cell heads its column is in its collection item.
      // A View prop on Android that React Native's types do not declare;
      // `BaseViewManager` reads it and `ReactAccessibilityDelegate` turns
      // it into the node's `CollectionItemInfo`.
      {...({
        accessibilityCollectionItem: {
          rowIndex: row?.row ?? 0,
          rowSpan: 1,
          columnIndex: cell.column,
          columnSpan: cell.span,
          heading: header && scope !== 'row',
        },
      } as object)}
    >
      {words !== undefined ? <Text style={text}>{children}</Text> : children}
    </View>
  )
}

export interface HozoTableCaptionProps {
  children?: ReactNode
  style?: StyleProp<TextStyle>
  testID?: string
  /** Read by the compiler; see `SemanticsNativeProps.className`. */
  className?: string
}

/** `<caption>`: the table's name, above it. */
export function HozoTableCaption({ children, style, testID }: HozoTableCaptionProps) {
  return (
    <Text style={style} testID={testID}>
      {children}
    </Text>
  )
}

const OUTER: ViewStyle = { alignSelf: 'stretch' }
// Shrink-to-fit, as a Web table with no width is.
const TABLE: ViewStyle = { alignSelf: 'flex-start' }
const ROW: ViewStyle = { flexDirection: 'row' }
const CELL: ViewStyle = { flexShrink: 0 }
const HIDDEN: ViewStyle = { opacity: 0 }

HozoTableSection.hozoTablePart = 'section' as const
HozoTableRow.hozoTablePart = 'row' as const
HozoTableCell.hozoTablePart = 'cell' as const

/**
 * The names a file the compiler did not read renders. Compiled, each is
 * lowered to the component above it.
 */
export function TableHeader(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="header" />
}
TableHeader.hozoTablePart = 'section' as const
export function TableBody(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="body" />
}
TableBody.hozoTablePart = 'section' as const
export function TableFooter(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="footer" />
}
TableFooter.hozoTablePart = 'section' as const
export function TableHead(props: Omit<HozoTableCellProps, 'head'>) {
  return <HozoTableCell {...props} head />
}
TableHead.hozoTablePart = 'head' as const

export {
  HozoTable as Table,
  HozoTableCaption as TableCaption,
  type HozoTableCaptionProps as TableCaptionProps,
  HozoTableCell as TableCell,
  type HozoTableCellProps as TableCellProps,
  type HozoTableProps as TableProps,
  HozoTableRow as TableRow,
  type HozoTableRowProps as TableRowProps,
  type HozoTableSectionProps as TableSectionProps,
}
