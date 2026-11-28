// Native-only: the Web backend lowers `Text` to an element and never asks
// for this. One implementation under every condition rather than a Web file
// that could only lie about what it is.
//
// HozoInteractionView and HozoInteractionQuery live here too: they are the
// same readers of a Pressable's interaction context, for a View or any
// descendant host rather than a Text.
export {
  HozoInteractionQuery,
  type HozoInteractionQueryProps,
  HozoInteractionView,
  type HozoInteractionViewProps,
  HozoText,
  type HozoTextProps,
  type HozoTransition,
} from '../pressable.native.tsx'
