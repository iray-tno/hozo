// Build-time source of truth, never imported by an application. A slot's
// presence is an inventory entry, not a claim that its owner has been audited.
const supplied = (alias) => ({ alias })
const absentAriaFacts = {
  'aria-disabled': false,
  'aria-selected': false,
  'aria-checked': false,
}
const textInputFacts = {
  disabled: supplied('__hozoSlotDisabled'),
  enabled: supplied('__hozoSlotEnabled'),
  readOnly: supplied('__hozoSlotReadOnly'),
  ...absentAriaFacts,
}
const editableInputFacts = {
  ...textInputFacts,
  disabled: false,
  enabled: true,
  readOnly: false,
}
const nonControlFacts = {
  disabled: false,
  enabled: false,
  readOnly: true,
  ...absentAriaFacts,
}

// Actual Native consumers supply live values; these definitions do not
// observe events, infer state, or declare an owner audited.
const buttonConstantFacts = { readOnly: true, ...absentAriaFacts }
const buttonLiveFacts = ['hovered', 'pressed', 'focused', 'focusVisible', 'disabled', 'enabled']
export const formFactProfiles = {
  FormButton: {
    constants: buttonConstantFacts,
    live: buttonLiveFacts,
  },
  PickerButton: {
    constants: buttonConstantFacts,
    live: [...buttonLiveFacts, 'aria-expanded'],
  },
  FilePicker: {
    constants: { ...buttonConstantFacts, 'aria-busy': false },
    live: buttonLiveFacts,
  },
  CalendarDay: {
    constants: { disabled: false, enabled: false, readOnly: true, 'aria-checked': false },
    live: [
      'hovered',
      'pressed',
      'focused',
      'focusVisible',
      'aria-selected',
      'aria-disabled',
      'data-hozo-outside',
      'data-hozo-disabled',
      'data-hozo-range-start',
      'data-hozo-range-end',
      'data-hozo-in-range',
    ],
  },
  TimeValue: {
    constants: {
      disabled: false,
      enabled: false,
      readOnly: true,
      'aria-selected': false,
      'aria-checked': false,
    },
    live: ['hovered', 'focused', 'focusVisible', 'aria-disabled', 'data-hozo-disabled'],
  },
  TextAreaField: {
    constants: absentAriaFacts,
    live: [
      'focused',
      'focusVisible',
      'disabled',
      'enabled',
      'readOnly',
      'aria-invalid',
      'aria-required',
    ],
  },
  SelectControl: {
    constants: { readOnly: true, ...absentAriaFacts, 'aria-expanded': false },
    live: [
      'hovered',
      'pressed',
      'focused',
      'focusVisible',
      'disabled',
      'enabled',
      'aria-invalid',
      'aria-required',
    ],
  },
  SelectOption: {
    constants: { readOnly: true, 'aria-checked': false },
    live: ['pressed', 'disabled', 'enabled', 'aria-selected', 'aria-disabled'],
  },
}
export const profiles = {
  NonControl: {
    facts: nonControlFacts,
    note: 'A non-editable, non-form decorative element is neither disabled nor enabled and carries none of these ARIA attributes. Parent events are unavailable, not false.',
  },
  Chip: {
    facts: {
      disabled: supplied('__hozoSlotDisabled'),
      enabled: supplied('__hozoSlotEnabled'),
      'aria-pressed': supplied('__hozoSlotAriaPressed'),
      'aria-checked': false,
      'aria-disabled': false,
    },
    note: 'A standalone toggle or composite span and its remove button have different facts; the actual Chip supplies them. Neither invents aria-checked/disabled.',
  },
  Pagination: {
    facts: {
      disabled: supplied('__hozoSlotDisabled'),
      enabled: supplied('__hozoSlotEnabled'),
      'aria-disabled': supplied('__hozoSlotAriaDisabled'),
      'aria-selected': false,
    },
    note: 'Disabled Web buttons use :disabled, links use aria-disabled; aria-current is not aria-selected.',
  },
  Stepper: {
    facts: {
      disabled: supplied('__hozoSlotDisabled'),
      enabled: supplied('__hozoSlotEnabled'),
      'aria-selected': false,
      'aria-disabled': false,
    },
    note: 'The owner can be a button or a descriptive row. Event availability stays outside negation; semantic predicates still describe the row.',
  },
  ColorPicker: {
    facts: {
      disabled: supplied('__hozoSlotDisabled'),
      enabled: supplied('__hozoSlotEnabled'),
      'aria-checked': supplied('__hozoSlotAriaChecked'),
      'aria-disabled': false,
      'aria-selected': false,
    },
    note: 'Each radio owns checked/disabled; Native announcements do not create absent Web attributes.',
  },
  SliderThumb: {
    facts: {
      ...nonControlFacts,
      'aria-disabled': supplied('__hozoSlotAriaDisabled'),
    },
    note: 'The adjustable div owns non-touch focus and aria-disabled, not form disabled/enabled. Its Native track consumes pointers; the thumb cannot borrow pointer state.',
  },
  CommandPalette: {
    facts: {
      disabled: false,
      enabled: false,
      'aria-disabled': supplied('__hozoSlotAriaDisabled'),
      'aria-selected': supplied('__hozoSlotAriaSelected'),
      'aria-checked': false,
    },
    note: 'Option divs are neither disabled nor enabled controls. The Web input keeps focus, not its active option.',
  },
  TextInput: {
    facts: textInputFacts,
    note: 'Only the real input supplies focus and mutability; disabled fields are read-only too.',
  },
  CommandInput: {
    facts: {
      ...editableInputFacts,
      'aria-expanded': true,
    },
    note: 'The real command search input is always editable and expanded while mounted on Web; options do not own its focus.',
  },
  ComboboxInput: {
    facts: {
      ...editableInputFacts,
      'aria-expanded': supplied('__hozoSlotAriaExpanded'),
      'aria-invalid': supplied('__hozoSlotAriaInvalid'),
    },
    note: 'The editable input owns focus and the popup expanded state; neither list nor option lends it events.',
  },
  ListOption: {
    facts: {
      ...nonControlFacts,
      'aria-disabled': supplied('__hozoSlotAriaDisabled'),
      'aria-selected': supplied('__hozoSlotAriaSelected'),
    },
    note: 'Option divs are non-form owners. Each widget supplies its own selection meaning; focus ownership is declared per slot.',
  },
  MenuTrigger: {
    facts: {
      ...nonControlFacts,
      enabled: true,
      'aria-expanded': supplied('__hozoSlotAriaExpanded'),
    },
    note: 'The real button is enabled and non-editable. It owns expanded state, not item disabled announcements or selection.',
  },
  MenuItem: {
    facts: {
      ...nonControlFacts,
      'aria-disabled': supplied('__hozoSlotAriaDisabled'),
    },
    note: 'An action div owns focus and aria-disabled, not form disabled/enabled or selected/checked state.',
  },
  OtpDecoration: {
    facts: {
      disabled: false,
      enabled: false,
      readOnly: true,
      'aria-disabled': false,
      'aria-selected': false,
      'aria-checked': false,
    },
    note: 'Non-editable divs/spans match read-only, neither disabled nor enabled. They never borrow input focus.',
  },
}

