// The /docs component previews, on a device (#1159).
//
// One story per docs page, rendering the demo file the page runs on the Web,
// imported from `apps/landing` rather than copied: the screenshot taken here
// is of the same source. `scripts/android-smoke.mjs` opens each one by its
// story id in the `ui-docs` scenario and captures it.
//
// Each demo is required when its story renders, not imported at the top. A
// demo that fails on React Native is information the docs want to show, and
// it must take down only its own story -- not the Storybook every other
// scenario drives. A render error is caught and shown in place for the same
// reason, so the screenshot shows the failure.

import { Text, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-native'
import { Component, type ComponentType, type ReactNode } from 'react'

/** What was thrown, as text: not every throw is an `Error`. */
const describe = (thrown: unknown) =>
  thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)

class Caught extends Component<
  { page: string; children: ReactNode },
  { thrown?: { value: unknown } }
> {
  state: { thrown?: { value: unknown } } = {}
  static getDerivedStateFromError(value: unknown) {
    return { thrown: { value } }
  }
  componentDidCatch(value: unknown) {
    // One line the driver collects from logcat, with the stack the screen
    // has no room for.
    console.error(
      `[hozo-ui-docs] ${this.props.page}: ${describe(value)}`,
      value instanceof Error ? value.stack : '',
    )
  }
  render() {
    if (!this.state.thrown) return this.props.children
    return <Failure page={this.props.page} thrown={this.state.thrown.value} />
  }
}

// A function component, not the boundary's own `render`: the Native
// compiler puts the dark-mode hook a themed class needs at the top of the
// enclosing function, and inside a class's `render` that is an invalid hook
// call (#1183) -- which is what every story here threw on the first device
// run.
function Failure({ page, thrown }: { page: string; thrown: unknown }) {
  return (
    <Text accessibilityLabel={`UI docs ${page} failed`} className="text-sm text-hozo-danger-text">
      {`This demo failed on React Native: ${describe(thrown)}`}
    </Text>
  )
}

function Load({ load }: { load: () => ComponentType }) {
  const Demo = load()
  return <Demo />
}

/**
 * The same surface the docs page puts a preview on (`UiStage`), with the
 * marker the driver waits for beside the demo rather than around it.
 */
function Preview({ page, load }: { page: string; load: () => ComponentType }) {
  // Outermost too: a failure in the surface itself must be shown and named,
  // not left to Storybook's own boundary, which says only that something
  // went wrong.
  return (
    <Caught page={page}>
      <Surface page={page} load={load} />
    </Caught>
  )
}

function Surface({ page, load }: { page: string; load: () => ComponentType }) {
  return (
    <View className="flex-1 items-start bg-hozo-surface p-6 text-hozo-text">
      <View className="w-full items-start">
        <Caught page={page}>
          <Load load={load} />
        </Caught>
      </View>
      {/* Its own one-point element, accessible so both platforms report it:
          iOS lists no label on a box that is not an accessibility element,
          and making the demo's box one would hide the demo's own tree --
          including the failure the boundary above shows, which the driver
          has to be able to see together with this marker. */}
      <View accessible accessibilityLabel={`UI docs ${page}`} className="size-px" />
    </View>
  )
}

const meta = { title: 'UI/Docs' } satisfies Meta
export default meta
type Story = StoryObj

