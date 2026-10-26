import type { CodeLine } from '@hozo/typography/code/model'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ReplOutput } from '../components/repl/ReplOutput.tsx'

export function createReplOutput(host: HTMLElement) {
  // The static empty figures are placeholders. One root owns only the output,
  // preserving the independent CodeJar selection and subsequent code scrollers.
  const root = createRoot(host)
  return (listings: CodeLine[][]) => {
    // Status must not announce a compile whose output has not committed yet.
    flushSync(() => root.render(<ReplOutput listings={listings} />))
  }
}
