import type { useHozoMessage } from '@hozo/behaviors'
import { formatFileSize, type HozoFileRejection, type HozoPickedFile } from './file-rules.ts'

type Message = ReturnType<typeof useHozoMessage>

/**
 * What a reader is told after a pick: what was added, and each refusal with
 * its reason. One sentence per thing, joined, because a pick is one event and
 * splitting it into announcements lets the later ones talk over the first.
 */
export function pickAnnouncement(
  message: Message,
  accepted: readonly HozoPickedFile[],
  rejected: readonly HozoFileRejection[],
  limits: { maxSize?: number; maxFiles?: number },
  locale?: string,
): string {
  const parts: string[] = []
  if (accepted.length === 1) {
    const [only] = accepted as [HozoPickedFile]
    parts.push(
      message('hozo.fileDropzone.selectedOne', {
        name: only.name,
        size: formatFileSize(only.size, locale),
      }),
    )
  } else if (accepted.length > 1) {
    parts.push(message('hozo.fileDropzone.selectedMany', { count: accepted.length }))
  }
  for (const { file, reason } of rejected) {
    const size = formatFileSize(file.size, locale)
    parts.push(
      reason === 'type'
        ? message('hozo.fileDropzone.wrongType', { name: file.name })
        : reason === 'too-large'
          ? message('hozo.fileDropzone.tooLarge', {
              name: file.name,
              size,
              limit: formatFileSize(limits.maxSize ?? 0, locale),
            })
          : reason === 'too-small'
            ? message('hozo.fileDropzone.tooSmall', { name: file.name, size })
            : message('hozo.fileDropzone.tooMany', { name: file.name, max: limits.maxFiles ?? 1 }),
    )
  }
  return parts.join('. ')
}