export const Accordion: Story = {
  render: () => (
    <Preview
      page="accordion"
      load={() => require('../../../apps/landing/src/examples/ui/AccordionDemo.tsx').AccordionDemo}
    />
  ),
}
export const Alert: Story = {
  render: () => (
    <Preview
      page="alert"
      load={() => require('../../../apps/landing/src/examples/ui/AlertDemo.tsx').AlertDemo}
    />
  ),
}
export const Avatar: Story = {
  render: () => (
    <Preview
      page="avatar"
      load={() => require('../../../apps/landing/src/examples/ui/AvatarDemo.tsx').AvatarDemo}
    />
  ),
}
export const Badge: Story = {
  render: () => (
    <Preview
      page="badge"
      load={() => require('../../../apps/landing/src/examples/ui/BadgeDemo.tsx').BadgeDemo}
    />
  ),
}
export const BottomSheet: Story = {
  render: () => (
    <Preview
      page="bottom-sheet"
      load={() =>
        require('../../../apps/landing/src/examples/ui/BottomSheetDemo.tsx').BottomSheetDemo
      }
    />
  ),
}
export const Button: Story = {
  render: () => (
    <Preview
      page="button"
      load={() => require('../../../apps/landing/src/examples/ui/ButtonDemo.tsx').ButtonDemo}
    />
  ),
}
export const Calendar: Story = {
  render: () => (
    <Preview
      page="calendar"
      load={() => require('../../../apps/landing/src/examples/ui/CalendarDemo.tsx').CalendarDemo}
    />
  ),
}
export const Card: Story = {
  render: () => (
    <Preview
      page="card"
      load={() => require('../../../apps/landing/src/examples/ui/CardDemo.tsx').CardDemo}
    />
  ),
}
export const Checkbox: Story = {
  render: () => (
    <Preview
      page="checkbox"
      load={() => require('../../../apps/landing/src/examples/ui/CheckboxDemo.tsx').CheckboxDemo}
    />
  ),
}
export const CodeBlock: Story = {
  render: () => (
    <Preview
      page="code-block"
      load={() => require('../../../apps/landing/src/examples/ui/CodeBlockDemo.tsx').CodeBlockDemo}
    />
  ),
}
export const ColorPicker: Story = {
  render: () => (
    <Preview
      page="color-picker"
      load={() =>
        require('../../../apps/landing/src/examples/ui/ColorPickerDemo.tsx').ColorPickerDemo
      }
    />
  ),
}
export const Combobox: Story = {
  render: () => (
    <Preview
      page="combobox"
      load={() => require('../../../apps/landing/src/examples/ui/ComboboxDemo.tsx').ComboboxDemo}
    />
  ),
}
export const CommandPalette: Story = {
  render: () => (
    <Preview
      page="command-palette"
      load={() =>
        require('../../../apps/landing/src/examples/ui/CommandPaletteDemo.tsx').CommandPaletteDemo
      }
    />
  ),
}
export const DatePicker: Story = {
  render: () => (
    <Preview
      page="date-picker"
      load={() =>
        require('../../../apps/landing/src/examples/ui/DatePickerDemo.tsx').DatePickerDemo
      }
    />
  ),
}
export const DateRangePicker: Story = {
  render: () => (
    <Preview
      page="date-range-picker"
      load={() =>
        require('../../../apps/landing/src/examples/ui/DateRangePickerDemo.tsx').DateRangePickerDemo
      }
    />
  ),
}
export const DateTimePicker: Story = {
  render: () => (
    <Preview
      page="date-time-picker"
      load={() =>
        require('../../../apps/landing/src/examples/ui/DateTimePickerDemo.tsx').DateTimePickerDemo
      }
    />
  ),
}
export const Dialog: Story = {
  render: () => (
    <Preview
      page="dialog"
      load={() => require('../../../apps/landing/src/examples/ui/DialogDemo.tsx').DialogDemo}
    />
  ),
}
export const Drawer: Story = {
  render: () => (
    <Preview
      page="drawer"
      load={() => require('../../../apps/landing/src/examples/ui/DrawerDemo.tsx').DrawerDemo}
    />
  ),
}
export const FileDropzone: Story = {
  render: () => (
    <Preview
      page="file-dropzone"
      load={() =>
        require('../../../apps/landing/src/examples/ui/FileDropzoneDemo.tsx').FileDropzoneDemo
      }
    />
  ),
}
export const Form: Story = {
  render: () => (
    <Preview
      page="form"
      load={() => require('../../../apps/landing/src/examples/ui/FormDemo.tsx').FormDemo}
    />
  ),
}
export const Input: Story = {
  render: () => (
    <Preview
      page="input"
      load={() => require('../../../apps/landing/src/examples/ui/InputDemo.tsx').InputDemo}
    />
  ),
}
export const Listbox: Story = {
  render: () => (
    <Preview
      page="listbox"
      load={() => require('../../../apps/landing/src/examples/ui/ListboxDemo.tsx').ListboxDemo}
    />
  ),
}
export const Menu: Story = {
  render: () => (
    <Preview
      page="menu"
      load={() => require('../../../apps/landing/src/examples/ui/MenuDemo.tsx').MenuDemo}
    />
  ),
}
export const NativeSelect: Story = {
  render: () => (
    <Preview
      page="native-select"
      load={() =>
        require('../../../apps/landing/src/examples/ui/NativeSelectDemo.tsx').NativeSelectDemo
      }
    />
  ),
}
export const OtpInput: Story = {
  render: () => (
    <Preview
      page="otp-input"
      load={() => require('../../../apps/landing/src/examples/ui/OtpInputDemo.tsx').OtpInputDemo}
    />
  ),
}
export const Pagination: Story = {
  render: () => (
    <Preview
      page="pagination"
      load={() =>
        require('../../../apps/landing/src/examples/ui/PaginationDemo.tsx').PaginationDemo
      }
    />
  ),
}
export const Popover: Story = {
  render: () => (
    <Preview
      page="popover"
      load={() => require('../../../apps/landing/src/examples/ui/PopoverDemo.tsx').PopoverDemo}
    />
  ),
}
export const RadioGroup: Story = {
  render: () => (
    <Preview
      page="radio-group"
      load={() =>
        require('../../../apps/landing/src/examples/ui/RadioGroupDemo.tsx').RadioGroupDemo
      }
    />
  ),
}
export const ResizablePane: Story = {
  render: () => (
    <Preview
      page="resizable-pane"
      load={() =>
        require('../../../apps/landing/src/examples/ui/ResizablePaneDemo.tsx').ResizablePaneDemo
      }
    />
  ),
}

