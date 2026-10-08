// The semantics added for #141 and #144, in one place a reader can walk: a
// table with its caption and headers, a meter, a count badge, and a
// skeleton that says nothing at all.
//
// The table is the Web's own, so a reader can move by row and column and
// hears each cell with its header; the meter is `<meter>`; the count badge
// draws "3" and is read as its sentence; the skeleton is hidden from
// assistive technology, and hearing nothing there is the expected result.

import { Badge, Meter, Skeleton } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import {
  Section,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

const ORDERS = [
  { item: 'Tea', quantity: 2, price: '$8' },
  { item: 'Shortbread', quantity: 1, price: '$12' },
]

function DataDisplayGallery() {
  return (
    <View className="max-w-2xl space-y-8 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Data display
        </Heading>
        <Paragraph className="text-slate-700">
          A table, a meter, a count badge and a skeleton.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Table className="w-full border-collapse text-sm text-slate-800">
          <TableCaption className="pb-2 text-left font-semibold">Your order</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="border-b border-slate-300 px-2 py-1 text-left">Item</TableHead>
              <TableHead className="border-b border-slate-300 px-2 py-1 text-right">
                Quantity
              </TableHead>
              <TableHead className="border-b border-slate-300 px-2 py-1 text-right">
                Price
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ORDERS.map((order) => (
              <TableRow key={order.item}>
                <TableHead scope="row" className="px-2 py-1 text-left font-normal">
                  {order.item}
                </TableHead>
                <TableCell className="px-2 py-1 text-right">{order.quantity}</TableCell>
                <TableCell className="px-2 py-1 text-right">{order.price}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableHead scope="row" className="border-t border-slate-300 px-2 py-1 text-left">
                Total
              </TableHead>
              <TableCell className="border-t border-slate-300 px-2 py-1" />
              <TableCell className="border-t border-slate-300 px-2 py-1 text-right font-semibold">
                $20
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Section>

      <Section className="space-y-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Storage
        </Text>
        <Meter value={0.6} low={0.5} high={0.9} optimum={0} accessibilityLabel="Disk usage" />
      </Section>

      <Section className="space-y-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">Inbox</Text>
        <Badge
          count={3}
          accessibilityLabel="3 unread messages"
          className="self-start rounded-full bg-red-700 px-2 text-xs font-semibold text-white"
        />
      </Section>

      <Section className="space-y-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Loading
        </Text>
        <Skeleton className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Semantics/Data Display',
  component: DataDisplayGallery,
} satisfies Meta<typeof DataDisplayGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
