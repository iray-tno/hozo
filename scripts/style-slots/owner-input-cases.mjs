// Authored input semantics, independent of Owner declarations and compiler output.
const tabs = (disabled = -1, length = 3) =>
  ['A', 'B', 'C'].slice(0, length).map((label, index) => ({
    label,
    content: ['one', 'two', 'three'][index],
    disabled: index === disabled,
  }))

export const tabInputCases = [
  { id: 'enabled', tabs: tabs(), index: 0 },
  { id: 'disable-selected', tabs: tabs(0), index: 0 },
  { id: 'select-disabled', tabs: tabs(1), index: 1 },
  { id: 'enable-selected', tabs: tabs(), index: 1 },
  { id: 'shrink-past-selection', tabs: tabs(-1, 2), index: 2 },
  { id: 'append-selected-disabled', tabs: tabs(2), index: 2 },
  { id: 'empty', tabs: [], index: 0 },
  { id: 'repopulate', tabs: tabs(), index: 0 },
]

export function expectedIdleTabInputs({ tabs, index }) {
  return tabs.map((tab, at) => ({
    label: tab.label,
    selected: at === index,
    disabled: tab.disabled,
    padding: tab.disabled && at === index ? 12 : 8,
    background: at === index ? '#223344' : '#112233',
    opacity: tab.disabled ? 0.5 : 1,
    border: tab.disabled ? 3 : 0,
    color: at === index ? '#445566' : '#334455',
    size: 18,
    weight: tab.disabled ? '700' : '400',
    spacing: 0,
  }))
}

// Array length is deliberately not the shape oracle: the component filters,
// deduplicates and sorts valid fractions before choosing its actual host.
export const handleInputCases = [
  { id: 'omitted', detents: undefined, interactive: false },
  { id: 'empty', detents: [], interactive: false },
  { id: 'invalid', detents: [-1, 0, 1.5, NaN, Infinity], interactive: false },
  { id: 'duplicates', detents: [1, 1], interactive: false },
  { id: 'one-valid', detents: [-1, 0.5, 0.5, 2], interactive: false },
  { id: 'unsorted-many', detents: [1, 0.5, 0.5, -1], interactive: true },
  { id: 'many-valid', detents: [0.25, 0.75, 1], interactive: true },
  { id: 'back-to-decoration', detents: [1, 1], interactive: false },
  { id: 'back-to-interactive', detents: [0.5, 1], interactive: true },
]

export const handleInputClasses = 'p-[8px] opacity-100 bg-[#ffffff] gap-x-2'

// Kept separate from live-data cases: these observe modality at idle, not OS
// press cancellation. Each row is evaluated on all three actual tab Owners.
export const tabModalityCases = [
  { id: 'rest', focused: false, visible: false },
  { id: 'keyboard-focus', focused: true, visible: true },
  { id: 'pointer-while-focused', focused: true, visible: false },
  { id: 'keyboard-restores-visible', focused: true, visible: true },
  { id: 'blur', focused: false, visible: false },
  { id: 'pointer-focus', focused: true, visible: false },
  { id: 'keyboard-refocus', focused: true, visible: true },
  { id: 'remount-rest', focused: false, visible: false },
]

export function expectedTabModality(input) {
  return [0, 1, 2].map((at) => ({
    width: at === 1 && input.focused ? 96 : null,
    bottom: at === 1 && input.visible ? 5 : 0,
    decoration: at === 1 && input.visible ? 'underline' : 'none',
  }))
}

export const tabLabelCases = [
  { id: 'zero', label: 0, disabled: false },
  { id: 'disabled-zero', label: 0, disabled: true },
  { id: 'negative', label: -7, disabled: false },
  { id: 'fraction', label: 2.5, disabled: false },
  { id: 'back-to-string', label: 'B', disabled: false },
]

export function expectedTabLabels(input) {
  return ['A', input.label, 'C'].map((label, at) => ({
    label: String(label),
    color: at === 1 ? '#445566' : '#334455',
    size: 18,
    weight: at === 1 && input.disabled ? '700' : '400',
  }))
}