export const SegmentedControl: Story = {
  render: () => (
    <Preview
      page="segmented-control"
      load={() =>
        require('../../../apps/landing/src/examples/ui/SegmentedControlDemo.tsx')
          .SegmentedControlDemo
      }
    />
  ),
}
export const Skeleton: Story = {
  render: () => (
    <Preview
      page="skeleton"
      load={() => require('../../../apps/landing/src/examples/ui/SkeletonDemo.tsx').SkeletonDemo}
    />
  ),
}
export const Slider: Story = {
  render: () => (
    <Preview
      page="slider"
      load={() => require('../../../apps/landing/src/examples/ui/SliderDemo.tsx').SliderDemo}
    />
  ),
}
export const Stack: Story = {
  render: () => (
    <Preview
      page="stack"
      load={() => require('../../../apps/landing/src/examples/ui/StackDemo.tsx').StackDemo}
    />
  ),
}
export const Stepper: Story = {
  render: () => (
    <Preview
      page="stepper"
      load={() => require('../../../apps/landing/src/examples/ui/StepperDemo.tsx').StepperDemo}
    />
  ),
}
export const Switch: Story = {
  render: () => (
    <Preview
      page="switch"
      load={() => require('../../../apps/landing/src/examples/ui/SwitchDemo.tsx').SwitchDemo}
    />
  ),
}
export const Tabs: Story = {
  render: () => (
    <Preview
      page="tabs"
      load={() => require('../../../apps/landing/src/examples/ui/TabsDemo.tsx').TabsDemo}
    />
  ),
}
export const TextArea: Story = {
  render: () => (
    <Preview
      page="text-area"
      load={() => require('../../../apps/landing/src/examples/ui/TextAreaDemo.tsx').TextAreaDemo}
    />
  ),
}
export const TimePicker: Story = {
  render: () => (
    <Preview
      page="time-picker"
      load={() =>
        require('../../../apps/landing/src/examples/ui/TimePickerDemo.tsx').TimePickerDemo
      }
    />
  ),
}
export const Toolbar: Story = {
  render: () => (
    <Preview
      page="toolbar"
      load={() => require('../../../apps/landing/src/examples/ui/ToolbarDemo.tsx').ToolbarDemo}
    />
  ),
}
export const Tooltip: Story = {
  render: () => (
    <Preview
      page="tooltip"
      load={() => require('../../../apps/landing/src/examples/ui/TooltipDemo.tsx').TooltipDemo}
    />
  ),
}
export const Tree: Story = {
  render: () => (
    <Preview
      page="tree"
      load={() => require('../../../apps/landing/src/examples/ui/TreeDemo.tsx').TreeDemo}
    />
  ),
}
