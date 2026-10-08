// Pagination: a navigation landmark named "Pagination", each page "Page 5",
// the current one "current page", previous and next disabled at the ends
// rather than removed, and the ellipses silent. With `getPageHref` every page
// is a link, which a reader announces as somewhere to go.

import { Pagination } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const ROW = 'flex flex-row flex-wrap items-center gap-1 text-sm text-slate-800'
const ITEM =
  'inline-flex min-w-9 h-9 items-center justify-center rounded-md px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const CURRENT = 'bg-indigo-700 text-white'
const DISABLED = 'text-slate-500'

function PaginationGallery({ links = false }: { links?: boolean }) {
  const [page, setPage] = useState(5)
  return (
    <View className="max-w-2xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Pagination{links ? ' with links' : ''}
        </Heading>
        <Paragraph className="text-slate-700">
          Page {page} of 20. The current page and the disabled ends are styled by class lists the
          pattern applies, so the same look reaches React Native.
        </Paragraph>
      </View>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Catalogue
        </Text>
        <Pagination
          page={page}
          pageCount={20}
          onPageChange={setPage}
          getPageHref={links ? (p) => `#page-${p}` : undefined}
          className={ROW}
          itemClassName={ITEM}
          currentItemClassName={CURRENT}
          disabledItemClassName={DISABLED}
          ellipsisClassName="px-1 text-slate-600"
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Pagination',
  component: PaginationGallery,
} satisfies Meta<typeof PaginationGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Links: StoryObj<typeof meta> = { args: { links: true } }
