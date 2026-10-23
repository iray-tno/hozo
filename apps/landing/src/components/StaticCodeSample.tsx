import { CodeLines, Section } from '@hozo/core'
import { CodeBlock } from '@hozo/patterns'

/** Wrapped, copy-free output has no interaction for Astro to hydrate. */
export function StaticCodeSample() {
  return (
    <Section className="p-4" accessibilityLabel="Static code examples">
      <CodeLines lines={'const staticCode = true\n'} />
      <CodeBlock title="Build-time code" lines="const wrappedCode = true" wrap />
    </Section>
  )
}
