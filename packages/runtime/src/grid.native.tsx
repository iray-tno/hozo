import { Children, isValidElement, type ReactNode, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import {
  type GridTrack,
  gridCellStyle,
  gridLayout,
  gridRowSizes,
  gridRows,
  gridTrackSizes,
} from './grid.ts'
import { keepIfSettled } from './measured.ts'

interface Props {
  tracks: readonly GridTrack[]
  rowTracks?: readonly GridTrack[]
  columnGap?: number
  rowGap?: number
  children?: ReactNode
}

/**
 * The first renderer for Hozo's grid solver boundary. It needs no
 * measurement: fixed tracks and fr tracks are solved by one Yoga flex row.
 * Empty cells preserve track widths on the final row.
 */
export function HozoGrid({
  tracks,
  rowTracks = [],
  columnGap = 0,
  rowGap = 0,
  children,
}: Props): ReactNode {
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<number[]>([])
  const list = Children.toArray(children)
  const placements = list.map((child) =>
    isValidElement<ItemProps>(child) && child.type === HozoGridItem
      ? {
          span: child.props.columnSpan ?? 1,
          columnStart: child.props.columnStart,
          rowSpan: child.props.rowSpan,
          rowStart: child.props.rowStart,
        }
      : { span: 1 },
  )
  const layout = gridLayout(placements, tracks.length)
  const measured =
    rowTracks.length > 0 ||
    placements.some((item) => (item.rowSpan ?? 1) > 1 || item.rowStart !== undefined)
  if (measured) {
    const columns = gridTrackSizes(tracks, width, columnGap)
    const rows = gridRowSizes(layout, heights, rowGap, rowTracks)
    const offsets = (sizes: readonly number[], gap: number) =>
      sizes.map((_, index) => sizes.slice(0, index).reduce((a, b) => a + b, 0) + index * gap)
    const left = offsets(columns, columnGap)
    const top = offsets(rows, rowGap)
    const totalHeight = rows.reduce((a, b) => a + b, 0) + Math.max(0, rows.length - 1) * rowGap
    const rememberHeight = (child: number) => (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height
      setHeights((current) => {
        const kept = keepIfSettled(current[child], height)
        return kept === current[child] ? current : Object.assign([...current], { [child]: kept })
      })
    }
    return (
      <View
        style={{ position: 'relative', alignSelf: 'stretch', height: totalHeight }}
        // Guarded, and its sibling above always was. This one was not,
        // and that asymmetry is the whole bug: the container height is
        // derived from the measured heights, so every height change
        // relaid the container out and fired this again. With the same
        // integer width React bails and it stops; with a width that
        // wobbles in the last decimal it never does.
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width
          setWidth((current) => keepIfSettled(current, next))
        }}
      >
        {layout.map((item) => {
          const cellWidth =
            columns.slice(item.column, item.column + item.columnSpan).reduce((a, b) => a + b, 0) +
            (item.columnSpan - 1) * columnGap
          const cellHeight =
            rows.slice(item.row, item.row + item.rowSpan).reduce((a, b) => a + b, 0) +
            (item.rowSpan - 1) * rowGap
          return (
            <View
              key={item.child}
              onLayout={rememberHeight(item.child)}
              style={{
                position: 'absolute',
                left: left[item.column],
                top: top[item.row],
                width: cellWidth,
                ...(cellHeight > 0 ? { height: cellHeight } : {}),
              }}
            >
              {unwrapGridItem(list[item.child])}
            </View>
          )
        })}
      </View>
    )
  }
  const rows = gridRows(placements, tracks)

  return rows.map((cells, row) => (
    // A grid cell is its coordinates. Rows and columns are generated from the
    // track counts rather than from data, so there is nothing else for one to
    // be, and two cells never trade places.
    // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its coordinates
    <View key={row} style={{ flexDirection: 'row', columnGap }}>
      {cells.map((cell, column) => (
        // A grid cell is its coordinates. Rows and columns are generated from the
        // track counts rather than from data, so there is nothing else for one to
        // be, and two cells never trade places.
        // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its coordinates
        <View key={column} style={gridCellStyle(cell.tracks, columnGap)}>
          {cell.child === null ? null : unwrapGridItem(list[cell.child])}
        </View>
      ))}
    </View>
  ))
}

interface ItemProps {
  columnSpan?: number
  columnStart?: number
  rowSpan?: number
  rowStart?: number
  children?: ReactNode
}

/** Compiler marker consumed by HozoGrid; outside one it is an identity wrapper. */
export function HozoGridItem({ children }: ItemProps): ReactNode {
  return children
}

function unwrapGridItem(child: ReactNode): ReactNode {
  return isValidElement<ItemProps>(child) && child.type === HozoGridItem
    ? child.props.children
    : child
}
