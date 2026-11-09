---
"@hozo/compiler": patch
---

On Native, a class list ranked into Tailwind's order that visits the same JS guard twice (`on ? 'text-blue-500 text-[24px]' : 'text-red-500 text-[20px]'`) now keeps both style objects. The second used to replace the first in the StyleSheet, losing one branch's font size.
