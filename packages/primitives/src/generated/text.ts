// Native-only: the Web backend lowers `Text` to an element and never asks
// for this. One implementation under every condition rather than a Web file
// that could only lie about what it is.
export {
  HozoText,
  type HozoTextProps,
  type HozoTransition,
} from '../pressable.native.tsx'
