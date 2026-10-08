import type { CSSProperties, ReactNode, Ref } from 'react'

/**
 * A data table on the Web: the table elements themselves, which already lay
 * out their columns from every cell and give a reader row and column
 * navigation. These are what a file the compiler did not read renders;
 * compiled, the same names lower to the elements directly.
 *
 * The `Hozo…` names are the ones compiled Native output imports. They exist
 * here too so a module that names them type-checks on both platforms.
 */

interface PartProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  testID?: string
}

export interface HozoTableProps extends PartProps {
  /** Native only: scroll sideways when the table does not fit. */
  scrollable?: boolean
  accessibilityLabel?: string
}

export function HozoTable({
  children,
  className,
  style,
  testID,
  accessibilityLabel,
}: HozoTableProps) {
  return (
    <table className={className} style={style} data-testid={testID} aria-label={accessibilityLabel}>
      {children}
    </table>
  )
}

export type HozoTableCaptionProps = PartProps

export function HozoTableCaption({ children, className, style }: HozoTableCaptionProps) {
  return (
    <caption className={className} style={style}>
      {children}
    </caption>
  )
}

export interface HozoTableSectionProps extends PartProps {
  section?: 'header' | 'body' | 'footer'
}

export function HozoTableSection({
  section = 'body',
  children,
  className,
  style,
}: HozoTableSectionProps) {
  const Tag = section === 'header' ? 'thead' : section === 'footer' ? 'tfoot' : 'tbody'
  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  )
}

export type HozoTableRowProps = PartProps

export function HozoTableRow({ children, className, style }: HozoTableRowProps) {
  return (
    <tr className={className} style={style}>
      {children}
    </tr>
  )
}

export interface HozoTableCellProps extends PartProps {
  /** The cell element, for focusing or measuring it. */
  ref?: Ref<HTMLTableCellElement>
  head?: boolean
  scope?: 'col' | 'row'
  colSpan?: number
  accessibilityLabel?: string
}

export function HozoTableCell({
  head,
  scope,
  colSpan,
  accessibilityLabel,
  children,
  className,
  style,
  ref,
}: HozoTableCellProps) {
  return head ? (
    <th
      ref={ref}
      scope={scope ?? 'col'}
      colSpan={colSpan}
      aria-label={accessibilityLabel}
      className={className}
      style={style}
    >
      {children}
    </th>
  ) : (
    <td
      ref={ref}
      colSpan={colSpan}
      aria-label={accessibilityLabel}
      className={className}
      style={style}
    >
      {children}
    </td>
  )
}

export function TableHeader(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="header" />
}
export function TableBody(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="body" />
}
export function TableFooter(props: Omit<HozoTableSectionProps, 'section'>) {
  return <HozoTableSection {...props} section="footer" />
}
export function TableHead(props: Omit<HozoTableCellProps, 'head'>) {
  return <HozoTableCell {...props} head />
}

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
