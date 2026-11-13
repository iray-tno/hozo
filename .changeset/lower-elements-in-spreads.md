---
'@hozo/compiler': patch
---

A Hozo primitive written inside a prop spread (`{...withFooter(<Text className="p-2" />)}`) is now compiled like one in any other prop. It was copied as written, so its classes never applied.