function slots(names, { secondary = false, overrides = {} } = {}) {
  return names.split(' ').map((classProp) => ({
    classProp,
    styleProp: classProp === 'className' ? 'style' : classProp.replace(/ClassName$/, 'Style'),
    lowering: classProp === 'className' ? 'root' : secondary ? 'secondary' : 'component-managed',
    owner: 'pending-audit',
    gate: 'pending-audit',
    composition: 'pending-audit',
    ...overrides[classProp],
  }))
}
const owned = (
  owner,
  profile,
  callback,
  {
    focus = true,
    pointer = true,
    optionalOwner = null,
    gate = 'always',
    composition = 'split-box-text',
  } = {},
) => ({ owner, profile, callback, focus, pointer, optionalOwner, gate, composition })

// Form inventory is deliberately separate from the closed Primitive mappings.
// A named slot here is not an assessed owner or a new compiler callback ABI.
function formSlots(names, paired = 'className', overrides = {}) {
  const styles = new Set(paired.split(' '))
  return slots(names, { overrides }).map((slot) => ({
    ...slot,
    lowering: 'component-managed',
    ...(styles.has(slot.classProp)
      ? {}
      : {
          styleProp: null,
          reason: 'No paired public Native style prop; inventory does not invent a carrier ABI.',
        }),
  }))
}
const pickerClasses =
  'className triggerClassName dialogClassName calendarClassName dayClassName headerClassName gridClassName monthButtonClassName'

function pickerOverrides(prefix, extra = {}) {
  return {
    className: {
      owner: `${prefix}-wrapper`,
      gate: 'always',
      composition: 'prepared-owner-contract; split-box-text',
    },
    triggerClassName: {
      owner: `${prefix}-trigger`,
      gate: 'always',
      composition: 'prepared-owner-contract; split-box-text',
    },
    dialogClassName: {
      owner: `${prefix}-dialog`,
      gate: 'open',
      composition: 'prepared-owner-contract; split-box-text',
    },
    calendarClassName: {
      owner: `${prefix}-calendar-wrapper`,
      gate: 'open',
      composition: 'prepared-owner-contract; split-box-text',
    },
    dayClassName: {
      owner: `${prefix}-calendar-day-cell`,
      gate: 'open; each-day',
      composition: 'prepared-owner-contract; split-box-text',
    },
    headerClassName: {
      owner: `${prefix}-calendar-header`,
      gate: 'open',
      composition: 'prepared-owner-contract; split-box-text',
    },
    gridClassName: {
      owner: `${prefix}-calendar-grid`,
      gate: 'open',
      composition: 'prepared-owner-contract; split-box-text',
    },
    monthButtonClassName: {
      owner: `${prefix}-calendar-month-button`,
      gate: 'open',
      composition: 'prepared-owner-contract; split-box-text',
    },
    ...extra,
  }
}

