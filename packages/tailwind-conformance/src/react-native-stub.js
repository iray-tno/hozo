// Stands in for `react-native` when the Native output is rendered.
//
// React Native ships Flow-typed JavaScript that Node cannot parse, so the
// real package is not importable here. See `./native-render.ts` for what
// that means for what these tests establish -- in short, the tree Hozo
// builds is checked, React Native's runtime is not.
//
// The components are strings, which `react-test-renderer` reports as host
// elements: `<View style={...}>` comes back as
// `{ type: 'View', props: { style } }`, so an assertion can be about what
// Hozo put there rather than about what React Native did with it.

export const View = 'View'
export const Text = 'Text'
export const Pressable = 'Pressable'
export const TextInput = 'TextInput'
export const Image = 'Image'
export const ScrollView = 'ScrollView'
export const FlatList = 'FlatList'
export const RefreshControl = 'RefreshControl'
export const Modal = 'Modal'

export const Linking = {
  openURL: async () => {},
}

export const StyleSheet = {
  // Identity, deliberately. The real `create` returns opaque registry
  // values; the point here is to read back the style Hozo wrote. Whether
  // React Native would accept it is the type check's question, asked
  // against its declarations rather than its runtime.
  create: (styles) => styles,
  flatten: (style) =>
    Object.assign({}, ...(Array.isArray(style) ? style.filter(Boolean) : [style || {}])),
}

// Drivable, unlike the rest of this file.
//
// These two used to drop their listeners on the floor and hand back a
// `remove` that removed nothing, which is fine for asserting what a tree
// looks like once. It is not enough to ask the question the runtime's own
// design makes -- that a component using only `md:` does not re-render
// when the window moves inside a breakpoint -- because answering it needs
// the event to actually arrive. See `runtime-cost.ts`.
//
// The `__hozo` prefix says these are the harness's, not React Native's. A
// stub that grows methods the real module lacks is a stub that stops
// being a stand-in.
let window = { width: 390, height: 844, scale: 3, fontScale: 1 }
const dimensionListeners = new Set()
export const Dimensions = {
  get: () => window,
  addEventListener: (_event, listener) => {
    dimensionListeners.add(listener)
    return { remove: () => dimensionListeners.delete(listener) }
  },
  __hozoSetWindow: (next) => {
    window = { ...window, ...next }
    for (const listener of dimensionListeners) listener({ window, screen: window })
  },
}

let colorScheme = 'light'
const appearanceListeners = new Set()
export const Appearance = {
  getColorScheme: () => colorScheme,
  addChangeListener: (listener) => {
    appearanceListeners.add(listener)
    return { remove: () => appearanceListeners.delete(listener) }
  },
  __hozoSetColorScheme: (next) => {
    colorScheme = next
    for (const listener of appearanceListeners) listener({ colorScheme })
  },
}

// Everything off, which is what a device reports until a user turns one
// on. The queries resolve asynchronously on the real platform, so the
// runtime starts at `false` and corrects itself; these return the same
// first answer without the crossing.
export const AccessibilityInfo = {
  isReduceMotionEnabled: async () => false,
  isInvertColorsEnabled: async () => false,
  addEventListener: () => ({ remove: () => {} }),
}

export const I18nManager = {
  isRTL: false,
  doLeftAndRightSwapInRTL: true,
}

export const Easing = {
  linear: (value) => value,
  ease: (value) => value,
  in: (easing) => easing,
  out: (easing) => easing,
  inOut: (easing) => easing,
  // Identity rather than a real cubic bezier: nothing here samples an
  // easing curve, and a wrong curve would be a wrong answer where a
  // missing function is an honest one. It is here because the runtime
  // calls it, and a stub that omits a method the real module has reports
  // the absence as a crash somewhere unrelated.
  bezier: () => (value) => value,
}

export const Animated = {
  Value: class {
    constructor(value) {
      this.value = value
      this.listeners = new Map()
      this.nextListener = 0
    }
    setValue(value) {
      this.value = value
      for (const listener of this.listeners.values()) listener({ value })
    }
    addListener(listener) {
      const id = String(this.nextListener++)
      this.listeners.set(id, listener)
      return id
    }
    removeListener(id) {
      this.listeners.delete(id)
    }
    interpolate(config) {
      return { __animatedInterpolation: config }
    }
  },
  createAnimatedComponent: (component) => component,
  timing: () => ({ start: () => {}, stop: () => {} }),
  loop: (animation) => animation,
  parallel: () => ({ start: () => {}, stop: () => {} }),
}
