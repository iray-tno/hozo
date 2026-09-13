---
'@hozo/primitives': minor
'@hozo/core': minor
'@hozo/compiler': minor
'@hozo/metro': minor
'@hozo/vite': minor
'@hozo/next': minor
'@hozo/runtime': minor
---

Add the canonical primitives package and move ScrollView, FlatList, RefreshControl, and private
windowing into it. Generated Web and Native code now import collection primitives from their owner,
and the core fallback uses the same windowed FlatList as compiled output.
