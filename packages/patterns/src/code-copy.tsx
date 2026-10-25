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
  const [feedback, setFeedback] = useState<{ operation: number; message: string } | null>(null)
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
              setFeedback({ operation, message: message('hozo.code.copied') })
            }
          } catch {
            if (active()) setFeedback({ operation, message: message('hozo.code.copyFailed') })
          }
        }}
      >
        {message(copied === text ? 'hozo.code.copied' : 'hozo.code.copy')}
      </button>
      {/* NVDA needs the live region before its message. Replacing the keyed
        child also exposes repeated copies without recreating the region. */}
      <LiveRegion>
        {feedback ? <span key={feedback.operation}>{feedback.message}</span> : null}
      </LiveRegion>
    </>
  )
}
