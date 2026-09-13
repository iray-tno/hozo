import { Heading, Paragraph, View } from '@hozo/core'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({ component: Post })

function Post() {
  const { postId } = Route.useParams()
  return (
    <View>
      <Heading level={1}>Post</Heading>
      <Paragraph>{postId}</Paragraph>
    </View>
  )
}
