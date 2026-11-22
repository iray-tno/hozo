//! Options for a Native compile, read from JS.

use napi_derive::napi;

/// Named internal NAPI options keep evidence separate from RFC 006 ABI
/// experiments instead of extending an accumulating positional bool list.
#[derive(Default)]
#[napi(object)]
pub struct NativeCompileOptions {
    /// Exact surviving child/passthrough fragments from ordinary Native rendering only.
    pub source_evidence: Option<bool>,
    pub owner_style: Option<bool>,
    pub owner_facts: Option<Vec<String>>,
    pub owner_events: Option<Vec<String>>,
    pub owner_text: Option<String>,
    pub text_reference: Option<bool>,
    /// Decision 013's route, which Metro selects by default.
    pub text_unified: Option<bool>,
    pub tailwind_plan: Option<bool>,
}

impl NativeCompileOptions {
    pub(crate) fn owner_facts(&self) -> napi::Result<Vec<hozo_native::OwnerFact>> {
        let Some(keys) = &self.owner_facts else {
            return Ok(Vec::new());
        };
        if !self.owner_style.unwrap_or(false) {
            return Err(napi::Error::from_reason(
                "Internal ownerFacts requires ownerStyle",
            ));
        }
        let mut facts = Vec::new();
        for key in keys {
            let fact = match key.as_str() {
                "disabled" => hozo_native::OwnerFact::Disabled,
                "readOnly" => hozo_native::OwnerFact::ReadOnly,
                "aria-selected" => hozo_native::OwnerFact::AriaSelected,
                "aria-checked" => hozo_native::OwnerFact::AriaChecked,
                "aria-disabled" => hozo_native::OwnerFact::AriaDisabled,
                "aria-invalid" => hozo_native::OwnerFact::AriaInvalid,
                "aria-required" => hozo_native::OwnerFact::AriaRequired,
                "aria-expanded" => hozo_native::OwnerFact::AriaExpanded,
                "data-hozo-outside" => hozo_native::OwnerFact::DataHozoOutside,
                "data-hozo-disabled" => hozo_native::OwnerFact::DataHozoDisabled,
                "data-hozo-range-start" => hozo_native::OwnerFact::DataHozoRangeStart,
                "data-hozo-range-end" => hozo_native::OwnerFact::DataHozoRangeEnd,
                "data-hozo-in-range" => hozo_native::OwnerFact::DataHozoInRange,
                "data-hozo-step" => hozo_native::OwnerFact::DataHozoStep,
                "data-hozo-step=increase" => hozo_native::OwnerFact::DataHozoStepIncrease,
                "data-hozo-step=decrease" => hozo_native::OwnerFact::DataHozoStepDecrease,
                "data-dragging" => hozo_native::OwnerFact::DataDragging,
                "data-collapsed" => hozo_native::OwnerFact::DataCollapsed,
                "data-hozo-state=open" => hozo_native::OwnerFact::DataHozoStateOpen,
                "data-hozo-state=closed" => hozo_native::OwnerFact::DataHozoStateClosed,
                "data-hozo-state=checked" => hozo_native::OwnerFact::DataHozoStateChecked,
                "data-hozo-state=unchecked" => hozo_native::OwnerFact::DataHozoStateUnchecked,
                "data-hozo-state=mixed" => hozo_native::OwnerFact::DataHozoStateMixed,
                "data-code-mark" => hozo_native::OwnerFact::DataCodeMark,
                "data-code-mark=ins" => hozo_native::OwnerFact::DataCodeMarkIns,
                "data-code-mark=del" => hozo_native::OwnerFact::DataCodeMarkDel,
                "data-code-mark=mark" => hozo_native::OwnerFact::DataCodeMarkMark,
                _ => {
                    return Err(napi::Error::from_reason(format!(
                        "Unsupported owner fact: {key}"
                    )))
                }
            };
            if facts.contains(&fact) {
                return Err(napi::Error::from_reason(format!(
                    "Duplicate owner fact: {key}"
                )));
            }
            facts.push(fact);
        }
        Ok(facts)
    }

    pub(crate) fn owner_events(&self) -> napi::Result<Vec<hozo_native::OwnerEvent>> {
        let Some(keys) = &self.owner_events else {
            return Ok(Vec::new());
        };
        if !self.owner_style.unwrap_or(false) {
            return Err(napi::Error::from_reason(
                "Internal ownerEvents requires ownerStyle",
            ));
        }
        let mut events = Vec::new();
        for key in keys {
            let event = match key.as_str() {
                "pressed" => hozo_native::OwnerEvent::Pressed,
                "hovered" => hozo_native::OwnerEvent::Hovered,
                "focused" => hozo_native::OwnerEvent::Focused,
                "focusVisible" => hozo_native::OwnerEvent::FocusVisible,
                _ => {
                    return Err(napi::Error::from_reason(format!(
                        "Unsupported owner event: {key}"
                    )))
                }
            };
            if events.contains(&event) {
                return Err(napi::Error::from_reason(format!(
                    "Duplicate owner event: {key}"
                )));
            }
            events.push(event);
        }
        Ok(events)
    }

    pub(crate) fn validate_owner_style(&self) -> napi::Result<()> {
        if self.source_evidence.unwrap_or(false)
            && (self.owner_style.unwrap_or(false) || self.text_reference.unwrap_or(false))
        {
            return Err(napi::Error::from_reason(
                "Internal sourceEvidence requires ordinary Native lowering",
            ));
        }
        self.owner_facts()?;
        self.owner_events()?;
        if let Some(target) = &self.owner_text {
            if target != "split" || !self.owner_style.unwrap_or(false) {
                return Err(napi::Error::from_reason(
                    "Internal ownerText requires ownerStyle and the split destination",
                ));
            }
        }
        if self.owner_style.unwrap_or(false) && self.text_reference.unwrap_or(false) {
            return Err(napi::Error::from_reason(
                "Internal ownerStyle cannot be combined with text experiments",
            ));
        }
        // Source evidence may accompany it: the route only wraps rendered
        // fragments, so the copied source spans stay exact.
        if self.text_unified.unwrap_or(false)
            && (self.owner_style.unwrap_or(false) || self.text_reference.unwrap_or(false))
        {
            return Err(napi::Error::from_reason(
                "textUnified is its own route; select no other text or owner experiment with it",
            ));
        }
        Ok(())
    }
}
