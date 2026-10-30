---
'@hozo/typography': patch
---

A Native code line now nests one `Text` per run of tokens that draw the same, rather than one per token, and none when the whole line draws one way. Whitespace joins its neighbour whatever its colour. On Shiki's output for real source this is about a quarter fewer nested `Text`s. The text, the accessibility label and what is drawn are unchanged.