export const formComponents = {
  Calendar: formSlots(
    'className dayClassName headerClassName gridClassName monthButtonClassName',
    'className dayClassName headerClassName monthButtonClassName',
    {
      className: {
        owner: 'calendar-wrapper',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      dayClassName: {
        owner: 'calendar-day-cell',
        gate: 'each-day',
        composition: 'prepared-owner-contract; split-box-text',
      },
      headerClassName: {
        owner: 'calendar-header',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      gridClassName: {
        owner: 'calendar-grid',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      monthButtonClassName: {
        owner: 'calendar-month-button',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  ),
  DatePicker: formSlots(
    pickerClasses,
    'className triggerClassName dialogClassName',
    pickerOverrides('date-picker'),
  ),
  DateRangePicker: formSlots(
    pickerClasses,
    'className triggerClassName dialogClassName',
    pickerOverrides('date-range-picker'),
  ),
  DateTimePicker: formSlots(
    `${pickerClasses} doneClassName`,
    'className triggerClassName dialogClassName doneClassName',
    pickerOverrides('date-time-picker', {
      doneClassName: {
        owner: 'date-time-picker-done-button',
        gate: 'open',
        composition: 'prepared-owner-contract; split-box-text',
      },
    }),
  ),
  Field: formSlots(
    'className labelClassName requiredClassName descriptionClassName errorClassName',
    '',
    {
      className: {
        owner: 'field-wrapper',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      labelClassName: {
        owner: 'field-label',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      requiredClassName: {
        owner: 'field-required-mark',
        gate: 'required',
        composition: 'prepared-owner-contract',
      },
      descriptionClassName: {
        owner: 'field-description',
        gate: 'description-present',
        composition: 'prepared-owner-contract',
      },
      errorClassName: {
        owner: 'field-error',
        gate: 'error-present',
        composition: 'prepared-owner-contract',
      },
    },
  ),
  FileDropzone: formSlots('className activeClassName', 'className', {
    className: {
      owner: 'file-picker-button',
      gate: 'always',
      composition: 'prepared-owner-contract; split-box-text',
    },
    activeClassName: {
      owner: 'file-dropzone-drag-active',
      gate: 'web-drag-active',
      composition: 'prepared-owner-contract; web-only',
    },
  }),
  Form: formSlots('className', 'className', {
    className: {
      owner: 'form-wrapper',
      gate: 'always',
      composition: 'prepared-owner-contract',
    },
  }),
  SubmitButton: formSlots('className', 'className', {
    className: {
      owner: 'submit-button',
      gate: 'always',
      composition: 'prepared-owner-contract; split-box-text',
    },
  }),
  NativeSelect: formSlots(
    'className indicatorClassName sheetClassName scrimClassName optionClassName',
    'className sheetClassName scrimClassName optionClassName',
    {
      className: {
        owner: 'native-select-control',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      indicatorClassName: {
        owner: 'native-select-indicator',
        gate: 'native-indicator-present',
        composition: 'prepared-owner-contract; native-only',
      },
      sheetClassName: {
        owner: 'native-select-sheet',
        gate: 'native-fallback-open',
        composition: 'prepared-owner-contract; native-only; split-box-text',
      },
      scrimClassName: {
        owner: 'native-select-scrim',
        gate: 'native-fallback-open',
        composition: 'prepared-owner-contract; native-only',
      },
      optionClassName: {
        owner: 'native-select-option',
        gate: 'native-fallback-open',
        composition: 'prepared-owner-contract; native-only; split-box-text',
      },
    },
  ),
  TextArea: formSlots(
    'className fieldClassName countClassName',
    'className fieldClassName countClassName',
    {
      className: {
        owner: 'textarea-wrapper',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      fieldClassName: {
        owner: 'textarea-field',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      countClassName: {
        owner: 'textarea-count',
        gate: 'maxLength-present',
        composition: 'prepared-owner-contract',
      },
    },
  ),
  TimePicker: formSlots(
    'className fieldClassName valueClassName periodClassName stepClassName',
    'className fieldClassName stepClassName',
    {
      className: {
        owner: 'time-picker-wrapper',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      fieldClassName: {
        owner: 'time-picker-field-group',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      valueClassName: {
        owner: 'time-picker-value-spinbutton',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      periodClassName: {
        owner: 'time-picker-period-button',
        gate: 'hour12',
        composition: 'prepared-owner-contract; split-box-text',
      },
      stepClassName: {
        owner: 'time-picker-step-button',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  ),
}

// Root and secondary props share the catalog even though this first slice
// deliberately preserves their existing, separate code-generation routes.
export const components = {
  CodeBlock: slots(
    'className lineClassName gutterClassName insClassName delClassName markClassName copyClassName captionClassName',
    {
      overrides: { className: { lowering: 'component-managed' } },
    },
  ),
  Splitter: slots('className', {
    overrides: {
      className: {
        lowering: 'component-managed',
        owner: 'splitter-handle',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
    },
  }),
  ResizablePane: slots('className paneClassName handleClassName', {
    overrides: {
      className: {
        lowering: 'component-managed',
        owner: 'resizable-pane-root',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      paneClassName: {
        owner: 'resizable-pane-pane',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      handleClassName: {
        owner: 'resizable-pane-handle',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
    },
  }),
  Accordion: slots(
    'className sectionClassName headingClassName triggerClassName panelClassName panelContentClassName',
    {
      overrides: {
        sectionClassName: {
          owner: 'accordion-section',
          gate: 'each-section',
          composition: 'prepared-owner-contract',
        },
        headingClassName: {
          owner: 'accordion-heading',
          gate: 'each-section',
          composition: 'prepared-owner-contract; split-box-text',
          styleProp: null,
          reason:
            'Native has no heading host or headingStyle: heading classes precede trigger classes on the trigger.',
        },
        triggerClassName: {
          owner: 'accordion-trigger',
          gate: 'each-section',
          composition: 'prepared-owner-contract; split-box-text',
        },
        panelClassName: {
          owner: 'accordion-panel',
          gate: 'each-panel',
          composition: 'prepared-owner-contract; split-box-text',
        },
        panelContentClassName: {
          owner: 'accordion-panel-content',
          gate: 'each-panel',
          composition: 'prepared-owner-contract; split-box-text',
        },
      },
    },
  ),
  Alert: slots('className'),
  Avatar: slots('className imageClassName fallbackClassName statusClassName', {
    secondary: true,
    overrides: {
      imageClassName: {
        owner: 'non-control-image-img',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'src-defined-and-not-failed',
        composition: 'fill-geometry; classes/explicit-style',
      },
      fallbackClassName: {
        owner: 'non-control-fallback-span',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'src-absent-or-failed',
        composition: 'root-text inheritance; classes/explicit-style; split-box-text',
      },
      statusClassName: {
        owner: 'non-control-status-span',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'nonempty-status',
        composition: 'classes/explicit-style',
      },
    },
  }),
  BottomSheet: slots('className scrimClassName sheetClassName handleClassName handleBarClassName', {
    overrides: {
      scrimClassName: {
        owner: 'bottom-sheet-scrim',
        gate: 'when-mounted',
        composition: 'prepared-owner-contract',
      },
      sheetClassName: {
        owner: 'bottom-sheet-sheet',
        gate: 'when-mounted',
        composition: 'prepared-owner-contract; split-box-text',
      },
      handleClassName: {
        owner: 'bottom-sheet-handle',
        gate: 'when-mounted',
        composition: 'prepared-owner-contract',
      },
      handleBarClassName: {
        owner: 'bottom-sheet-handle-bar',
        gate: 'when-handle-bar',
        composition: 'prepared-owner-contract',
      },
    },
  }),
  Checkbox: slots('className'),
  Chip: slots('className removeClassName', {
    secondary: true,
    overrides: {
      className: owned('toggle-or-composite-row', 'Chip', 'hozoStyle'),
      removeClassName: owned('remove-button', 'Chip', 'hozoRemoveStyle'),
    },
  }),
  ColorPicker: slots(
    'className swatchClassName selectedSwatchClassName sliderClassName thumbClassName inputClassName eyeDropperClassName',
    {
      secondary: true,
      overrides: {
        thumbClassName: owned('adjustable-slider-thumb', 'SliderThumb', 'hozoThumbStyle', {
          pointer: false,
          composition:
            'thumb classes/callback/explicit-style; geometry-last; independent per slider',
        }),
        inputClassName: owned('real-hex-input', 'TextInput', 'hozoInputStyle', {
          pointer: false,
          composition: 'classes/callback/explicit-style; disabled-is-read-only',
        }),
        swatchClassName: owned('preset-radio', 'ColorPicker', 'hozoSwatchStyle', {
          composition: 'classes/callback/style; selected-slot; preset-background-last',
        }),
        selectedSwatchClassName: owned('preset-radio', 'ColorPicker', 'hozoSelectedSwatchStyle', {
          gate: 'first-valid-matching-preset',
          composition: 'classes/callback/style; preset-background-last',
        }),
        eyeDropperClassName: {
          lowering: 'web-only',
          owner: 'web-eyedropper',
          gate: 'Web only',
          composition: 'no Native consumer',
          reason: 'React Native has no eyedropper; the prop remains accepted but unused.',
        },
      },
    },
  ),
  Combobox: slots('className inputClassName listClassName optionClassName', {
    secondary: true,
    overrides: {
      className: {
        owner: 'non-control-wrapper-div',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'always',
        composition: 'classes/explicit-style; split-box-text inheritance',
      },
      inputClassName: {
        ...owned('real-combobox-input', 'ComboboxInput', 'hozoInputStyle', {
          pointer: false,
          composition: 'root-text inheritance; classes/callback/explicit-style',
        }),
        placeholderColorProp: 'hozoInputPlaceholderTextColor',
      },
      listClassName: {
        owner: 'non-control-listbox-div',
        scrollYProp: 'hozoListScrollY',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'popup-open',
        composition: 'root-text inheritance; classes/explicit-style; split-box-text',
      },
      optionClassName: owned('option-div', 'ListOption', 'hozoOptionStyle', {
        focus: false,
        gate: 'each-filtered-option',
        composition: 'root/list-text inheritance; classes/callback/explicit-style; split-box-text',
      }),
    },
  }),
  CommandPalette: slots(
    'className scrimClassName panelClassName inputClassName listClassName groupHeadingClassName itemClassName activeItemClassName shortcutClassName emptyClassName',
    {
      secondary: true,
      overrides: {
        inputClassName: {
          ...owned('real-search-input', 'CommandInput', 'hozoInputStyle', {
            pointer: false,
            composition: 'panel-text inheritance; classes/callback/explicit-style',
          }),
          placeholderColorProp: 'hozoInputPlaceholderTextColor',
        },
        listClassName: { scrollYProp: 'hozoListScrollY' },
        groupHeadingClassName: {
          owner: 'non-control-group-heading-div',
          profile: 'NonControl',
          events: 'unavailable',
          gate: 'each-ranked-named-group',
          composition: 'root/panel text inheritance; classes/explicit-style',
        },
        shortcutClassName: {
          owner: 'non-control-shortcut-span',
          profile: 'NonControl',
          events: 'unavailable',
          gate: 'ranked-command-with-shortcut',
          composition: 'root/panel/option text inheritance; classes/explicit-style; split-box-text',
        },
        emptyClassName: {
          owner: 'non-control-empty-div',
          profile: 'NonControl',
          events: 'unavailable',
          gate: 'no-ranked-commands',
          composition: 'root/panel text inheritance; classes/explicit-style',
        },
        itemClassName: owned('option-div', 'CommandPalette', 'hozoItemStyle', { focus: false }),
        activeItemClassName: owned('option-div', 'CommandPalette', 'hozoActiveItemStyle', {
          focus: false,
          gate: 'current-filtered-enabled-command',
        }),
      },
    },
  ),
  Dialog: slots('className', {
    overrides: {
      className: { scrollYProp: 'hozoScrollY', backdropStyleProp: 'hozoBackdropStyle' },
    },
  }),
  Drawer: slots('className scrimClassName panelClassName', {
    overrides: {
      scrimClassName: {
        owner: 'drawer-scrim',
        gate: 'open',
        composition: 'prepared-owner-contract',
      },
      panelClassName: {
        owner: 'drawer-panel',
        gate: 'open',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  }),
  Listbox: slots('className optionClassName', {
    secondary: true,
    overrides: {
      className: {
        owner: 'non-control-listbox-div',
        scrollYProp: 'hozoScrollY',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'always',
        composition: 'classes/explicit-style; split-box-text inheritance',
      },
      optionClassName: owned('option-div', 'ListOption', 'hozoOptionStyle', {
        gate: 'each-option',
        composition: 'root-text inheritance; classes/callback/explicit-style; split-box-text',
      }),
    },
  }),
  Menu: slots('className triggerClassName menuClassName itemClassName', {
    secondary: true,
    overrides: {
      className: {
        owner: 'non-control-wrapper-div',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'always',
        composition: 'classes/explicit-style; split-box-text inheritance',
      },
      triggerClassName: owned('enabled-trigger-button', 'MenuTrigger', 'hozoTriggerStyle', {
        composition: 'root-text inheritance; classes/callback/explicit-style; split-box-text',
      }),
      menuClassName: {
        owner: 'non-control-menu-div',
        profile: 'NonControl',
        events: 'unavailable',
        gate: 'popup-visible',
        composition: 'root-text inheritance; classes/explicit-style; split-box-text',
      },
      itemClassName: owned('action-div', 'MenuItem', 'hozoItemStyle', {
        gate: 'each-visible-item',
        composition: 'root/menu-text inheritance; classes/callback/explicit-style; split-box-text',
      }),
    },
  }),
  OtpInput: slots(
    'className cellClassName activeCellClassName filledCellClassName inputClassName',
    {
      secondary: true,
      overrides: {
        className: {
          owner: 'wrapper-div',
          profile: 'OtpDecoration',
          gate: 'always',
          composition: 'classes/style; split-box-text',
        },
        cellClassName: {
          owner: 'decorative-cell',
          profile: 'OtpDecoration',
          gate: 'each-cell',
          composition: 'base-cell; active-slot; filled-slot',
        },
        activeCellClassName: {
          owner: 'decorative-cell',
          profile: 'OtpDecoration',
          gate: 'active-insertion-cell',
          composition: 'after base-cell; before filled-slot',
        },
        filledCellClassName: {
          owner: 'decorative-cell',
          profile: 'OtpDecoration',
          gate: 'filled-cell',
          composition: 'after base-cell and active-slot',
        },
        inputClassName: owned('real-input', 'TextInput', 'hozoInputStyle', {
          pointer: false,
          composition: 'classes/callback/style; transparent-input/fixed-overlay-geometry',
        }),
      },
    },
  ),
  Pagination: slots(
    'className itemClassName currentItemClassName disabledItemClassName ellipsisClassName',
    {
      secondary: true,
      overrides: {
        ellipsisClassName: {
          owner: 'non-control-ellipsis-li',
          profile: 'NonControl',
          events: 'unavailable',
          gate: 'each-pagination-gap',
          composition: 'row-text inheritance; classes/explicit-style; split-box-text',
        },
        itemClassName: owned('page-button-or-link', 'Pagination', 'hozoItemStyle'),
        currentItemClassName: owned('page-button-or-link', 'Pagination', 'hozoCurrentItemStyle', {
          gate: 'current-page',
        }),
        disabledItemClassName: owned('page-button-or-link', 'Pagination', 'hozoDisabledItemStyle', {
          gate: 'disabled-boundary',
        }),
      },
    },
  ),
  Popover: slots('className triggerClassName panelClassName', {
    overrides: {
      triggerClassName: {
        owner: 'popover-trigger',
        gate: 'always',
        composition: 'prepared-owner-contract; split-box-text',
      },
      panelClassName: {
        owner: 'popover-panel',
        gate: 'open',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  }),
  RadioGroup: slots('className optionClassName', {
    overrides: {
      optionClassName: {
        owner: 'radio-group-option',
        gate: 'each-option',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  }),
  Slider: slots('className thumbClassName fillClassName railClassName', {
    overrides: {
      thumbClassName: {
        owner: 'slider-thumb',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      fillClassName: {
        owner: 'slider-fill',
        gate: 'fill-styled',
        composition: 'prepared-owner-contract',
      },
      railClassName: {
        owner: 'slider-rail',
        gate: 'rail-styled',
        composition: 'prepared-owner-contract',
      },
    },
  }),
  Stepper: slots(
    'className stepClassName completedStepClassName currentStepClassName errorStepClassName indicatorClassName completedIndicatorClassName currentIndicatorClassName errorIndicatorClassName descriptionClassName',
    {
      secondary: true,
      overrides: {
        ...Object.fromEntries(
          ['step', 'completedStep', 'currentStep', 'errorStep'].map((name) => [
            `${name}ClassName`,
            owned(
              'step-button-or-descriptive-row',
              'Stepper',
              `hozo${name[0].toUpperCase()}${name.slice(1)}Style`,
              {
                optionalOwner: 'onStepPress',
                gate: name === 'step' ? 'always' : name.replace('Step', ''),
              },
            ),
          ]),
        ),
        ...Object.fromEntries(
          [
            'indicator',
            'completedIndicator',
            'currentIndicator',
            'errorIndicator',
            'description',
          ].map((name) => [
            `${name}ClassName`,
            {
              owner:
                name === 'description'
                  ? 'non-control-description-span'
                  : 'non-control-indicator-span',
              profile: 'NonControl',
              events: 'unavailable',
              gate:
                name === 'description'
                  ? 'nonempty-description'
                  : name === 'indicator'
                    ? 'each-step'
                    : name.replace('Indicator', ''),
              composition:
                'list/step text inheritance; base classes/style; status classes/style; split-box-text',
            },
          ]),
        ),
      },
    },
  ),
  Switch: slots('className'),
  Tabs: slots('className tabListClassName tabClassName panelClassName', {
    overrides: {
      tabListClassName: {
        owner: 'tabs-tab-list',
        gate: 'always',
        composition: 'prepared-owner-contract',
      },
      tabClassName: {
        owner: 'tabs-tab',
        gate: 'each-tab',
        composition: 'prepared-owner-contract; split-box-text',
      },
      panelClassName: {
        owner: 'tabs-panel',
        gate: 'active-panel',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  }),
  Toolbar: slots('className'),
  Tooltip: slots('className'),
  Tree: slots('className rowClassName', {
    overrides: {
      rowClassName: {
        owner: 'tree-row',
        gate: 'each-visible-row',
        composition: 'prepared-owner-contract; split-box-text',
      },
    },
  }),
}

const calendarDayFacts = [
  'aria-selected',
  'aria-disabled',
  'data-hozo-outside',
  'data-hozo-disabled',
  'data-hozo-range-start',
  'data-hozo-range-end',
  'data-hozo-in-range',
]

function datePickerContracts(component, rootProp, { includeDone = false } = {}) {
  const rows = [
    {
      owner: `${component}.root`,
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: rootProp, webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.trigger`,
      classProp: 'triggerClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTriggerStyle', webClassProp: 'triggerClassName' },
      authoredStyles: [
        { prop: 'triggerStyle', order: 0 },
        { prop: 'triggerTextStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'trigger',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled', 'aria-expanded'], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.dialog`,
      classProp: 'dialogClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoDialogStyle', webClassProp: 'dialogClassName' },
      authoredStyles: [{ prop: 'dialogStyle', order: 0 }],
      shapes: [
        {
          id: 'dialog',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.calendar`,
      classProp: 'calendarClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoCalendarStyle', webClassProp: 'calendarClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'calendar',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.header`,
      classProp: 'headerClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoHeaderStyle', webClassProp: 'headerClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'header',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.grid`,
      classProp: 'gridClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoGridStyle', webClassProp: 'gridClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'grid',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'table',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.monthButton`,
      classProp: 'monthButtonClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoMonthButtonStyle', webClassProp: 'monthButtonClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'monthButton',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled'], splitText: true },
        },
      ],
    },
    {
      owner: `${component}.day`,
      classProp: 'dayClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoDayStyle', webClassProp: 'dayClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'day',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'td',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: [...calendarDayFacts], splitText: true },
        },
      ],
    },
  ]
  if (includeDone) {
    rows.push({
      owner: `${component}.done`,
      classProp: 'doneClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoDoneStyle', webClassProp: 'doneClassName' },
      authoredStyles: [
        { prop: 'doneStyle', order: 0 },
        { prop: 'doneTextStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'done',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: [], splitText: true },
        },
      ],
    })
  }
  return rows
}

function datePickerPublications(component, { includeDone = false } = {}) {
  const parts = ['root', 'trigger', 'dialog', 'calendar', 'header', 'grid', 'monthButton', 'day']
  if (includeDone) parts.push('done')
  return parts.map((part) => ({
    owner: `${component}.${part}`,
    package: '@hozo/form',
    exports: [component, `Hozo${component}`],
  }))
}

// RFC010 shadow only: not a Primitive mapping or audited profile.
// Replaces the handle spike's hand-written test JSON. A host-audit declaration
// requires the independent CI proof; it does not authorize adapter rollout.
export const ownerShadow = {
  schema: 'rfc010-owner-shadow-0',
  contracts: [
    {
      owner: 'BottomSheet.handle',
      classProp: 'handleClassName',
      audit: 'audited',
      // A closed iOS Modal / exiting Web presence may still paint the owner.
      // `present` is actual rendered lifetime, not the author's `open` request.
      bindings: ['present', 'resizable'],
      abi: {
        nativePreparedProp: 'hozoHandleStyle',
        webClassProp: 'handleClassName',
        nativePartial: { prop: 'hozoInteractiveHandleStyle', shape: 'resizable' },
      },
      authoredStyles: [{ prop: 'handleStyle', order: 0 }],
      shapes: [
        {
          id: 'resizable',
          when: { all: [{ eq: ['present', true] }, { eq: ['resizable', true] }] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: [], splitText: false },
        },
        {
          id: 'decorative',
          when: { all: [{ eq: ['present', true] }, { eq: ['resizable', false] }] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Tabs.Tab',
      classProp: 'tabClassName',
      audit: 'audited',
      // Each existing tab supplies its own live snapshot to this one recipe.
      // splitText styles owned primitive/transparent-container labels, not
      // opaque ReactNode descendants. This is a host/ABI, not inheritance audit.
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTabStyle', webClassProp: 'tabClassName' },
      authoredStyles: [{ prop: 'tabStyle', order: 0 }],
      shapes: [
        {
          id: 'tab',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled', 'aria-selected', 'aria-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'Toolbar.root',
      classProp: 'className',
      audit: 'unknown',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoToolbarStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Drawer.scrim',
      classProp: 'scrimClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoScrimStyle', webClassProp: 'scrimClassName' },
      authoredStyles: [{ prop: 'scrimStyle', order: 0 }],
      shapes: [
        {
          id: 'scrim',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Drawer.panel',
      classProp: 'panelClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPanelStyle', webClassProp: 'panelClassName' },
      authoredStyles: [{ prop: 'panelStyle', order: 0 }],
      shapes: [
        {
          id: 'panel',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Popover.trigger',
      classProp: 'triggerClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTriggerStyle', webClassProp: 'triggerClassName' },
      authoredStyles: [{ prop: 'triggerStyle', order: 0 }],
      shapes: [
        {
          id: 'trigger',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled', 'aria-expanded', 'data-hozo-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'Popover.panel',
      classProp: 'panelClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPanelStyle', webClassProp: 'panelClassName' },
      authoredStyles: [{ prop: 'panelStyle', order: 0 }],
      shapes: [
        {
          id: 'panel',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'RadioGroup.option',
      classProp: 'optionClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoOptionStyle', webClassProp: 'optionClassName' },
      authoredStyles: [{ prop: 'optionStyle', order: 0 }],
      shapes: [
        {
          id: 'option',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'div',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['aria-checked', 'aria-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'Tree.row',
      classProp: 'rowClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoRowStyle', webClassProp: 'rowClassName' },
      authoredStyles: [{ prop: 'rowStyle', order: 0 }],
      shapes: [
        {
          id: 'row',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'div',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['aria-selected', 'aria-expanded', 'aria-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'Splitter.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSplitterStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'handle',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: ['hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['data-dragging', 'data-collapsed'], splitText: false },
        },
      ],
    },
    {
      owner: 'ResizablePane.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoResizablePaneStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'ResizablePane.pane',
      classProp: 'paneClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPaneStyle', webClassProp: 'paneClassName' },
      authoredStyles: [{ prop: 'paneStyle', order: 0 }],
      shapes: [
        {
          id: 'pane',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'section',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'ResizablePane.handle',
      classProp: 'handleClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoHandleStyle', webClassProp: 'handleClassName' },
      authoredStyles: [{ prop: 'handleStyle', order: 0 }],
      shapes: [
        {
          id: 'handle',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: ['hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['data-dragging', 'data-collapsed'], splitText: false },
        },
      ],
    },
    {
      owner: 'Slider.thumb',
      classProp: 'thumbClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSliderThumbStyle', webClassProp: 'thumbClassName' },
      authoredStyles: [{ prop: 'thumbStyle', order: 0 }],
      shapes: [
        {
          id: 'thumb',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: ['focused', 'focusVisible'],
          inputs: { facts: ['aria-disabled'], splitText: false },
        },
      ],
    },
    {
      owner: 'Slider.fill',
      classProp: 'fillClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFillStyle', webClassProp: 'fillClassName' },
      authoredStyles: [{ prop: 'fillStyle', order: 0 }],
      shapes: [
        {
          id: 'fill',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Slider.rail',
      classProp: 'railClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoRailStyle', webClassProp: 'railClassName' },
      authoredStyles: [{ prop: 'railStyle', order: 0 }],
      shapes: [
        {
          id: 'rail',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Accordion.section',
      classProp: 'sectionClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSectionStyle', webClassProp: 'sectionClassName' },
      authoredStyles: [{ prop: 'sectionStyle', order: 0 }],
      shapes: [
        {
          id: 'section',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Accordion.heading',
      classProp: 'headingClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoHeadingStyle', webClassProp: 'headingClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'heading',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'heading',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Accordion.trigger',
      classProp: 'triggerClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTriggerStyle', webClassProp: 'triggerClassName' },
      authoredStyles: [
        { prop: 'triggerStyle', order: 0 },
        { prop: 'triggerTextStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'trigger',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: {
            facts: [
              'disabled',
              'aria-expanded',
              'data-hozo-disabled',
              'data-hozo-state=open',
              'data-hozo-state=closed',
            ],
            splitText: true,
          },
        },
      ],
    },
    {
      owner: 'Accordion.panel',
      classProp: 'panelClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPanelStyle', webClassProp: 'panelClassName' },
      authoredStyles: [{ prop: 'panelStyle', order: 0 }],
      shapes: [
        {
          id: 'panel',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: {
            facts: ['data-hozo-state=open', 'data-hozo-state=closed'],
            splitText: true,
          },
        },
      ],
    },
    {
      owner: 'Accordion.panelContent',
      classProp: 'panelContentClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPanelContentStyle', webClassProp: 'panelContentClassName' },
      authoredStyles: [{ prop: 'panelContentStyle', order: 0 }],
      shapes: [
        {
          id: 'panelContent',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Tabs.tabList',
      classProp: 'tabListClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTabListStyle', webClassProp: 'tabListClassName' },
      authoredStyles: [{ prop: 'tabListStyle', order: 0 }],
      shapes: [
        {
          id: 'tabList',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Tabs.panel',
      classProp: 'panelClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPanelStyle', webClassProp: 'panelClassName' },
      authoredStyles: [{ prop: 'panelStyle', order: 0 }],
      shapes: [
        {
          id: 'panel',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'BottomSheet.scrim',
      classProp: 'scrimClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoScrimStyle', webClassProp: 'scrimClassName' },
      authoredStyles: [{ prop: 'scrimStyle', order: 0 }],
      shapes: [
        {
          id: 'scrim',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'BottomSheet.sheet',
      classProp: 'sheetClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSheetStyle', webClassProp: 'sheetClassName' },
      authoredStyles: [{ prop: 'sheetStyle', order: 0 }],
      shapes: [
        {
          id: 'sheet',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'BottomSheet.handleBar',
      classProp: 'handleBarClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoHandleBarStyle', webClassProp: 'handleBarClassName' },
      authoredStyles: [{ prop: 'handleBarStyle', order: 0 }],
      shapes: [
        {
          id: 'handleBar',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'span',
          events: [],
        },
      ],
    },
    {
      owner: 'Form.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFormStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'form',
          events: [],
        },
      ],
    },
    {
      owner: 'SubmitButton.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSubmitButtonStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'FileDropzone.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFileDropzoneStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'FileDropzone.active',
      classProp: 'activeClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: null, webClassProp: 'activeClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'active',
          when: { eq: ['present', true] },
          nativeHost: null,
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
        },
      ],
    },
    {
      owner: 'Field.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFieldStyle', webClassProp: 'className' },
      authoredStyles: [],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'Field.label',
      classProp: 'labelClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoLabelStyle', webClassProp: 'labelClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'label',
          when: { eq: ['present', true] },
          nativeHost: 'Text',
          webHost: 'label',
          events: [],
        },
      ],
    },
    {
      owner: 'Field.required',
      classProp: 'requiredClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoRequiredStyle', webClassProp: 'requiredClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'required',
          when: { eq: ['present', true] },
          nativeHost: 'Text',
          webHost: 'span',
          events: [],
        },
      ],
    },
    {
      owner: 'Field.description',
      classProp: 'descriptionClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoDescriptionStyle', webClassProp: 'descriptionClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'description',
          when: { eq: ['present', true] },
          nativeHost: 'Text',
          webHost: 'span',
          events: [],
        },
      ],
    },
    {
      owner: 'Field.error',
      classProp: 'errorClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoErrorStyle', webClassProp: 'errorClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'error',
          when: { eq: ['present', true] },
          nativeHost: 'Text',
          webHost: 'span',
          events: [],
        },
      ],
    },
    {
      owner: 'TextArea.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTextAreaStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
        },
      ],
    },
    {
      owner: 'TextArea.field',
      classProp: 'fieldClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFieldStyle', webClassProp: 'fieldClassName' },
      authoredStyles: [{ prop: 'fieldStyle', order: 0 }],
      shapes: [
        {
          id: 'field',
          when: { eq: ['present', true] },
          nativeHost: 'TextInput',
          webHost: 'textarea',
          events: ['focused', 'focusVisible'],
          inputs: {
            facts: ['disabled', 'readOnly', 'aria-invalid', 'aria-required'],
            splitText: false,
          },
        },
      ],
    },
    {
      owner: 'TextArea.count',
      classProp: 'countClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoCountStyle', webClassProp: 'countClassName' },
      authoredStyles: [{ prop: 'countStyle', order: 0 }],
      shapes: [
        {
          id: 'count',
          when: { eq: ['present', true] },
          nativeHost: 'Text',
          webHost: 'span',
          events: [],
        },
      ],
    },
    {
      owner: 'NativeSelect.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSelectStyle', webClassProp: 'className' },
      authoredStyles: [
        { prop: 'style', order: 0 },
        { prop: 'textStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'select',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: {
            facts: ['disabled', 'aria-invalid', 'aria-required'],
            splitText: true,
          },
        },
      ],
    },
    {
      owner: 'NativeSelect.indicator',
      classProp: 'indicatorClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoIndicatorStyle', webClassProp: null },
      authoredStyles: [],
      shapes: [
        {
          id: 'indicator',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: null,
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: {
            facts: ['disabled', 'aria-invalid', 'aria-required'],
            splitText: false,
          },
        },
      ],
    },
    {
      owner: 'NativeSelect.sheet',
      classProp: 'sheetClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoSheetStyle', webClassProp: null },
      authoredStyles: [{ prop: 'sheetStyle', order: 0 }],
      shapes: [
        {
          id: 'sheet',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: null,
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'NativeSelect.scrim',
      classProp: 'scrimClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoScrimStyle', webClassProp: null },
      authoredStyles: [{ prop: 'scrimStyle', order: 0 }],
      shapes: [
        {
          id: 'scrim',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: null,
          events: [],
        },
      ],
    },
    {
      owner: 'NativeSelect.option',
      classProp: 'optionClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoOptionStyle', webClassProp: null },
      authoredStyles: [
        { prop: 'optionStyle', order: 0 },
        { prop: 'textStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'option',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: null,
          events: ['pressed'],
          inputs: {
            facts: ['disabled', 'aria-selected', 'aria-disabled'],
            splitText: true,
          },
        },
      ],
    },
    {
      owner: 'Calendar.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoCalendarStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Calendar.header',
      classProp: 'headerClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoHeaderStyle', webClassProp: 'headerClassName' },
      authoredStyles: [{ prop: 'headerStyle', order: 0 }],
      shapes: [
        {
          id: 'header',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Calendar.grid',
      classProp: 'gridClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoGridStyle', webClassProp: 'gridClassName' },
      authoredStyles: [],
      shapes: [
        {
          id: 'grid',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'table',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'Calendar.monthButton',
      classProp: 'monthButtonClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoMonthButtonStyle', webClassProp: 'monthButtonClassName' },
      authoredStyles: [{ prop: 'monthButtonStyle', order: 0 }],
      shapes: [
        {
          id: 'monthButton',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'Calendar.day',
      classProp: 'dayClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoDayStyle', webClassProp: 'dayClassName' },
      authoredStyles: [
        { prop: 'dayStyle', order: 0 },
        { prop: 'dayTextStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'day',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'td',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: {
            facts: [
              'aria-selected',
              'aria-disabled',
              'data-hozo-outside',
              'data-hozo-disabled',
              'data-hozo-range-start',
              'data-hozo-range-end',
              'data-hozo-in-range',
            ],
            splitText: true,
          },
        },
      ],
    },
    ...datePickerContracts('DatePicker', 'hozoDatePickerStyle'),
    ...datePickerContracts('DateRangePicker', 'hozoDateRangePickerStyle'),
    ...datePickerContracts('DateTimePicker', 'hozoDateTimePickerStyle', { includeDone: true }),
    {
      owner: 'TimePicker.root',
      classProp: 'className',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoTimePickerStyle', webClassProp: 'className' },
      authoredStyles: [{ prop: 'style', order: 0 }],
      shapes: [
        {
          id: 'root',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'TimePicker.field',
      classProp: 'fieldClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoFieldStyle', webClassProp: 'fieldClassName' },
      authoredStyles: [{ prop: 'fieldStyle', order: 0 }],
      shapes: [
        {
          id: 'field',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: [],
          inputs: { facts: [], splitText: true },
        },
      ],
    },
    {
      owner: 'TimePicker.value',
      classProp: 'valueClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoValueStyle', webClassProp: 'valueClassName' },
      authoredStyles: [{ prop: 'fieldTextStyle', order: 0 }],
      shapes: [
        {
          id: 'value',
          when: { eq: ['present', true] },
          nativeHost: 'View',
          webHost: 'div',
          events: ['hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['aria-disabled', 'data-hozo-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'TimePicker.period',
      classProp: 'periodClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoPeriodStyle', webClassProp: 'periodClassName' },
      authoredStyles: [
        { prop: 'fieldStyle', order: 0 },
        { prop: 'fieldTextStyle', order: 1 },
      ],
      shapes: [
        {
          id: 'period',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: { facts: ['disabled', 'data-hozo-disabled'], splitText: true },
        },
      ],
    },
    {
      owner: 'TimePicker.step',
      classProp: 'stepClassName',
      audit: 'audited',
      bindings: ['present'],
      abi: { nativePreparedProp: 'hozoStepStyle', webClassProp: 'stepClassName' },
      authoredStyles: [{ prop: 'stepStyle', order: 0 }],
      shapes: [
        {
          id: 'step',
          when: { eq: ['present', true] },
          nativeHost: 'Pressable',
          webHost: 'button',
          events: ['pressed', 'hovered', 'focused', 'focusVisible'],
          inputs: {
            facts: [
              'disabled',
              'data-hozo-step',
              'data-hozo-step=increase',
              'data-hozo-step=decrease',
              'data-hozo-disabled',
            ],
            splitText: true,
          },
        },
      ],
    },
  ],
}

// Publication ownership is authored here beside the contract, not inferred
// from a matching component name or a facade re-export. Existence of these
// value exports is checked against each package's actual entry by the producer.
// This declaration does not certify that an alias implements the contract.
export const ownerPublications = [
  {
    owner: 'Toolbar.root',
    package: '@hozo/patterns',
    exports: ['Toolbar', 'HozoToolbar'],
  },
  {
    owner: 'BottomSheet.handle',
    package: '@hozo/patterns',
    exports: ['BottomSheet', 'HozoBottomSheet'],
  },
  {
    owner: 'Tabs.Tab',
    package: '@hozo/patterns',
    exports: ['Tabs', 'HozoTabs'],
  },
  {
    owner: 'Drawer.scrim',
    package: '@hozo/patterns',
    exports: ['Drawer', 'HozoDrawer'],
  },
  {
    owner: 'Drawer.panel',
    package: '@hozo/patterns',
    exports: ['Drawer', 'HozoDrawer'],
  },
  {
    owner: 'Popover.trigger',
    package: '@hozo/patterns',
    exports: ['Popover', 'HozoPopover'],
  },
  {
    owner: 'Popover.panel',
    package: '@hozo/patterns',
    exports: ['Popover', 'HozoPopover'],
  },
  {
    owner: 'RadioGroup.option',
    package: '@hozo/patterns',
    exports: ['RadioGroup', 'HozoRadioGroup'],
  },
  {
    owner: 'Tree.row',
    package: '@hozo/patterns',
    exports: ['Tree', 'HozoTree'],
  },
  {
    owner: 'Splitter.root',
    package: '@hozo/patterns',
    exports: ['Splitter'],
  },
  {
    owner: 'ResizablePane.root',
    package: '@hozo/patterns',
    exports: ['ResizablePane'],
  },
  {
    owner: 'ResizablePane.pane',
    package: '@hozo/patterns',
    exports: ['ResizablePane'],
  },
  {
    owner: 'ResizablePane.handle',
    package: '@hozo/patterns',
    exports: ['ResizablePane'],
  },
  {
    owner: 'Slider.thumb',
    package: '@hozo/patterns',
    exports: ['Slider', 'HozoSlider'],
  },
  {
    owner: 'Slider.fill',
    package: '@hozo/patterns',
    exports: ['Slider', 'HozoSlider'],
  },
  {
    owner: 'Slider.rail',
    package: '@hozo/patterns',
    exports: ['Slider', 'HozoSlider'],
  },
  {
    owner: 'Accordion.section',
    package: '@hozo/patterns',
    exports: ['Accordion', 'HozoAccordion'],
  },
  {
    owner: 'Accordion.heading',
    package: '@hozo/patterns',
    exports: ['Accordion', 'HozoAccordion'],
  },
  {
    owner: 'Accordion.trigger',
    package: '@hozo/patterns',
    exports: ['Accordion', 'HozoAccordion'],
  },
  {
    owner: 'Accordion.panel',
    package: '@hozo/patterns',
    exports: ['Accordion', 'HozoAccordion'],
  },
  {
    owner: 'Accordion.panelContent',
    package: '@hozo/patterns',
    exports: ['Accordion', 'HozoAccordion'],
  },
  {
    owner: 'Tabs.tabList',
    package: '@hozo/patterns',
    exports: ['Tabs', 'HozoTabs'],
  },
  {
    owner: 'Tabs.panel',
    package: '@hozo/patterns',
    exports: ['Tabs', 'HozoTabs'],
  },
  {
    owner: 'BottomSheet.scrim',
    package: '@hozo/patterns',
    exports: ['BottomSheet', 'HozoBottomSheet'],
  },
  {
    owner: 'BottomSheet.sheet',
    package: '@hozo/patterns',
    exports: ['BottomSheet', 'HozoBottomSheet'],
  },
  {
    owner: 'BottomSheet.handleBar',
    package: '@hozo/patterns',
    exports: ['BottomSheet', 'HozoBottomSheet'],
  },
  {
    owner: 'Form.root',
    package: '@hozo/form',
    exports: ['Form', 'HozoForm'],
  },
  {
    owner: 'SubmitButton.root',
    package: '@hozo/form',
    exports: ['SubmitButton', 'HozoSubmitButton'],
  },
  {
    owner: 'FileDropzone.root',
    package: '@hozo/form',
    exports: ['FileDropzone', 'HozoFileDropzone'],
  },
  {
    owner: 'FileDropzone.active',
    package: '@hozo/form',
    exports: ['FileDropzone', 'HozoFileDropzone'],
  },
  {
    owner: 'Field.root',
    package: '@hozo/form',
    exports: ['Field', 'HozoField'],
  },
  {
    owner: 'Field.label',
    package: '@hozo/form',
    exports: ['Field', 'HozoField'],
  },
  {
    owner: 'Field.required',
    package: '@hozo/form',
    exports: ['Field', 'HozoField'],
  },
  {
    owner: 'Field.description',
    package: '@hozo/form',
    exports: ['Field', 'HozoField'],
  },
  {
    owner: 'Field.error',
    package: '@hozo/form',
    exports: ['Field', 'HozoField'],
  },
  {
    owner: 'TextArea.root',
    package: '@hozo/form',
    exports: ['TextArea', 'HozoTextArea'],
  },
  {
    owner: 'TextArea.field',
    package: '@hozo/form',
    exports: ['TextArea', 'HozoTextArea'],
  },
  {
    owner: 'TextArea.count',
    package: '@hozo/form',
    exports: ['TextArea', 'HozoTextArea'],
  },
  {
    owner: 'NativeSelect.root',
    package: '@hozo/form',
    exports: ['NativeSelect', 'HozoNativeSelect'],
  },
  {
    owner: 'NativeSelect.indicator',
    package: '@hozo/form',
    exports: ['NativeSelect', 'HozoNativeSelect'],
  },
  {
    owner: 'NativeSelect.sheet',
    package: '@hozo/form',
    exports: ['NativeSelect', 'HozoNativeSelect'],
  },
  {
    owner: 'NativeSelect.scrim',
    package: '@hozo/form',
    exports: ['NativeSelect', 'HozoNativeSelect'],
  },
  {
    owner: 'NativeSelect.option',
    package: '@hozo/form',
    exports: ['NativeSelect', 'HozoNativeSelect'],
  },
  {
    owner: 'Calendar.root',
    package: '@hozo/form',
    exports: ['Calendar', 'HozoCalendar'],
  },
  {
    owner: 'Calendar.header',
    package: '@hozo/form',
    exports: ['Calendar', 'HozoCalendar'],
  },
  {
    owner: 'Calendar.grid',
    package: '@hozo/form',
    exports: ['Calendar', 'HozoCalendar'],
  },
  {
    owner: 'Calendar.monthButton',
    package: '@hozo/form',
    exports: ['Calendar', 'HozoCalendar'],
  },
  {
    owner: 'Calendar.day',
    package: '@hozo/form',
    exports: ['Calendar', 'HozoCalendar'],
  },
  ...datePickerPublications('DatePicker'),
  ...datePickerPublications('DateRangePicker'),
  ...datePickerPublications('DateTimePicker', { includeDone: true }),
  {
    owner: 'TimePicker.root',
    package: '@hozo/form',
    exports: ['TimePicker', 'HozoTimePicker'],
  },
  {
    owner: 'TimePicker.field',
    package: '@hozo/form',
    exports: ['TimePicker', 'HozoTimePicker'],
  },
  {
    owner: 'TimePicker.value',
    package: '@hozo/form',
    exports: ['TimePicker', 'HozoTimePicker'],
  },
  {
    owner: 'TimePicker.period',
    package: '@hozo/form',
    exports: ['TimePicker', 'HozoTimePicker'],
  },
  {
    owner: 'TimePicker.step',
    package: '@hozo/form',
    exports: ['TimePicker', 'HozoTimePicker'],
  },
]

// Pattern components that render their string children inside a `View`: that
// string gets the text styles at run time, a Text the caller nests does not.
// A component built on one of these forwards text the way one built on a
// `Pressable` or `View` from `@hozo/core` does (`@hozo/ui`'s Alert since #983;
// its Checkbox and Switch take their label as children the same way, #974).
//
// `sharesState` says whether the pattern's pressable shares its state with
// that Text: Checkbox's and Switch's provide `HozoInteractionContext` from
// `@hozo/behaviors`, which a `HozoText` reads; Alert has no state.
export const textHosts = [
  { package: '@hozo/patterns', export: 'Alert', sharesState: false },
  { package: '@hozo/patterns', export: 'Checkbox', sharesState: true },
  { package: '@hozo/patterns', export: 'Switch', sharesState: true },
]

// Exports the compiler lowers as one of its primitives, by package. The
// compiler trusts these packages as primitive sources (`sources.ts`) and
// maps a trusted import by name, so each export here is the Primitive of the
// same name; the manifest publishes the pairing and CI compares it with the
// compiler's table. `@hozo/ui` and `@hozo/form` are not primitive sources.
export const primitiveExports = {
  '@hozo/patterns': [
    'Avatar',
    'Chip',
    'ColorPicker',
    'Combobox',
    'CommandPalette',
    'Dialog',
    'Listbox',
    'Menu',
    'OtpInput',
    'Pagination',
    'Stepper',
  ],
}
