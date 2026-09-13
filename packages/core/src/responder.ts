// The responder state machine is shared by compiled React Native source and
// @hozo/primitives' fallback View. Keep one implementation in @hozo/runtime.
export {
  type HozoResponderEvent,
  type HozoResponderTouch,
  type HozoTouchHistory,
  type HozoTouchTrack,
  type ResponderProps,
  useResponderDomProps,
} from '@hozo/runtime'
