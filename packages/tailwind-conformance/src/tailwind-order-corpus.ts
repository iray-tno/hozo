// A small adversarial workload, not a utility-coverage denominator. The same
// inputs are reused by descriptor, browser and opt-in cost measurements.
export const ORDER_BASELINE = '99e9c03a61aaa80c86893fbea72c25df431f86ce'
export const ORDER_REFERENCE_VERSION = '4.3.3'
export const ORDER_CORPUS_VERSION = 1
// A controlled CSS-only project probe: one candidate produces two separately
// ordered rules. This is not a claim of custom-utility support in Hozo.
export const ORDER_REFERENCE_EXTRA_CSS =
  '@utility order-multi-rule { color: #ff0000; } @utility order-multi-rule { padding: 1px; }'

export const orderCases = [
  { id: 'padding-number', classes: 'p-10 p-2', expected: { paddingTop: '40px' } },
  {
    id: 'padding-axes',
    classes: 'p-8 px-2 pt-1',
    expected: { paddingTop: '4px', paddingRight: '8px', paddingBottom: '32px', paddingLeft: '8px' },
  },
  {
    id: 'padding-side',
    classes: 'px-8 pl-1',
    expected: { paddingLeft: '4px', paddingRight: '32px' },
  },
  {
    id: 'margin-axes',
    classes: 'm-8 mx-2 mt-1',
    expected: { marginTop: '4px', marginLeft: '8px', marginRight: '8px' },
  },
  {
    id: 'gap-axes',
    classes: 'gap-8 gap-x-2 gap-y-1',
    expected: { rowGap: '4px', columnGap: '8px' },
  },
  { id: 'width-number', classes: 'w-10 w-2', expected: { width: '40px' } },
  { id: 'radius-name', classes: 'rounded-sm rounded-lg', expected: { borderTopLeftRadius: '4px' } },
  {
    id: 'background',
    classes: 'bg-[#ff0000] bg-[#0000ff]',
    expected: { backgroundColor: 'rgb(255, 0, 0)' },
  },
  {
    id: 'text-color',
    classes: 'text-[#ff0000] text-[#0000ff]',
    expected: { color: 'rgb(255, 0, 0)' },
  },
  {
    id: 'text-size',
    classes: 'text-sm text-lg',
    expected: { fontSize: '14px', lineHeight: '20px' },
  },
  {
    id: 'text-leading',
    classes: 'leading-6 text-lg',
    expected: { fontSize: '18px', lineHeight: '24px' },
  },
  {
    id: 'text-slash',
    classes: 'leading-8 text-lg/6',
    expected: { fontSize: '18px', lineHeight: '32px' },
  },
  { id: 'font-weight', classes: 'font-normal font-bold', expected: { fontWeight: '400' } },
  {
    id: 'hover-padding',
    classes: 'p-0 hover:p-10 hover:p-2',
    state: 'hover',
    expected: { paddingTop: '40px' },
  },
  {
    id: 'active-background',
    classes: 'active:bg-[#0000ff] hover:bg-[#ff0000]',
    state: 'active',
    expected: { backgroundColor: 'rgb(0, 0, 255)' },
  },
] satisfies {
  id: string
  classes: string
  state?: 'hover' | 'active'
  expected: Record<string, string>
}[]

// Descriptor-only probes are explicit. Their existence is not a claim that
// every predicate, alpha value or multi-rule candidate works in Hozo/Native.
export const orderDescriptorProbes = [
  'order-multi-rule',
  'bg-[#ff0000]/50',
  'bg-[#ff0000]/75',
  'disabled:p-4',
  'aria-selected:p-4',
  'data-ready:p-4',
  'sm:p-4',
  'dark:p-4',
  'ps-2',
  'hover:focus:p-4',
  'placeholder:text-red-500',
]

export const orderCandidates = [
  ...new Set([
    ...orderCases.flatMap((entry) => entry.classes.split(' ')),
    ...orderDescriptorProbes,
  ]),
]
