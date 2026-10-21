import { Paragraph, View } from '@hozo/core'
import { Pagination } from '@hozo/ui'
import { useState } from 'react'

export function PaginationDemo() {
  const [page, setPage] = useState(6)
  return (
    <View className="items-start gap-3">
      <Pagination page={page} pageCount={20} onPageChange={setPage} />
      <Paragraph className="text-sm text-hozo-text-body">{`Showing page ${page} of 20`}</Paragraph>
    </View>
  )
}
