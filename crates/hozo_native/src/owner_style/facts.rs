//! What an existing owner can hand a lowered style: its element's interaction
//! events and the bounded state facts (ARIA, `disabled`, `data-hozo-*`).

/// Bounded interaction events supplied by an existing owner when the host is
/// not itself a Pressable or TextInput (for example a focusable/hoverable
/// `View` spinbutton with no press responder).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[doc(hidden)]
pub enum OwnerEvent {
    Pressed,
    Hovered,
    Focused,
    FocusVisible,
}

impl OwnerEvent {
    pub fn key(self) -> &'static str {
        match self {
            Self::Pressed => "pressed",
            Self::Hovered => "hovered",
            Self::Focused => "focused",
            Self::FocusVisible => "focusVisible",
        }
    }
}

/// Bounded inputs supplied by an existing owner, never inferred from a
/// synthetic primitive's missing props or loaded as executable manifest text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[doc(hidden)]
pub enum OwnerFact {
    Disabled,
    ReadOnly,
    AriaSelected,
    AriaChecked,
    AriaDisabled,
    AriaInvalid,
    AriaRequired,
    AriaExpanded,
    DataHozoOutside,
    DataHozoDisabled,
    DataHozoRangeStart,
    DataHozoRangeEnd,
    DataHozoInRange,
    DataHozoStep,
    DataHozoStepIncrease,
    DataHozoStepDecrease,
    DataDragging,
    DataCollapsed,
    DataHozoStateOpen,
    DataHozoStateClosed,
    DataHozoStateChecked,
    DataHozoStateUnchecked,
    DataHozoStateMixed,
    DataCodeMark,
    DataCodeMarkIns,
    DataCodeMarkDel,
    DataCodeMarkMark,
}

