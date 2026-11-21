// Native-only: the Web backend lowers `Text` to an element and never asks
// for this. One implementation under every condition rather than a Web file
// that could only lie about what it is.
//
// HozoInteractionView lives here too: it is the same reader of a Pressable's
// interaction context, for a View rather than a Text.
export {
  HozoInteractionView,
  type HozoInteractionViewProps,
  HozoText,
  type HozoTextProps,
  type HozoTransition,
} from '../pressable.native.tsx'
