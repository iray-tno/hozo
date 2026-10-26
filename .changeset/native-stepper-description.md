---
'@hozo/patterns': patch
---

On React Native, a `Stepper` step's description sits beside its label, as on the Web, instead of under it. The label and description were in a column of their own; they are now the step row's children, so its gap separates them, and each can shrink so a narrow screen wraps their words.
