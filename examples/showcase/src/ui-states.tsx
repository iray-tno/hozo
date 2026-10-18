import { Chip } from '@hozo/patterns'
import { Text, View } from '@hozo/primitives'
import { Heading } from '@hozo/typography'
import {
  Accordion,
  Button,
  Checkbox,
  Listbox,
  Menu,
  Pagination,
  RadioGroup,
  Switch,
  Tabs,
  Tree,
} from '@hozo/ui'
import { type ReactNode, useState } from 'react'

// Small deterministic screens shared by both hosts. They do not claim visual
// parity: screenshots and device observations must record their own platform.
function Screen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <View
      testID={`ui-state-${name.toLowerCase()}`}
      className="w-full max-w-lg gap-4 rounded-xl bg-hozo-surface p-4"
    >
      <Heading level={2} className="text-lg font-bold text-hozo-text">
        {name}
      </Heading>
      {children}
    </View>
  )
}

function TabsState() {
  const [index, setIndex] = useState(0)
  return (
    <Screen name="Tabs">
      <Tabs
        accessibilityLabel="UI workspace tabs"
        index={index}
        onIndexChange={setIndex}
        tabs={[
          { label: 'Overview', content: 'Workspace overview' },
          { label: 'Activity', content: 'Recent activity' },
          { label: 'Unavailable', content: 'Not available', disabled: true },
        ]}
      />
      <Text className="text-sm text-hozo-text-body">
        Selected tab: {index === 0 ? 'Overview' : 'Activity'}
      </Text>
    </Screen>
  )
}

function AccordionState() {
  return (
    <Screen name="Accordion">
      <Accordion
        defaultExpanded="shipping"
        items={[
          { id: 'shipping', header: 'Shipping', content: 'Dispatches in two days.' },
          { id: 'returns', header: 'Returns', content: 'Returns within thirty days.' },
          {
            id: 'unavailable',
            header: 'Gift wrapping unavailable',
            content: 'Not available',
            disabled: true,
          },
        ]}
      />
    </Screen>
  )
}

const options = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'unavailable', label: 'Unavailable', disabled: true },
]

function RadioState() {
  const [value, setValue] = useState('express')
  return (
    <Screen name="Radio">
      <RadioGroup
        accessibilityLabel="UI delivery speed"
        options={options}
        value={value}
        onValueChange={setValue}
      />
      <Text className="text-sm text-hozo-text-body">Delivery: {value}</Text>
    </Screen>
  )
}

function ListboxState() {
  const [value, setValue] = useState(['standard'])
  return (
    <Screen name="Listbox">
      <Listbox<string>
        multiple
        accessibilityLabel="UI selected services"
        options={options}
        value={value}
        onValueChange={setValue}
      />
      <Text className="text-sm text-hozo-text-body">Services: {value.join(', ') || 'none'}</Text>
    </Screen>
  )
}

function MenuState() {
  const [action, setAction] = useState('none')
  return (
    <Screen name="Menu">
      <Menu
        trigger="Open UI actions"
        accessibilityLabel="UI actions"
        items={[
          { label: 'Duplicate', onSelect: () => setAction('duplicate') },
          { label: 'Archive', onSelect: () => setAction('archive') },
          { label: 'Delete unavailable', onSelect: () => setAction('delete'), disabled: true },
        ]}
      />
      <Text className="text-sm text-hozo-text-body">Last action: {action}</Text>
    </Screen>
  )
}

// Chip is not an @hozo/ui export. Exercise its canonical pattern with an
// explicitly shared look instead of implying a styled UI wrapper exists.
const chipLook =
  'rounded-full border border-hozo-border-strong bg-hozo-surface px-3 py-2 text-sm text-hozo-text aria-pressed:bg-hozo-accent-subtle aria-pressed:text-hozo-accent-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
