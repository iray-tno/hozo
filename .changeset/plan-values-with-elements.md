---
'@hozo/compiler': patch
---

An attribute value holding an element (`footer={make(<Text className="p-2" />)}`) now runs in the order it was written, like any other value: the element's plan evaluates it, with the element lowered as before.
