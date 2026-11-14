---
"@hozo/cli": patch
---

`hozo add <component> --imports` moves each file that imports the component from `@hozo/ui` to the copy: `import { Button, Card } from '@hozo/ui'` becomes `import { Card } from '@hozo/ui'` and `import { HozoButton as Button } from './components/ui/button'`. Aliases, `type` imports, quotes and semicolons are kept. It follows the same write contract as the rest of `hozo add`, decided for every file before any is written.
