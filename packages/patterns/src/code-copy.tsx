import { LiveRegion, useHozoMessage } from '@hozo/behaviors'
import { type CSSProperties, useContext, useEffect, useRef, useState } from 'react'
import { CodeClipboardContext } from './code-clipboard.tsx'

export function CodeCopy({
  text,
  className,
  style,
}: {
  text: string
  className?: string
  style?: CSSProperties
}) {
  const provider = useContext(CodeClipboardContext)
  const message = useHozoMessage()
  const [available, setAvailable] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ channel: 0 | 1; message: string } | null>(null)
  const notify = (notice: string) =>
    setFeedback((previous) => ({ channel: previous?.channel === 0 ? 1 : 0, message: notice }))
  const serial = useRef(0)
  const current = useRef({ text, provider })
  current.current = { text, provider }
  useEffect(() => {
    setAvailable(Boolean(navigator.clipboard?.writeText))
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: changed content or connection retires pending copy feedback
  useEffect(() => {
    setCopied(null)
    setFeedback(null)
    return () => {
      serial.current++
    }
  }, [text, provider])
  if (!provider && !available) return null
  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        aria-label={message('hozo.code.copy')}
        onClick={async () => {
          const operation = ++serial.current
          const active = () =>
            operation === serial.current &&
            current.current.text === text &&
            current.current.provider === provider
          try {
            if (provider) await provider.writeText(text)
            else await navigator.clipboard.writeText(text)
            if (active()) {
              setCopied(text)
              notify(message('hozo.code.copied'))
            }
          } catch {
            if (active()) notify(message('hozo.code.copyFailed'))
          }
        }}
      >
        {message(copied === text ? 'hozo.code.copied' : 'hozo.code.copy')}
      </button>
      {/* NVDA needs the region before its message and suppresses unchanged text
        even when its node is replaced. Alternate empty, pre-existing regions
        so repeated copies change the announced region's text each time. */}
      <LiveRegion>{feedback?.channel === 0 ? feedback.message : null}</LiveRegion>
      <LiveRegion>{feedback?.channel === 1 ? feedback.message : null}</LiveRegion>
    </>
  )
}
