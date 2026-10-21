// Build-time source of truth, never imported by an application. A slot's
// presence is an inventory entry, not a claim that its owner has been audited.
const supplied = (alias) => ({ alias })
const textInputFacts = {
  disabled: supplied('__hozoSlotDisabled'),
  enabled: supplied('__hozoSlotEnabled'),
  readOnly: supplied('__hozoSlotReadOnly'),
  'aria-disabled': false,
  'aria-selected': false,
  'aria-checked': false,
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
  'aria-disabled': false,
  'aria-selected': false,
  'aria-checked': false,
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

// Root and secondary props share the catalog even though this first slice
// deliberately preserves their existing, separate code-generation routes.
export const components = {
  Accordion: slots('className sectionClassName headingClassName triggerClassName panelClassName', {
    overrides: {
      headingClassName: {
        styleProp: null,
        reason:
          'Native has no heading host or headingStyle: heading classes precede trigger classes on the trigger.',
      },
    },
  }),
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
  BottomSheet: slots('className scrimClassName sheetClassName handleClassName'),
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
  Drawer: slots('className scrimClassName panelClassName'),
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
  Popover: slots('className triggerClassName panelClassName'),
  RadioGroup: slots('className optionClassName'),
  Slider: slots('className thumbClassName fillClassName'),
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
  Tabs: slots('className tabListClassName tabClassName panelClassName'),
  Toolbar: slots('className'),
  Tooltip: slots('className'),
  Tree: slots('className rowClassName'),
}
