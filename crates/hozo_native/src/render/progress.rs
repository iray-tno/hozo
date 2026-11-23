//! `Progress`'s `accessibilityValue`, worked out from its `value` and `max`.

use super::*;

/// A progress bar's position, which React Native carries on
/// `accessibilityValue` rather than on `value` and `max`.
///
/// Those two are `<progress>`'s own props, and Hozo passes them through
/// because on the Web they are exactly right. On a View they are two
/// props the platform ignores, so the element announced itself as a
/// progress bar and reported no position -- a screen reader saying
/// "progress bar" and nothing else. The expressions are re-used as
/// written, so a value that changes still changes.
/// A `<meter>`'s amount is `HozoMeter`'s to work out, with its bar.
pub(super) fn accessibility_value(node: &Node, source: &str) -> Option<String> {
    let authored = |name: &str| -> Option<String> {
        node.props
            .passthrough
            .iter()
            .filter(|prop| prop.name.as_deref() == Some(name))
            .find_map(|prop| {
                let text = &source[prop.span.0.start as usize..prop.span.0.end as usize];
                let value = text.split_once('=')?.1.trim();
                value
                    .strip_prefix('{')
                    .and_then(|inner| inner.strip_suffix('}'))
                    .map(|inner| {
                        hozo_ir::attribute_capture::slice(source, inner.trim()).into_owned()
                    })
                    .or_else(|| {
                        // `max="100"`, which JSX gives as a string.
                        value
                            .strip_prefix('"')?
                            .strip_suffix('"')
                            .map(|inner| format!("'{inner}'"))
                    })
            })
    };
    let now = authored("value");
    let max = authored("max");
    // Heard on a device (#789): React Native hands Android whole numbers,
    // so a value of 0.6 in 0..1 was read as "0". A progress bar keeps its
    // range -- "progress bar" is the right word for one -- scaled to
    // 0..100 when its `max` is known, so a fractional value is not
    // rounded to nothing.
    // Worked out here when all three are written as numbers, so the
    // ordinary case reads as a number in the output; otherwise the same
    // sum is emitted for the runtime.
    let literal = |text: &str| text.trim_matches('\'').parse::<f64>().ok();
    let percent = |now: &str, min: &str, max: &str| match (literal(now), literal(min), literal(max))
    {
        (Some(now), Some(min), Some(max)) if max != min => {
            Ok(((now - min) / (max - min) * 100.0).round() as i64)
        }
        _ => Err(format!(
            "Math.round((({now}) - ({min})) / (({max}) - ({min})) * 100)"
        )),
    };
    if now.is_none() && max.is_none() {
        return None;
    }
    let fields = match (&now, &max) {
        (Some(now), Some(max)) => {
            let now = match percent(now, "0", max) {
                Ok(amount) => amount.to_string(),
                Err(sum) => sum,
            };
            vec![
                "min: 0".to_string(),
                "max: 100".to_string(),
                format!("now: {now}"),
            ]
        }
        (Some(now), None) => vec!["min: 0".to_string(), format!("now: {now}")],
        (None, Some(max)) => vec!["min: 0".to_string(), format!("max: {max}")],
        (None, None) => unreachable!("one of the two was authored"),
    };
    Some(format!(
        " accessibilityValue={{{{ {} }}}}",
        fields.join(", ")
    ))
}
