import { HozoTextSizeContext } from '@hozo/engine/generated/text-size-context'
import { HozoFlatList } from '@hozo/primitives/generated/flat-list'
import { type ComponentProps, type ReactNode, useContext } from 'react'
import { type FlatList, type FlatListProps, Platform, ScrollView, Text, View } from 'react-native'
import { useWindowedTable, type WindowedTableProps } from './windowed-table-types.ts'

export type { WindowedTableColumn, WindowedTableProps } from './windowed-table-types.ts'

// Metro selects the Native leaf; the package's default TypeScript condition
// describes the Web list instead. Keep that bridge local to the Native owner.
const NativeList = HozoFlatList as unknown as typeof FlatList
type CellProps = ComponentProps<NonNullable<FlatListProps<unknown>['CellRendererComponent']>>

function TableListCell({ children, style, onLayout, onFocusCapture }: CellProps) {
  // The individual table cells carry two-dimensional absolute indices. Avoid
  // the list wrapper's separate one-dimensional item metadata, but retain the
  // handlers VirtualizedList needs for layout and focus tracking.
  return (
    <View style={style} onLayout={onLayout} onFocusCapture={onFocusCapture}>
      {children}
    </View>
  )
}

function TableCell({
  label,
  content,
  width,
  height,
  rowIndex,
  columnIndex,
  heading = false,
}: {
  label: string
  content: ReactNode
  width: number
  height: number
  rowIndex: number
  columnIndex: number
  heading?: boolean
}) {
  const fontSize = useContext(HozoTextSizeContext)
  const metadata =
    Platform.OS === 'android'
      ? {
          accessibilityCollectionItem: {
            rowIndex,
            columnIndex,
            rowSpan: 1,
            columnSpan: 1,
            heading,
          },
        }
      : {}
  return (
    <View
      {...metadata}
      accessible
      collapsable={false}
      accessibilityLabel={label}
      style={{ width, height, flexShrink: 0, overflow: 'hidden' }}
    >
      {/* Keep padding inside the clip: Yoga otherwise grows a sub-8px cell. */}
      <View
        style={{ padding: 4 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {typeof content === 'string' || typeof content === 'number' ? (
          <Text numberOfLines={1} style={{ fontSize, lineHeight: fontSize * 1.5 }}>
            {content}
          </Text>
        ) : (
          content
        )}
      </View>
    </View>
  )
}

/** Fixed geometry, no natural-width probes and no offscreen cell formatting. */
export function WindowedTable<Row>(props: WindowedTableProps<Row>) {
  const { data, columns, rowHeight, accessibilityLabel } = props
  const { width, height, keys } = useWindowedTable(props)
  return (
    <ScrollView
      horizontal
      style={{ height, flexGrow: 0 }}
      contentContainerStyle={{ width, height }}
    >
      <NativeList
        data={data}
        accessibilityLabel={accessibilityLabel}
        style={{ width, height, flexGrow: 0 }}
        keyExtractor={(_row, index) => keys[index]!}
        getItemLayout={(_data, index) => ({
          length: rowHeight,
          offset: (index + 1) * rowHeight,
          index,
        })}
        initialNumToRender={Math.max(1, Math.ceil(height / rowHeight))}
        maxToRenderPerBatch={8}
        windowSize={3}
        removeClippedSubviews={false}
        CellRendererComponent={TableListCell}
        extraData={columns}
        ListHeaderComponent={
          <View style={{ width, height: rowHeight, flexDirection: 'row' }}>
            {columns.map((column, columnIndex) => (
              <TableCell
                key={column.key}
                width={column.width}
                height={rowHeight}
                content={column.header}
                label={column.header}
                rowIndex={0}
                columnIndex={columnIndex}
                heading
              />
            ))}
          </View>
        }
        renderItem={({ item: row, index }) => (
          <View style={{ width, height: rowHeight, flexDirection: 'row' }}>
            {columns.map((column, columnIndex) => {
              const text = column.getText(row)
              return (
                <TableCell
                  key={column.key}
                  width={column.width}
                  height={rowHeight}
                  content={column.renderCell ? column.renderCell(text, row) : text}
                  label={`${column.header}, ${text}`}
                  rowIndex={index + 1}
                  columnIndex={columnIndex}
                />
              )
            })}
          </View>
        )}
      />
    </ScrollView>
  )
}