function ChipState() {
  const [selected, setSelected] = useState(true)
  return (
    <Screen name="Chip">
      <Chip selected={selected} onSelectedChange={setSelected} className={chipLook}>
        Remote
      </Chip>
      <Chip defaultSelected={false} className={chipLook}>
        Full time
      </Chip>
      <Chip selected disabled className={chipLook}>
        Disabled selected
      </Chip>
      <Chip selected={false} disabled className={chipLook}>
        Disabled unselected
      </Chip>
      <Text className="text-sm text-hozo-text-body">
        Remote: {selected ? 'selected' : 'not selected'}
      </Text>
    </Screen>
  )
}

function PaginationState() {
  const [page, setPage] = useState(2)
  return (
    <Screen name="Pagination">
      <Pagination
        accessibilityLabel="UI result pages"
        page={page}
        pageCount={5}
        onPageChange={setPage}
      />
      <View className="flex-row flex-wrap gap-2">
        <Button onPress={() => setPage(1)}>Show first page</Button>
        <Button onPress={() => setPage(5)}>Show last page</Button>
      </View>
      <Text className="text-sm text-hozo-text-body">Page: {page} of 5</Text>
    </Screen>
  )
}

function TreeState() {
  const [selected, setSelected] = useState('intro')
  return (
    <Screen name="Tree">
      <Tree
        accessibilityLabel="UI workspace files"
        defaultExpanded={['docs']}
        selectedId={selected}
        onSelect={setSelected}
        nodes={[
          {
            id: 'docs',
            label: 'Documentation',
            children: [
              { id: 'intro', label: 'Introduction' },
              { id: 'guide', label: 'Guide' },
            ],
          },
          { id: 'assets', label: 'Assets', children: [{ id: 'logo', label: 'Logo' }] },
          { id: 'locked', label: 'Locked file', disabled: true },
        ]}
      />
      <Text className="text-sm text-hozo-text-body">Selected file: {selected}</Text>
    </Screen>
  )
}

function CheckboxStates() {
  const [values, setValues] = useState<(boolean | 'mixed')[]>([
    false,
    true,
    'mixed',
    false,
    true,
    'mixed',
  ])
  return (
    <Screen name="Checkbox">
      {values.map((checked, index) => {
        const disabled = index >= 3
        const label = `${disabled ? 'Disabled' : 'Enabled'} ${checked === 'mixed' ? 'mixed' : checked ? 'checked' : 'unchecked'} checkbox`
        return (
          <Checkbox
            key={checkboxKeys[index]}
            checked={checked}
            disabled={disabled}
            accessibilityLabel={label}
            onCheckedChange={(next) =>
              setValues((previous) => previous.map((value, at) => (at === index ? next : value)))
            }
          >
            {label}
          </Checkbox>
        )
      })}
    </Screen>
  )
}

function SwitchStates() {
  const [values, setValues] = useState([false, true, false, true])
  return (
    <Screen name="Switch">
      {values.map((checked, index) => {
        const disabled = index >= 2
        const label = `${disabled ? 'Disabled' : 'Enabled'} ${checked ? 'on' : 'off'} switch`
        return (
          <Switch
            key={switchKeys[index]}
            checked={checked}
            disabled={disabled}
            accessibilityLabel={label}
            onCheckedChange={(next) =>
              setValues((previous) => previous.map((value, at) => (at === index ? next : value)))
            }
          >
            {label}
          </Switch>
        )
      })}
    </Screen>
  )
}

const checkboxKeys = [
  'unchecked',
  'checked',
  'mixed',
  'disabled-unchecked',
  'disabled-checked',
  'disabled-mixed',
]
const switchKeys = ['off', 'on', 'disabled-off', 'disabled-on']

export const uiStateScenes = {
  Tabs: TabsState,
  Accordion: AccordionState,
  Radio: RadioState,
  Listbox: ListboxState,
  Menu: MenuState,
  Chip: ChipState,
  Pagination: PaginationState,
  Tree: TreeState,
  Checkbox: CheckboxStates,
  Switch: SwitchStates,
}