impl OwnerFact {
    pub fn key(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::ReadOnly => "readOnly",
            Self::AriaSelected => "aria-selected",
            Self::AriaChecked => "aria-checked",
            Self::AriaDisabled => "aria-disabled",
            Self::AriaInvalid => "aria-invalid",
            Self::AriaRequired => "aria-required",
            Self::AriaExpanded => "aria-expanded",
            Self::DataHozoOutside => "data-hozo-outside",
            Self::DataHozoDisabled => "data-hozo-disabled",
            Self::DataHozoRangeStart => "data-hozo-range-start",
            Self::DataHozoRangeEnd => "data-hozo-range-end",
            Self::DataHozoInRange => "data-hozo-in-range",
            Self::DataHozoStep => "data-hozo-step",
            Self::DataHozoStepIncrease => "data-hozo-step=increase",
            Self::DataHozoStepDecrease => "data-hozo-step=decrease",
            Self::DataDragging => "data-dragging",
            Self::DataCollapsed => "data-collapsed",
            Self::DataHozoStateOpen => "data-hozo-state=open",
            Self::DataHozoStateClosed => "data-hozo-state=closed",
            Self::DataHozoStateChecked => "data-hozo-state=checked",
            Self::DataHozoStateUnchecked => "data-hozo-state=unchecked",
            Self::DataHozoStateMixed => "data-hozo-state=mixed",
            Self::DataCodeMark => "data-code-mark",
            Self::DataCodeMarkIns => "data-code-mark=ins",
            Self::DataCodeMarkDel => "data-code-mark=del",
            Self::DataCodeMarkMark => "data-code-mark=mark",
        }
    }

    pub(crate) fn alias(self) -> &'static str {
        match self {
            Self::Disabled => "__hozoOwnerDisabled",
            Self::ReadOnly => "__hozoOwnerReadOnly",
            Self::AriaSelected => "__hozoOwnerAriaSelected",
            Self::AriaChecked => "__hozoOwnerAriaChecked",
            Self::AriaDisabled => "__hozoOwnerAriaDisabled",
            Self::AriaInvalid => "__hozoOwnerAriaInvalid",
            Self::AriaRequired => "__hozoOwnerAriaRequired",
            Self::AriaExpanded => "__hozoOwnerAriaExpanded",
            Self::DataHozoOutside => "__hozoOwnerDataHozoOutside",
            Self::DataHozoDisabled => "__hozoOwnerDataHozoDisabled",
            Self::DataHozoRangeStart => "__hozoOwnerDataHozoRangeStart",
            Self::DataHozoRangeEnd => "__hozoOwnerDataHozoRangeEnd",
            Self::DataHozoInRange => "__hozoOwnerDataHozoInRange",
            Self::DataHozoStep => "__hozoOwnerDataHozoStep",
            Self::DataHozoStepIncrease => "__hozoOwnerDataHozoStepIncrease",
            Self::DataHozoStepDecrease => "__hozoOwnerDataHozoStepDecrease",
            Self::DataDragging => "__hozoOwnerDataDragging",
            Self::DataCollapsed => "__hozoOwnerDataCollapsed",
            Self::DataHozoStateOpen => "__hozoOwnerDataHozoStateOpen",
            Self::DataHozoStateClosed => "__hozoOwnerDataHozoStateClosed",
            Self::DataHozoStateChecked => "__hozoOwnerDataHozoStateChecked",
            Self::DataHozoStateUnchecked => "__hozoOwnerDataHozoStateUnchecked",
            Self::DataHozoStateMixed => "__hozoOwnerDataHozoStateMixed",
            Self::DataCodeMark => "__hozoOwnerDataCodeMark",
            Self::DataCodeMarkIns => "__hozoOwnerDataCodeMarkIns",
            Self::DataCodeMarkDel => "__hozoOwnerDataCodeMarkDel",
            Self::DataCodeMarkMark => "__hozoOwnerDataCodeMarkMark",
        }
    }

    pub(crate) fn parameter(self) -> String {
        format!("{:?}: {}", self.key(), self.alias())
    }

    pub(crate) fn from_data_key(key: &str) -> Option<Self> {
        match key {
            "data-hozo-outside" => Some(Self::DataHozoOutside),
            "data-hozo-disabled" => Some(Self::DataHozoDisabled),
            "data-hozo-range-start" => Some(Self::DataHozoRangeStart),
            "data-hozo-range-end" => Some(Self::DataHozoRangeEnd),
            "data-hozo-in-range" => Some(Self::DataHozoInRange),
            "data-hozo-step" => Some(Self::DataHozoStep),
            "data-hozo-step=increase" => Some(Self::DataHozoStepIncrease),
            "data-hozo-step=decrease" => Some(Self::DataHozoStepDecrease),
            "data-dragging" => Some(Self::DataDragging),
            "data-collapsed" => Some(Self::DataCollapsed),
            "data-hozo-state=open" => Some(Self::DataHozoStateOpen),
            "data-hozo-state=closed" => Some(Self::DataHozoStateClosed),
            "data-hozo-state=checked" => Some(Self::DataHozoStateChecked),
            "data-hozo-state=unchecked" => Some(Self::DataHozoStateUnchecked),
            "data-hozo-state=mixed" => Some(Self::DataHozoStateMixed),
            "data-code-mark" => Some(Self::DataCodeMark),
            "data-code-mark=ins" => Some(Self::DataCodeMarkIns),
            "data-code-mark=del" => Some(Self::DataCodeMarkDel),
            "data-code-mark=mark" => Some(Self::DataCodeMarkMark),
            _ => None,
        }
    }

    pub(crate) fn is_data_fact(self) -> bool {
        matches!(
            self,
            Self::DataHozoOutside
                | Self::DataHozoDisabled
                | Self::DataHozoRangeStart
                | Self::DataHozoRangeEnd
                | Self::DataHozoInRange
                | Self::DataHozoStep
                | Self::DataHozoStepIncrease
                | Self::DataHozoStepDecrease
                | Self::DataDragging
                | Self::DataCollapsed
                | Self::DataHozoStateOpen
                | Self::DataHozoStateClosed
                | Self::DataHozoStateChecked
                | Self::DataHozoStateUnchecked
                | Self::DataHozoStateMixed
                | Self::DataCodeMark
                | Self::DataCodeMarkIns
                | Self::DataCodeMarkDel
                | Self::DataCodeMarkMark
        )
    }
}
