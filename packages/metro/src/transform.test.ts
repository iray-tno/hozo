import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Compiler, createCompiler } from '@hozo/compiler'
import { transformHozoSource } from './transform.ts'

const LOGIN_SOURCE = `import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-xl font-bold">Welcome</Text>
      <Button className="mt-4 px-4 py-2">Continue</Button>
    </View>
  )
}
`

test('returns null for non-.tsx files', () => {
  assert.equal(transformHozoSource(LOGIN_SOURCE, 'Login.ts'), null)
})

test('returns null when there is no @hozo/core usage', () => {
  assert.equal(transformHozoSource('export const x = 1\n', 'x.tsx'), null)
})

test('static Chip interaction slots compile with the project theme and no candidate module', () => {
  const compiler = createCompiler({
    colors: [{ token: 'brand', oklch: '#123456', hex: '#123456' }],
  })
  const source = `import { Chip } from '@hozo/core'
export function C() { return <Chip defaultSelected={false} onRemove={drop}
  className="bg-brand hover:opacity-50" removeClassName="focus-visible:text-brand"
  style={{ opacity: 0.9 }}>Token</Chip> }
`
  const output = transformHozoSource(source, 'Chip.tsx', undefined, compiler)
  assert.ok(output)
  assert.match(output, /backgroundColor: '#123456'/)
  assert.match(output, /color: '#123456'/)
  assert.match(
    output,
    /hozoStyle=\{\(\{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed \}\) =>/,
  )
  assert.match(
    output,
    /hozoRemoveStyle=\{\(\{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed \}\) =>/,
  )
  assert.match(output, /style=\{\[\{ opacity: 0\.9 \}\]\}/)
  assert.doesNotMatch(output, /hozoClasses|candidate|HozoPressable|HozoText/)
})

test('dynamic secondary pattern classes reach their registered slot owner without an early lookup', () => {
  for (const [component, slot, style] of [
    ['Chip', 'className', 'style'],
    ['Chip', 'removeClassName', 'removeStyle'],
    ['Pagination', 'itemClassName', 'itemStyle'],
    ['Pagination', 'currentItemClassName', 'currentItemStyle'],
    ['Pagination', 'disabledItemClassName', 'disabledItemStyle'],
    ['ColorPicker', 'swatchClassName', 'swatchStyle'],
    ['ColorPicker', 'selectedSwatchClassName', 'selectedSwatchStyle'],
    ['ColorPicker', 'inputClassName', 'inputStyle'],
    ['ColorPicker', 'thumbClassName', 'thumbStyle'],
    ['Stepper', 'stepClassName', 'stepStyle'],
    ['Stepper', 'completedStepClassName', 'completedStepStyle'],
    ['Stepper', 'currentStepClassName', 'currentStepStyle'],
    ['Stepper', 'errorStepClassName', 'errorStepStyle'],
    ['CommandPalette', 'itemClassName', 'itemStyle'],
    ['CommandPalette', 'activeItemClassName', 'activeItemStyle'],
    ['CommandPalette', 'inputClassName', 'inputStyle'],
    ['OtpInput', 'inputClassName', 'inputStyle'],
    ['Combobox', 'inputClassName', 'inputStyle'],
    ['Combobox', 'optionClassName', 'optionStyle'],
    ['Listbox', 'optionClassName', 'optionStyle'],
    ['Menu', 'triggerClassName', 'triggerStyle'],
    ['Menu', 'itemClassName', 'itemStyle'],
  ]) {
    const output = transformHozoSource(
      `import { ${component} } from '@hozo/core'
export function C() { return <${component} ${slot}={chooseClasses()} ${style}={extra} /> }`,
      'Dynamic.tsx',
    )
    assert.ok(output)
    assert.ok(output.includes(`${slot}={chooseClasses()}`), output)
    assert.ok(
      output.includes(`${style}={${style === 'style' ? '[hozoAuthoredStyle(extra)]' : 'extra'}}`),
      output,
    )
    if (style === 'style')
      assert.match(
        output,
        /import \{ hozoAuthoredStyle \} from '@hozo\/core\/generated\/gap-styles'/,
      )
    else assert.doesNotMatch(output, /hozoAuthoredStyle/)
    assert.equal(output.match(/chooseClasses\(\)/g)?.length, 1)
    assert.doesNotMatch(output, /hozoClasses|candidate|HozoPressable|HozoText/)
  }
  // No blanket forwarding: an unregistered decorative slot retains its
  // existing fallback, and static interaction refusals below still apply.
  const unowned = transformHozoSource(
    `import { ColorPicker } from '@hozo/core'
export function C() { return <ColorPicker sliderClassName={classes} /> }`,
    'ColorPicker.tsx',
    '/project',
  )
  assert.match(unowned, /sliderStyle=\{hozoClasses\(classes\)\}/)
  assert.doesNotMatch(unowned, /sliderClassName=/)
})

test('audited Avatar decorations resolve opaque inputs once with their known non-control facts', () => {
  for (const name of ['image', 'fallback', 'status']) {
    const output = transformHozoSource(
      `import { Avatar } from '@hozo/core'
export function C() { return <Avatar ${name}ClassName={chooseClasses()} ${name}Style={extra} /> }`,
      'Avatar.tsx',
      '/project',
    )
    assert.ok(output)
    assert.ok(
      output.includes(
        `${name}Style={[hozoClasses(chooseClasses(), { disabled: false, enabled: false, readOnly: true, 'aria-disabled': false, 'aria-selected': false, 'aria-checked': false }), hozoAuthoredStyle(extra)]}`,
      ),
      output,
    )
    assert.equal(output.match(/chooseClasses\(\)/g)?.length, 1)
    assert.ok(!output.includes(`${name}ClassName=`), output)
    assert.doesNotMatch(output, /hozoStyle=|hozoImageStyle=|hozoFallbackStyle=|hozoStatusStyle=/)
  }
})

test('mixed Chip root classes capture residuals once between AOT resting and state styles', () => {
  const output = transformHozoSource(
    `import { Chip, cx } from '@hozo/core'
export function C() { return <Chip defaultSelected className={cx('p-2 hover:opacity-50 not-focus:rounded-lg md:mt-2', chooseClasses(), chooseOther())} style={extra} /> }`,
    'Mixed.tsx',
    '/project',
  )
  assert.ok(output)
  assert.equal(output.match(/chooseClasses\(\)/g)?.length, 1)
  assert.equal(output.match(/chooseOther\(\)/g)?.length, 1)
  assert.match(output, /hozoStyle=\{\(\(__hozoClassSlot0Value0, __hozoClassSlot0Value1\) =>/)
  assert.match(
    output,
    /hozoStyles\.hozo_r0_0, __hozoBp_md && hozoStyles\.hozo_r0_0_md, hozoClasses\(__hozoClassSlot0Value0, __hozoClassSlot0State\), hozoClasses\(__hozoClassSlot0Value1, __hozoClassSlot0State\), hovered &&/,
  )
  assert.match(output, /!\(focused\) && hozoStyles\.hozo_r0_0_notfocus/)
  assert.match(output, /style=\{\[hozoAuthoredStyle\(extra\)\]\}/)
  assert.match(output, /import \{ hozoClasses \} from '.*candidates\.native\.js'/)
  assert.doesNotMatch(output, /className=|HozoPressable|HozoText/)
})

test('mixed secondary expressions retain AOT and source-ordered guards on registered owners', () => {
  for (const [component, slot, state] of [
    ['Chip', 'removeClassName', 'hover'],
    ['Pagination', 'itemClassName', 'hover'],
    ['ColorPicker', 'swatchClassName', 'hover'],
    ['ColorPicker', 'inputClassName', 'focus'],
    ['ColorPicker', 'thumbClassName', 'focus'],
    ['Stepper', 'stepClassName', 'hover'],
    ['CommandPalette', 'itemClassName', 'hover'],
    ['CommandPalette', 'inputClassName', 'focus'],
    ['OtpInput', 'inputClassName', 'focus'],
    ['Combobox', 'inputClassName', 'focus'],
    ['Combobox', 'optionClassName', 'hover'],
    ['Listbox', 'optionClassName', 'focus'],
    ['Menu', 'triggerClassName', 'focus'],
    ['Menu', 'itemClassName', 'focus'],
  ]) {
    const output = transformHozoSource(
      `import {${component},cx} from '@hozo/core'; export function C() {return <${component} onStepPress={press} ${slot}={cx('p-2 not-${state}:rounded-lg ${state}:opacity-50 md:mt-2', choose())} />}`,
      'Mixed.tsx',
      '/project',
    )
    assert.ok(output)
    assert.match(output, /__hozoClassSlot0Value0/)
    assert.match(output, /paddingTop: 8/)
    assert.match(output, /__hozoBp_md/)
    assert.equal(output.match(/choose\(\)/g)?.length, 1)
    assert.ok(!output.includes(`${slot}=`), output)
  }
  const guarded = transformHozoSource(
    `import {Chip,cx} from '@hozo/core'; export function C() {return <Chip removeClassName={cx(first(), guard() && 'p-2', last())} />}`,
    'Guarded.tsx',
    '/project',
  )
  assert.match(guarded, /hozoRemoveStyle=\{\(\(__hozoClassPlan\d+/)
  assert.match(
    guarded,
    /\[\(first\(\)\), \.\.\.\(\(guard\(\)\) \? \[true\] : \[false\]\), \(last\(\)\)\]/,
  )
  for (const call of ['first', 'guard', 'last'])
    assert.equal(guarded.match(new RegExp(`${call}\\(\\)`, 'g'))?.length, 1)
  assert.match(guarded, /paddingTop: 8/)
  const pureGuard = transformHozoSource(
    `import {Chip} from '@hozo/core'; export function C() {return <Chip removeClassName={guard() ? 'p-2' : 'p-4'} />}`,
    'PureGuard.tsx',
    '/project',
  )
  assert.match(pureGuard, /__hozoClassPlan/)
  assert.doesNotMatch(
    pureGuard,
    /hozoClasses|candidate/,
    'an enumerable guard needs no candidate lookup, even when the owner changes state',
  )
  const compiler = createCompiler()
  compiler.setClassHelpers([{ module: '@/utils', name: 'cn' }])
  const configured = transformHozoSource(
    `import {Chip} from '@hozo/core'; import {cn} from '@/utils'; export function C() {return <Chip removeClassName={cn('p-2 not-focus:rounded-lg', choose())} />}`,
    'Configured.tsx',
    '/project',
    compiler,
  )
  assert.match(configured, /__hozoClassSlot0Value0/)
  assert.match(configured, /!\(focused\)/)
})

test('decorative pattern slots still reject static interaction classes in full Metro lowering', () => {
  for (const name of ['image', 'fallback', 'status'])
    for (const variant of ['hover', 'not-hover', 'focus', 'not-focus'])
      assert.throws(
        () =>
          transformHozoSource(
            `import { Avatar } from '@hozo/core'
export function C() { return <Avatar name="Ada" ${name}ClassName="${variant}:opacity-50" /> }`,
            'Avatar.tsx',
          ),
        /NOT_WIRED_ON_NATIVE:[\s\S]*no readable events on this decorative class owner/,
        `${name}/${variant}`,
      )
})

test('CommandPalette pointer slots use the theme, while option focus still refuses the build', () => {
  const compiler = createCompiler({
    colors: [{ token: 'brand', oklch: '#123456', hex: '#123456' }],
  })
  const source = `import { CommandPalette } from '@hozo/core'
export function C() { return <CommandPalette open commands={commands}
  itemClassName="p-2 hover:bg-brand" activeItemClassName="border-2 active:text-brand" /> }
`
  const output = transformHozoSource(source, 'Commands.tsx', undefined, compiler)
  assert.ok(output)
  assert.match(output, /backgroundColor: '#123456'/)
  assert.match(output, /color: '#123456'/)
  assert.match(output, /hozoItemStyle=\{/)
  assert.match(output, /hozoActiveItemStyle=\{/)
  assert.doesNotMatch(output, /hozoClasses|HozoPressable|HozoText/)
  for (const variant of ['focus', 'focus-visible', 'not-focus', 'hover:focus-visible']) {
    assert.throws(
      () =>
        transformHozoSource(
          source.replace('hover:bg-brand', `${variant}:bg-brand`),
          'Commands.tsx',
          undefined,
          compiler,
        ),
      /Web input keeps focus/,
    )
  }
})

test('OTP focus styles use the project theme and input owner, never the cells or wrapper', () => {
  const compiler = createCompiler({
    colors: [{ token: 'brand', oklch: '#123456', hex: '#123456' }],
  })
  const source = `import { OtpInput } from '@hozo/core'
export function C() { return <OtpInput accessibilityLabel="Code"
  inputClassName="rounded-lg focus-visible:outline-brand md:focus:outline-2 not-focus:opacity-50"
  inputStyle={{ outlineWidth: 5 }} /> }
`
  const output = transformHozoSource(source, 'Otp.tsx', undefined, compiler)
  assert.ok(output)
  assert.match(output, /outlineColor: '#123456'/)
  assert.match(
    output,
    /hozoInputStyle=\{\(\{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, readOnly: __hozoSlotReadOnly \}\) =>/,
  )
  assert.match(output, /__hozoBp_md && focused/)
  assert.match(output, /useHozoBreakpoint\('md'\)\n return/)
  assert.match(output, /!\(focused\) &&/)
  assert.match(output, /inputStyle=\{\{ outlineWidth: 5 \}\}/)
  assert.doesNotMatch(output, /hozoClasses|candidate|HozoPressable|HozoText/)
  for (const slot of ['className', 'cellClassName', 'activeCellClassName', 'filledCellClassName']) {
    assert.throws(
      () =>
        transformHozoSource(
          source.replace('inputClassName=', `${slot}=`),
          'Otp.tsx',
          undefined,
          compiler,
        ),
      /no readable interaction state/,
    )
  }
  for (const variant of ['hover', 'active', 'not-hover', 'md:not-active']) {
    assert.throws(
      () =>
        transformHozoSource(
          source.replace('focus-visible:outline-brand', `${variant}:outline-brand`),
          'Otp.tsx',
          undefined,
          compiler,
        ),
      /different owner/,
    )
  }
})

test('CommandPalette input focus and form predicates belong to the field, not its options', () => {
  const compiler = createCompiler({
    colors: [{ token: 'brand', oklch: '#123456', hex: '#123456' }],
  })
  const source = `import { CommandPalette } from '@hozo/core'
export function C() {return <CommandPalette open commands={commands}
  inputClassName="p-2 enabled:px-3 disabled:opacity-25 read-only:rounded-lg aria-expanded:border-2 aria-selected:mb-8 focus:bg-brand focus-visible:outline-2 not-focus:opacity-50"
  inputStyle={extra} />}`
  const output = transformHozoSource(source, 'Commands.tsx', undefined, compiler)
  assert.ok(output)
  assert.match(output, /hozoInputStyle=\{\(\{ pressed, hovered, focused, focusVisible \}\) =>/)
  assert.match(output, /focused &&/)
  assert.match(output, /focusVisible &&/)
  assert.match(output, /!\(focused\) &&/)
  assert.match(output, /backgroundColor: '#123456'/)
  assert.match(output, /inputStyle=\{extra\}/)
  assert.doesNotMatch(output, /hozoClasses|candidate|inputClassName=/)
  assert.doesNotMatch(output, /&& hozoStyles\.\w+_(disabled|readonly|ariaselected)/)
})

test('ColorPicker hex input owns focus and mutability without adding input facts to swatches', () => {
  const output = transformHozoSource(
    `import { ColorPicker } from '@hozo/core'
export function C() {return <ColorPicker disabled={disabled} accessibilityLabel="Theme"
 inputClassName="focus:opacity-50 focus-visible:outline-2 disabled:opacity-25 enabled:px-3 read-only:rounded-lg not-read-only:mt-2 aria-checked:border-4"
 swatchClassName="aria-checked:border-2" inputStyle={extra} />}`,
    'Color.tsx',
  )
  assert.ok(output)
  assert.match(
    output,
    /hozoInputStyle=\{\(\{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, readOnly: __hozoSlotReadOnly \}\) =>/,
  )
  const swatch = output.match(/hozoSwatchStyle=\{\(\{[^}]+\}/)?.[0]
  assert.ok(swatch)
  assert.doesNotMatch(swatch, /readOnly/)
  assert.match(output, /__hozoSlotReadOnly &&/)
  assert.match(output, /!\(__hozoSlotReadOnly\) &&/)
  assert.match(output, /inputStyle=\{extra\}/)
  assert.doesNotMatch(output, /hozoClasses|candidate|inputClassName=/)
})

test('ColorPicker thumb focus reaches the slider callback while pointer states remain unsupported', () => {
  const output = transformHozoSource(
    `import { ColorPicker } from '@hozo/core'
export function C() {return <ColorPicker accessibilityLabel="Theme"
 thumbClassName="focus:opacity-50 focus-visible:outline-2 aria-disabled:border-4 disabled:mt-8 enabled:mb-8"
 thumbStyle={extra} />}`,
    'ColorThumb.tsx',
  )
  assert.ok(output)
  assert.match(output, /hozoThumbStyle=\{/)
  assert.match(output, /'aria-disabled': __hozoSlotAriaDisabled/)
  assert.match(output, /focused &&/)
  assert.match(output, /focusVisible &&/)
  assert.match(output, /__hozoSlotAriaDisabled &&/)
  assert.match(output, /thumbStyle=\{extra\}/)
  assert.doesNotMatch(output, /hozoClasses|candidate|thumbClassName=/)
  assert.doesNotMatch(output, /hozoStyles\.\w+_(disabled|enabled)/)
  for (const variant of ['hover', 'not-hover', 'active', 'hover:focus-visible']) {
    assert.throws(
      () =>
        transformHozoSource(
          `import {ColorPicker} from '@hozo/core'; export function C() {return <ColorPicker thumbClassName="${variant}:opacity-50" />}`,
          'ColorThumb.tsx',
        ),
      /NOT_WIRED_ON_NATIVE/,
      variant,
    )
  }
})

test('Combobox class slots bind editable focus, non-control list and active option facts separately', () => {
  const output = transformHozoSource(
    `import {Combobox} from '@hozo/core'; export function C() {return <Combobox options={options}
      inputClassName="focus:opacity-50 focus-visible:outline-2 enabled:px-3 aria-expanded:border-2"
      listClassName="read-only:rounded-lg not-disabled:mt-2"
      optionClassName="hover:opacity-50 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg"
      inputStyle={extra} optionStyle={extra}/>}`,
    'Combobox.tsx',
  )
  assert.ok(output)
  assert.match(output, /hozoInputStyle=/)
  assert.match(output, /hozoOptionStyle=/)
  assert.match(output, /'aria-expanded': __hozoSlotAriaExpanded/)
  assert.match(output, /'aria-selected': __hozoSlotAriaSelected/)
  assert.match(output, /listStyle=/)
  assert.match(output, /inputStyle=\{extra\}/)
  assert.doesNotMatch(
    output,
    /hozoClasses|candidate|inputClassName=|optionClassName=|listClassName=/,
  )
})

test('opaque Combobox root classes receive the same constant facts as its non-control list', () => {
  const opaque = transformHozoSource(
    "import {Combobox} from '@hozo/core'; export function C(){return <Combobox options={[]} className={getClasses()}/>}",
    'Combobox.tsx',
    '/project',
  )
  assert.match(
    opaque,
    /hozoClasses\(getClasses\(\), \{ disabled: false, enabled: false, readOnly: true/,
  )
})

test('Menu slots keep enabled button expansion apart from non-form item disabled announcements', () => {
  const output = transformHozoSource(
    `import {Menu} from '@hozo/core';export function C(){return <Menu trigger="Actions" items={items}
      className="disabled:opacity-25 enabled:opacity-50 text-red-500"
      triggerClassName="focus:opacity-50 enabled:px-3 aria-expanded:border-2"
      menuClassName="read-only:rounded-lg disabled:opacity-25"
      itemClassName="focus:opacity-50 hover:opacity-75 aria-disabled:opacity-25 aria-selected:ml-8 disabled:mt-8 enabled:mb-8"
      itemStyle={extra}/>} `,
    'Menu.tsx',
  )
  assert.ok(output)
  assert.match(output, /hozoTriggerStyle=/)
  assert.match(output, /hozoItemStyle=/)
  assert.match(output, /'aria-expanded': __hozoSlotAriaExpanded/)
  assert.match(output, /'aria-disabled': __hozoSlotAriaDisabled/)
  assert.match(output, /itemStyle=\{extra\}/)
  assert.doesNotMatch(output, /hozoClasses|triggerClassName=|itemClassName=/)
  const jsx = output.slice(output.indexOf('<HozoMenu'))
  assert.match(jsx, /hozo_r0_1_enabled/)
  assert.doesNotMatch(jsx, /_disabled|_ariaselected/)
  assert.doesNotMatch(jsx.slice(jsx.indexOf('hozoItemStyle=')), /_enabled/)
})

test('Listbox slots compile known div facts and each option own focus and selection', () => {
  const output = transformHozoSource(
    `import {Listbox} from '@hozo/core';export function C(){return <Listbox options={options}
      className="disabled:opacity-25 enabled:opacity-50 text-red-500"
      optionClassName="focus:opacity-50 focus-visible:outline-2 hover:opacity-75 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8"
      optionStyle={extra}/>} `,
    'Listbox.tsx',
  )
  assert.ok(output)
  assert.match(output, /hozoOptionStyle=/)
  assert.match(output, /focused &&/)
  assert.match(output, /focusVisible &&/)
  assert.match(output, /'aria-selected': __hozoSlotAriaSelected/)
  assert.match(output, /'aria-disabled': __hozoSlotAriaDisabled/)
  assert.match(output, /optionStyle=\{extra\}/)
  assert.doesNotMatch(output, /hozoClasses|optionClassName=/)
  assert.doesNotMatch(output.slice(output.indexOf('<HozoListbox')), /_enabled|_disabled/)
})

test('lowers Canvas paint to Native colors without requiring a semantic primitive', () => {
  const source = `import { Canvas } from '@hozo/canvas'
export function Chart() {
  return <Canvas decorative width={100} height={40}>
    <Canvas.Path className="fill-none stroke-blue-500 stroke-2 opacity-50" path="M0 0L10 10" />
  </Canvas>
}
`
  const output = transformHozoSource(source, 'Chart.tsx')
  assert.ok(output)
  assert.match(
    output,
    /<Canvas\.Path fill="none" stroke="#2b7fff" strokeWidth=\{2\} opacity=\{0\.5\}/,
  )
  assert.ok(!output.includes('StyleSheet.create'))
})

test('imports every generated SVG element from its optional domain package', () => {
  const source = `import { Svg } from '@hozo/svg'
export function Graphic() {
  return <Svg><Svg.Marker id="dot" /><Svg.ForeignObject /></Svg>
}
`
  const output = transformHozoSource(source, 'Graphic.tsx')
  assert.ok(output)
  assert.match(output, /import \{ Svg, Marker, ForeignObject \} from '@hozo\/svg'/)
  assert.doesNotMatch(output, /@hozo\/runtime\/svg/)
})

test('merges a carried SVG namespace with generated component imports', () => {
  const source = `import { Svg } from '@hozo/svg'
export function Graphic() { return <Svg><Svg.Custom /></Svg> }
`
  const output = transformHozoSource(source, 'Graphic.tsx')
  assert.ok(output)
  assert.equal(output.match(/from '@hozo\/svg'/g)?.length, 1)
  assert.match(output, /<Svg\.Custom/)
})

test('filter compiler ABI imports come from the SVG owner, not generated layout helpers', () => {
  const source = `import { Svg } from '@hozo/svg'
export function Soft() { return <Svg><Svg.Defs><Svg.Filter id="soft">
  <Svg.FeColorMatrix type="saturate" values="0" result="gray" />
  <Svg.FeGaussianBlur in="gray" stdDeviation={2} />
</Svg.Filter></Svg.Defs><Svg.Rect filter="url(#soft)" /></Svg> }
`
  const output = transformHozoSource(source, 'Soft.tsx')
  assert.ok(output)
  assert.match(
    output,
    /import \{ Svg, Defs, Filter, FeColorMatrix, FeGaussianBlur, Rect \} from '@hozo\/svg'/,
  )
  assert.match(output, /<FeGaussianBlur in="gray" stdDeviation=\{2\}/)
  assert.match(output, /filter="url\(#soft\)"/)
  assert.doesNotMatch(output, /react-native'|@hozo\/primitives|@hozo\/engine/)
})

test('every Native-backed filter composition import uses the optional SVG package', () => {
  const source = `import { Svg } from '@hozo/svg'
export function Shadow() { return <Svg><Svg.Defs><Svg.Filter id="shadow">
  <Svg.FeOffset dx={2} dy={3} result="offset" />
  <Svg.FeFlood floodColor="black" floodOpacity={0.5} result="paint" />
  <Svg.FeComposite in="paint" in2="offset" operator="in" result="shadow" />
  <Svg.FeBlend in="shadow" in2="SourceGraphic" mode="multiply" />
  <Svg.FeMerge><Svg.FeMergeNode in="shadow" /><Svg.FeMergeNode in="SourceGraphic" /></Svg.FeMerge>
  <Svg.FeDropShadow dx={2} dy={3} stdDeviation="2" />
</Svg.Filter></Svg.Defs></Svg> }`
  const output = transformHozoSource(source, 'Shadow.tsx')
  assert.ok(output)
  assert.match(
    output,
    /import \{ Svg, Defs, Filter, FeOffset, FeFlood, FeComposite, FeBlend, FeMerge, FeMergeNode, FeDropShadow \} from '@hozo\/svg'/,
  )
  assert.match(output, /<FeComposite in="paint" in2="offset" operator="in" result="shadow"/)
  assert.match(
    output,
    /<FeMerge><FeMergeNode in="shadow"><\/FeMergeNode><FeMergeNode in="SourceGraphic"><\/FeMergeNode><\/FeMerge>/,
  )
  assert.doesNotMatch(output, /react-native'|@hozo\/primitives|@hozo\/engine/)
})

test('direct owner imports keep non-component compatibility values while components lower', () => {
  const source = `import { View } from '@hozo/primitives'
import { Platform } from '@hozo/rn-compat'
export function Card() { return <View testID={Platform.OS} /> }
`
  const output = transformHozoSource(source, 'Card.tsx')
  assert.ok(output)
  assert.match(output, /import \{ View \} from 'react-native'/)
  assert.match(output, /import \{ Platform \} from '@hozo\/rn-compat'/)
  assert.doesNotMatch(output, /@hozo\/primitives/)
})

test('strips the @hozo/core import and adds a react-native one', () => {
  const output = transformHozoSource(LOGIN_SOURCE, 'Login.tsx')
  assert.ok(output)
  assert.ok(!output!.includes("from '@hozo/core'"))
  assert.match(output!, /import \{[^}]*\} from 'react-native'/)
  // Button -> Pressable, so Pressable (not Button) is what should be
  // imported -- @hozo/core's Button has no RN equivalent, see hozo_native.
  assert.match(output!, /import \{[^}]*Pressable[^}]*\} from 'react-native'/)
  assert.ok(!output!.includes('Button,') && !output!.includes(', Button'))
})

test('keeps PanResponder in its explicit compatibility package', () => {
  const output = transformHozoSource(
    `
      import { View } from '@hozo/core'
      import { PanResponder } from '@hozo/rn-compat'
      const pan = PanResponder.create({ onMoveShouldSetPanResponder: () => true })
      export function Drag() { return <View {...pan.panHandlers} /> }
    `,
    'Drag.tsx',
  )
  assert.ok(output)
  // No `StyleSheet`: this component has no classes, so nothing generated a
  // style object for it to create.
  assert.match(output, /import \{[^}]*View[^}]*\} from 'react-native'/)
  assert.match(output, /import \{ PanResponder \} from '@hozo\/rn-compat'/)
  assert.ok(!output.includes('StyleSheet'), output)
  assert.match(output, /<View \{\.\.\.pan\.panHandlers\}/)
  assert.doesNotMatch(output, /@hozo\/core/)
})

test('preserves an aliased compatibility import without losing its local binding', () => {
  const output = transformHozoSource(
    `
      import { View } from '@hozo/core'
      import { PanResponder as GestureResponder } from '@hozo/rn-compat'
      const pan = GestureResponder.create({ onMoveShouldSetPanResponder: () => true })
      export function Drag() { return <View {...pan.panHandlers} /> }
    `,
    'Drag.tsx',
  )
  assert.ok(output)
  assert.match(output, /import \{ PanResponder as GestureResponder \} from '@hozo\/rn-compat'/)
  assert.match(output, /GestureResponder\.create/)
  assert.doesNotMatch(output, /@hozo\/core/)
})

test('does not infer a native value import from unrelated source text', () => {
  const output = transformHozoSource(
    `
      import { View } from '@hozo/core'
      // PanResponder is deliberately only prose here.
      export function Card() { return <View /> }
    `,
    'Card.tsx',
  )
  assert.ok(output)
  assert.doesNotMatch(output, /import \{[^}]*PanResponder[^}]*\} from 'react-native'/)
})

test('asks the compiler for one module analysis on an ordinary Native file', () => {
  const base = createCompiler()
  let moduleCalls = 0
  let legacyCalls = 0
  let canvasCalls = 0
  const measured: Compiler = {
    ...base,
    compileNative(source) {
      legacyCalls += 1
      return base.compileNative(source)
    },
    compileNativeModule(source) {
      moduleCalls += 1
      return base.compileNativeModule(source)
    },
    compileCanvasPaints(source, native) {
      canvasCalls += 1
      return base.compileCanvasPaints(source, native)
    },
  }

  const output = transformHozoSource(
    'import { View } from \'react-native\'\nexport const Card = () => <View className="p-4" />\n',
    'Card.tsx',
    undefined,
    measured,
  )

  assert.ok(output)
  assert.equal(moduleCalls, 1)
  assert.equal(legacyCalls, 0)
  assert.equal(canvasCalls, 0, 'a file without @hozo/canvas needs no Canvas parse')
})

test('injects a StyleSheet.create declaration and rewrites the JSX span', () => {
  const output = transformHozoSource(LOGIN_SOURCE, 'Login.tsx')
  assert.ok(output)
  assert.match(output!, /const hozoStyles = StyleSheet\.create\(\{/)
  assert.match(output!, /<View style=\{hozoStyles\.hozo_r0_0\}>/)
  assert.match(output!, /<Text style=\{hozoStyles\.hozo_r0_1\}>Welcome<\/Text>/)
  // The Pressable's label is wrapped: React Native crashes on a raw
  // string inside anything but a Text.
  assert.match(
    output!,
    /<Pressable style=\{hozoStyles\.hozo_r0_2\}[^>]*><Text>Continue<\/Text><\/Pressable>/,
  )
})

test('lowers static StyleX through the same Native StyleSheet path', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: { padding: 16, backgroundColor: '#ff0000' },
  active: { opacity: 0.5 },
})
export function Card({ active }) {
  return <View {...stylex.props(styles.root, active && styles.active)} />
}
`
  const output = transformHozoSource(source, 'Card.tsx')
  assert.ok(output)
  assert.doesNotMatch(output, /stylex\.props/)
  assert.match(output, /paddingTop: 16/)
  assert.match(output, /backgroundColor: '#ff0000'/)
  assert.match(output, /active\) && hozoStyles\.hozo_r0_0_cond_/)
  // The definition remains for the project's existing StyleX Babel pass to
  // eliminate. Hozo must run before it; the coexistence test pins why.
  assert.match(output, /stylex\.create/)
})

test('imports and directly lowers the canonical Image primitive', () => {
  const source = `import { Image } from '@hozo/core'
export function Cover() {
  return <Image className="w-20 h-20 object-cover" src="https://example.com/cover.jpg" alt="Cover" />
}
`
  const output = transformHozoSource(source, 'Cover.tsx')
  assert.ok(output)
  assert.match(output!, /import \{[^}]*Image[^}]*\} from 'react-native'/)
  assert.match(
    output!,
    /<Image style=\{hozoStyles\.hozo_r0_0\} accessibilityLabel=\{"Cover"\} source=\{\{ uri: "https:\/\/example\.com\/cover\.jpg" \}\} \/>/,
  )
  assert.ok(!output!.includes("from '@hozo/core'"))
})

test('normalizes a platform-resolved Image source only when its type is dynamic', () => {
  const source = `import { Image } from '@hozo/core'
export function Logo() {
  return <Image src={logo} alt="Logo" onLoad={loaded} onError={failed} />
}
`
  const output = transformHozoSource(source, 'Logo.tsx')
  assert.ok(output)
  assert.match(output!, /import \{ hozoImageSource \} from '@hozo\/core\/generated\/image-source'/)
  assert.match(output!, /source=\{hozoImageSource\(logo\)\}/)
  assert.match(output!, /onLoad=\{loaded\}/)
  assert.match(output!, /onError=\{failed\}/)
})

test('imports ScrollView without adding a runtime wrapper', () => {
  const source = `import { ScrollView, View } from '@hozo/core'
export function Rail() {
  return <ScrollView horizontal className="h-40"><View /></ScrollView>
}
`
  const output = transformHozoSource(source, 'Rail.tsx')
  assert.ok(output)
  assert.match(output!, /import \{[^}]*ScrollView[^}]*\} from 'react-native'/)
  assert.match(output!, /<ScrollView style=\{hozoStyles\.hozo_r0_0\} horizontal=\{true\}>/)
  assert.ok(!output!.includes('HozoScrollView'))
})

test('lowers Hozo primitives nested inside FlatList renderItem', () => {
  const source = `import { FlatList, Text } from '@hozo/core'
export function Rows() {
  return <FlatList className="h-40" data={rows} renderItem={({ item }) => <Text className="p-2">{item}</Text>} />
}
`
  const output = transformHozoSource(source, 'Rows.tsx')
  assert.ok(output)
  // `HozoFlatList` from `@hozo/primitives` rather than `FlatList` from
  // `react-native`: the list is React Native's, and what the wrapper around it
  // adds is the collection length Android needs to announce a windowed list
  // honestly. `Text` still comes straight from `react-native`.
  assert.match(output!, /import \{ HozoFlatList \} from '@hozo\/core\/generated\/flat-list'/)
  assert.doesNotMatch(output!, /import \{[^}]*FlatList[^}]*\} from 'react-native'/)
  assert.match(output!, /import \{[^}]*Text[^}]*\} from 'react-native'/)
  assert.match(
    output!,
    /renderItem=\{\(\{ item \}\) => <Text style=\{hozoStyles\.hozo_r0_1\}>\{item\}<\/Text>\}/,
  )
  assert.ok(!output!.includes("from '@hozo/core'"))
})

test('fails the build on a Web-only utility instead of dropping it', () => {
  // `inline-block` has no React Native equivalent, so there is no correct output
  // to fall back to -- compiling anyway would look right on Web and be
  // silently wrong on device.
  const source = `import { View } from '@hozo/core'

export function Card() {
  return <View className="inline-block" />
}
`
  assert.throws(() => transformHozoSource(source, 'Card.tsx'), /WEB_ONLY_PROPERTY_ON_NATIVE/)
})

test('namespaces style/JSX identifiers per root so multiple components in one file do not collide', () => {
  const source = `import { View } from '@hozo/core'

export function First() {
  return <View className="p-4" />
}

export function Second() {
  return <View className="p-6" />
}
`
  const output = transformHozoSource(source, 'Multi.tsx')
  assert.ok(output)
  assert.match(output!, /hozo_r0_0/)
  assert.match(output!, /hozo_r1_0/)
  // The two components' style keys must actually differ, not just both
  // exist as separate unrelated strings.
  assert.notEqual(output!.match(/hozo_r0_0/)?.[0], undefined)
})

const DYNAMIC_SOURCE = `import { View } from '@hozo/core'

export function Card({ extra }) {
  return <View className={extra} />
}
`

test('hands an unreadable className to the generated resolver instead of failing', () => {
  // This used to be a build error: RN has no className to pass it through
  // to. It now resolves on device from the project-wide candidate map.
  const output = transformHozoSource(DYNAMIC_SOURCE, '/app/src/Card.tsx', '/app')
  assert.ok(output)
  assert.match(output!, /hozoClasses\(extra\)/)
  assert.match(
    output!,
    /import \{ hozoClasses \} from '\.\.\/node_modules\/\.hozo\/candidates\.native\.js'/,
  )
})

test('does not import the candidate module into files that never call it', () => {
  // Otherwise every lowered file would depend on a module that only exists
  // once the config-time scan has run.
  const output = transformHozoSource(LOGIN_SOURCE, '/app/src/Login.tsx', '/app')
  assert.ok(output)
  assert.ok(!output!.includes('hozoClasses'))
})

test('says what is missing when the candidate module was never generated', () => {
  assert.throws(
    () => transformHozoSource(DYNAMIC_SOURCE, '/app/src/Card.tsx'),
    /generateCandidateModule/,
  )
})

test('splices hook declarations at the top of the component function', () => {
  // `dark:` and the breakpoints compile to a React hook. It has to be a
  // statement inside the component: a hook call inlined into the JSX
  // (`style={[a, useHozoDark() && b]}`) breaks the rules of hooks the
  // moment the element sits behind a conditional.
  const source = `import { View, Text } from '@hozo/core'

export function Card() {
  return (
    <View className="p-4 dark:bg-black md:flex-row">
      <Text className="dark:text-white">a</Text>
    </View>
  )
}
`
  const output = transformHozoSource(source, '/app/src/Card.tsx', '/app')
  assert.ok(output)
  assert.match(
    output!,
    /import \{[^}]*useHozoDark[^}]*\} from '@hozo\/core\/generated\/environment'/,
  )
  assert.match(output!, /export function Card\(\) \{\n {2}const __hozoDark = useHozoDark\(\)/)
  assert.match(output!, /const __hozoBp_md = useHozoBreakpoint\('md'\)/)
  // One declaration, though two elements guard on it -- a second `const`
  // would redeclare the binding and change the hook order.
  assert.equal(output!.match(/const __hozoDark =/g)?.length, 1)
  assert.match(output!, /__hozoDark && hozoStyles\.hozo_r0_0_dark/)
})

test('refuses a hook where no statement can go', () => {
  const source = `import { View } from '@hozo/core'
const el = <View className="dark:bg-black" />
`
  assert.throws(
    () => transformHozoSource(source, '/app/src/x.tsx', '/app'),
    /need a React hook, which can only go inside a component function/,
  )
})

test("refuses a hook in a class component's render, where any hook is invalid (#1183)", () => {
  for (const body of ['render() {', 'render = () => {']) {
    const source = `import { Component } from 'react'
import { Text } from '@hozo/core'
export class Caught extends Component {
  ${body}
    return <Text className="dark:text-white">failed</Text>
  }
}
`
    assert.throws(
      () => transformHozoSource(source, '/app/src/x.tsx', '/app'),
      /class component's render/,
      body,
    )
  }
})

test('lowers ScrollView refresh through a native RefreshControl', () => {
  const source = `import { ScrollView, Text } from '@hozo/core'
export function Results({ refreshing, reload, horizontal }) {
  return <ScrollView className="h-40" horizontal={horizontal}
    refreshing={refreshing} onRefresh={reload}
    keyboardShouldPersistTaps="handled"
    showsHorizontalScrollIndicator={false}>
    <Text>row</Text>
  </ScrollView>
}
`
  const output = transformHozoSource(source, '/app/src/Results.tsx', '/app')
  assert.ok(output)
  assert.match(
    output!,
    /import \{[^}]*ScrollView[^}]*RefreshControl[^}]*StyleSheet[^}]*\} from 'react-native'/,
  )
  assert.match(output!, /horizontal=\{horizontal\}/)
  assert.match(output!, /keyboardShouldPersistTaps=\{"handled"\}/)
  assert.match(output!, /showsHorizontalScrollIndicator=\{false\}/)
  assert.match(
    output!,
    /refreshControl=\{<RefreshControl refreshing=\{refreshing\} onRefresh=\{reload\} \/>\}/,
  )
})

test('preserves Native FlatList virtualization controls while lowering nested components', () => {
  const source = `import { FlatList, Text } from '@hozo/core'
export function Results({ rows, loading, reload, loadMore }) {
  return <FlatList data={rows} numColumns={2}
    refreshing={loading} onRefresh={reload}
    onEndReached={loadMore} onEndReachedThreshold={0.5}
    showsVerticalScrollIndicator={false}
    ListEmptyComponent={<Text className="p-2">Empty</Text>}
    renderItem={({ item }) => <Text className="p-1">{item}</Text>} />
}
`
  const output = transformHozoSource(source, '/app/src/Results.tsx', '/app')
  assert.ok(output)
  assert.match(output!, /<HozoFlatList accessibilityRole="list"/)
  assert.match(output!, /showsVerticalScrollIndicator=\{false\}/)
  assert.match(output!, /refreshing=\{loading\} onRefresh=\{reload\}/)
  assert.match(output!, /data=\{rows\} numColumns=\{2\}/)
  assert.match(output!, /onEndReached=\{loadMore\} onEndReachedThreshold=\{0\.5\}/)
  assert.match(
    output!,
    /ListEmptyComponent=\{<Text style=\{hozoStyles\.hozo_r0_1\}>Empty<\/Text>\}/,
  )
  assert.match(
    output!,
    /renderItem=\{\(\{ item \}\) => <Text style=\{hozoStyles\.hozo_r0_2\}>\{item\}<\/Text>\}/,
  )
})

test('compiles a plain React Native file, which is what an Expo app is', () => {
  // Proposal §2.1. The compiler always handled this; the gate in front of
  // it was `code.includes('@hozo/core')`, which skipped every Expo and
  // React Native project on the grounds that it had not been rewritten.
  const output = transformHozoSource(
    "import { View, Text } from 'react-native'\n" +
      'export function Card() { return (<View className="rounded-xl p-4"><Text className="font-bold">Hi</Text></View>) }\n',
    'Card.tsx',
  )
  assert.ok(output)
  assert.match(output, /StyleSheet\.create/)
  assert.match(output, /borderRadius: 12/)
  assert.match(output, /style=\{hozoStyles\.hozo_r0_0\}/)
  assert.ok(!output.includes('className='), 'the utility string should be gone')
})

test('adds only the react-native bindings the file does not already have', () => {
  // Re-declaring a name the file already imports is a SyntaxError, not a
  // duplicate: `Identifier 'View' has already been declared`. The
  // prepended import was unconditional while `@hozo/core` was the only
  // accepted source, because that import gets stripped and could not
  // collide.
  const output = transformHozoSource(
    "import { View, Text } from 'react-native'\n" +
      'export function Card() { return (<View className="p-4"><Text>Hi</Text></View>) }\n',
    'Card.tsx',
  )
  assert.ok(output)
  assert.equal(
    output.match(/from 'react-native'/g)?.length,
    2,
    'one original import plus one added',
  )
  assert.match(output, /import \{ StyleSheet \} from 'react-native'/)
})

test('adds no import at all when the file already has everything', () => {
  const output = transformHozoSource(
    "import { StyleSheet, View } from 'react-native'\n" +
      'export function Card() { return (<View className="p-4" />) }\n',
    'Card.tsx',
  )
  assert.ok(output)
  assert.equal(output.match(/from 'react-native'/g)?.length, 1)
})

test('carries a foreign component and lowers the tree around it', () => {
  // The `@expo/ui` case, which is the reason resolution is per tag rather
  // than per file: that package exports `Text`, `Button`, `List`,
  // `ListItem`, `ScrollView` and `TextInput`, every one a native platform
  // component sharing nothing with the Hozo primitive but its spelling.
  const output = transformHozoSource(
    "import { View } from 'react-native'\nimport { Button, Host } from '@expo/ui/swift-ui'\n" +
      'export function Screen() { return (<View className="p-4"><Host><Button label="Save" /></Host></View>) }\n',
    'Screen.tsx',
  )
  assert.ok(output)
  assert.match(output, /style=\{hozoStyles\.hozo_r0_0\}/, 'the View should have lowered')
  assert.match(output, /<Host><Button label="Save" \/><\/Host>/, 'the @expo/ui half must survive')
  assert.ok(!output.includes('className='), 'the utility string should be gone')
})

test('a project can add its own module to the trusted list', () => {
  const source =
    'import { View } from \'./ui\'\nexport function Card() { return (<View className="p-4" />) }\n'
  assert.equal(transformHozoSource(source, 'Card.tsx'), null)
  const withUi = createCompiler(undefined, ['@hozo/core', 'react-native', './ui'])
  const output = transformHozoSource(source, 'Card.tsx', undefined, withUi)
  assert.ok(output)
  assert.match(output, /StyleSheet\.create/)
})

test('does not import React Native’s component when the name is somebody else’s', () => {
  // `@expo/ui` exports `Text`, and the file already binds that name.
  // Adding React Native's beside it is `Identifier 'Text' has already been
  // declared` -- which is the same reason the compiler carried the tag
  // rather than lowering it.
  const output = transformHozoSource(
    "import { View } from 'react-native'\nimport { Text } from '@expo/ui/swift-ui'\n" +
      'export function S() { return (<View className="p-4"><Text>hi</Text></View>) }\n',
    'S.tsx',
  )
  assert.ok(output)
  assert.match(output, /import \{ StyleSheet \} from 'react-native'/)
  assert.ok(!/import \{[^}]*\bText\b[^}]*\} from 'react-native'/.test(output), output)
  assert.match(output, /<Text>hi<\/Text>/, 'the @expo/ui Text must survive')
})

test('leaves React Native’s own Button alone', () => {
  // The two share a name and no API: React Native's takes a `title` and
  // renders no children, Hozo's is a semantic primitive that lowers to a
  // Pressable wrapping its children. Trusting `react-native` wholesale
  // turned `<Button title="Go" onPress={f} />` into
  // `<Pressable onPress={f} title="Go"></Pressable>` -- a control that
  // renders nothing, in a file nobody asked Hozo to change.
  const source =
    "import { Button, View } from 'react-native'\n" +
    'export function S() { return <View><Button title="Go" onPress={f} /></View> }\n'
  assert.equal(transformHozoSource(source, 'S.tsx'), source, 'the file should come back untouched')
})

test('writes no StyleSheet for a file that produced no styles', () => {
  // Reached by every React Native file with no Tailwind classes, which in
  // a partly-migrated app is most of them. They were each getting a
  // `const hozoStyles = StyleSheet.create({})` for their trouble.
  const output = transformHozoSource(
    "import { FlatList } from 'react-native'\n" +
      'export function S() { return <FlatList data={[]} renderItem={() => null} /> }\n',
    'S.tsx',
  )
  assert.ok(output)
  assert.ok(!output.includes('StyleSheet'), output)
  // The semantic contribution still happens -- that is why the file is
  // rewritten at all.
  assert.match(output, /accessibilityRole="list"/)
})

test('a tag the compiler carried keeps the import that defines it', () => {
  // Found by an emulator, in the only way it could be.
  //
  // `Del` is `export const Del = Strikethrough` in `@hozo/typography`. The
  // compiler matches on the tag and has no `Primitive` for that one, so it
  // carries `<Del>` through verbatim -- which is the deliberate fallback --
  // and the import was then deleted unconditionally. Nothing defined `Del`
  // in the output, so the bundle built, shipped, and died on first render
  // with `ReferenceError: Property 'Del' doesn't exist`.
  //
  // Metro bundles an undefined identifier happily; it is only an error when
  // it runs. So no test here could see it and the device saw it at once.
  const source = [
    "import { Del, Strikethrough, Text } from '@hozo/core'",
    'export function F() {',
    '  return <Text><Del>gone</Del><Strikethrough>struck</Strikethrough></Text>',
    '}',
  ].join('\n')
  const out = transformHozoSource(source, 'F.tsx') as string

  assert.match(out, /<Del>/, 'the carried tag was supposed to survive')
  assert.match(out, /import \{ Del \} from '@hozo\/core'/)
})

test('and nothing else comes back with it', () => {
  // The name alone cannot answer this. `View` and `Text` are in the
  // compiled output as React Native components under the same spelling, so
  // a survivor test that looked only at names would re-import every file's
  // primitives -- and declare each of them twice, which is a syntax error
  // rather than a slow leak. What React Native provides is subtracted
  // first.
  const source = [
    "import { View, Text } from '@hozo/core'",
    'export function F() { return <View><Text>hi</Text></View> }',
  ].join('\n')
  const out = transformHozoSource(source, 'F.tsx') as string

  assert.doesNotMatch(out, /@hozo\/core/)
  assert.equal((out.match(/^import .* from 'react-native'$/gm) ?? []).length, 1)
})

test('a foreign component is nobody else s to import', () => {
  // `@expo/ui`'s `Button` is carried on purpose -- the compiler declines to
  // lower a tag from a module the project does not trust -- and it already
  // has an import of its own. Adding `@hozo/core` for it would bind the
  // name twice and to the wrong component.
  const source = [
    "import { View } from '@hozo/core'",
    "import { Button } from '@expo/ui'",
    'export function F() { return <View><Button label="x" /></View> }',
  ].join('\n')
  const out = transformHozoSource(source, 'F.tsx') as string

  assert.doesNotMatch(out, /@hozo\/core/)
  assert.match(out, /import \{ Button \} from '@expo\/ui'/)
})

// #670, on the Native half: the same refusal before anything is prepended.
test('a module that binds a name the Native output imports is refused, naming it', () => {
  const source =
    `import { Dialog } from '@hozo/core'\n` +
    `export function HozoDialog({ children }) {\n` +
    `  return <Dialog visible>{children}</Dialog>\n` +
    `}\n`
  assert.throws(
    () => transformHozoSource(source, 'Confirm.tsx'),
    (error: Error) =>
      error.message.includes('RUNTIME_IMPORT_COLLISION') &&
      error.message.includes('binds `HozoDialog`'),
  )
})

// #1166. A class list handed to a pattern goes to the runtime resolver,
// which drops what React Native cannot draw; the build says so, at the prop.
test('warns about a class React Native cannot draw in a pattern prop, but not in a dependency', (t) => {
  const source = `import { BottomSheet } from '@hozo/patterns'
import { View } from '@hozo/core'

export function Sheet() {
  return (
    <BottomSheet handleClassName="h-6 before:block cursor-grab">
      <View className="p-4" />
    </BottomSheet>
  )
}
`
  const warn = t.mock.method(console, 'warn', () => {})
  transformHozoSource(source, 'Sheet.tsx')
  const warnings = warn.mock.calls.map((call) => String(call.arguments[0]))
  assert.deepEqual(
    warnings.filter((message) => message.includes('CLASS_NOT_DRAWN_ON_NATIVE')).length,
    1,
    warnings.join('\n'),
  )
  const [warning] = warnings.filter((message) => message.includes('CLASS_NOT_DRAWN_ON_NATIVE'))
  assert.match(warning, /`before:block` in handleClassName on <BottomSheet>/)

  warn.mock.resetCalls()
  transformHozoSource(source, '/app/node_modules/kit/Sheet.tsx')
  assert.ok(
    warn.mock.calls.every(
      (call) => !String(call.arguments[0]).includes('CLASS_NOT_DRAWN_ON_NATIVE'),
    ),
  )
})
