/**
 * A decorative control's outline/track and optional mark/knob.
 *
 * The pattern owns the real span/View nodes and their accessibility hiding;
 * the styled layer supplies only their look. A callback gets the same state
 * the control announces, including uncontrolled and mixed checkbox states.
 * No application state is copied into a second toggle just to paint it.
 */
export interface HozoControlIndicatorClasses {
  className: string
  markClassName?: string
}
