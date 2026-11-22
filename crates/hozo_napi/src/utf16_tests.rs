use super::native::{lower_native_module, NativeModuleOptions};
use super::*;

#[test]
fn module_syntax_errors_cross_napi_as_utf16_even_without_components() {
    let source = "// 😀 日本語\r\nexport const value = <";
    let parsed = hozo_parser::parse_tsx(source);
    let module = lower_native_module(
        source,
        &hozo_ir::Theme::default(),
        None,
        None,
        NativeModuleOptions::default(),
        &Default::default(),
        &[],
    );
    assert!(module.components.is_empty());
    assert_eq!(module.syntax_diagnostics.len(), parsed.syntax_errors.len());
    assert!(!module.syntax_diagnostics.is_empty());
    for (error, diagnostic) in parsed.syntax_errors.iter().zip(&module.syntax_diagnostics) {
        assert_eq!(diagnostic.code, "SOURCE_SYNTAX_ERROR");
        assert_eq!(diagnostic.severity, "error");
        assert_eq!(diagnostic.span_start, js_index_of(source, error.span.start));
        assert_eq!(diagnostic.span_end, js_index_of(source, error.span.end));
    }
}

/// What JavaScript would say, so the expectation is not a second
/// implementation of the thing under test.
fn js_index_of(source: &str, byte: u32) -> u32 {
    source[..byte as usize].encode_utf16().count() as u32
}

#[test]
fn an_ascii_source_translates_to_itself() {
    let source = "const a = 1;\nconst b = 2;\n";
    let offsets = Utf16Offsets::new(source);
    for byte in 0..=source.len() as u32 {
        assert_eq!(offsets.at(byte), byte);
    }
}

#[test]
fn every_offset_matches_what_javascript_would_index() {
    // One character from each width that differs: two bytes and one
    // unit, three and one, four and two.
    let source = "a é b 日 c 🚀 d";
    let offsets = Utf16Offsets::new(source);
    for (byte, _) in source
        .char_indices()
        .chain(std::iter::once((source.len(), ' ')))
    {
        let byte = byte as u32;
        assert_eq!(
            offsets.at(byte),
            js_index_of(source, byte),
            "at byte {byte}"
        );
    }
}

#[test]
fn a_span_after_non_ascii_text_lands_where_javascript_cuts() {
    // The failure this exists for: the component's span ended past the
    // JSX and the splice deleted the `)` and `}` that closed the
    // function. Three em dashes were worth six characters.
    let source = "\
import { View, Text } from '@hozo/core';
function App() {
  return (
    <View className=\"p-4\"><Text className=\"text-sm\">a — b — c —</Text></View>
  )
}
";
    let components = compile(source.to_string());
    assert_eq!(components.len(), 1);
    let end = components[0].span_end as usize;
    let utf16: Vec<u16> = source.encode_utf16().collect();
    let remainder = String::from_utf16(&utf16[end..]).unwrap();
    assert_eq!(remainder, "\n  )\n}\n", "the span ran past the JSX element");
}

#[test]
fn a_japanese_string_does_not_swallow_the_file() {
    // Ten code units of difference in one word, which was enough to
    // put the span at the end of the source. A compiler for React
    // Native that cannot compile this is not portable.
    let source = "\
import { View, Text } from '@hozo/core';
function App() {
  return (
    <View className=\"p-4\"><Text className=\"text-sm\">こんにちは</Text></View>
  )
}
";
    let components = compile(source.to_string());
    let end = components[0].span_end as usize;
    let utf16: Vec<u16> = source.encode_utf16().collect();
    assert!(end < utf16.len(), "the span reached the end of the file");
    assert_eq!(String::from_utf16(&utf16[end..]).unwrap(), "\n  )\n}\n");
}

#[test]
fn a_diagnostic_points_at_the_text_it_is_about() {
    // Diagnostics carry spans too, and a bundler resolves them to a
    // line and column. Off by the same amount, silently.
    let source = "\
import { View } from '@hozo/core';
const label = '— — —';
function App() {
  return <View className={label} />;
}
";
    let components = compile(source.to_string());
    let diagnostics: Vec<_> = components
        .iter()
        .flat_map(|c| c.diagnostics.iter())
        .collect();
    assert!(
        !diagnostics.is_empty(),
        "expected a dynamic-class diagnostic"
    );
    let utf16: Vec<u16> = source.encode_utf16().collect();
    for diagnostic in diagnostics {
        let start = diagnostic.span_start as usize;
        let end = diagnostic.span_end as usize;
        assert!(
            end <= utf16.len(),
            "diagnostic span past the end of the source"
        );
        let text = String::from_utf16(&utf16[start..end]).unwrap();
        assert!(
            source.contains(&text),
            "diagnostic span {start}..{end} cut {text:?}, which is not in the source"
        );
    }
}
