//! A test driver for the compiler-core operation, not a new compile option.
//! Browser probes execute this against the current Rust sources, never a
//! committed output snapshot or an independently implemented comparator.
use hozo_ir::{TailwindOrderContext, Theme};
use serde_json::json;

fn main() {
    let context = TailwindOrderContext::new(hozo_ir::portable_tailwind_snapshot()).unwrap();
    let theme = Theme::default();
    let mut rows = Vec::new();
    for (classes, keys) in [
        ("p-4 p-2", vec!["paddingTop", "paddingLeft"]),
        ("bg-red-500 bg-blue-500", vec![]),
        ("w-8 w-4", vec!["width"]),
        (
            "active:p-4 focus:bg-blue-500 p-4 p-2",
            vec!["paddingTop", "paddingLeft"],
        ),
    ] {
        for classes in [
            classes.to_string(),
            classes
                .split_whitespace()
                .rev()
                .collect::<Vec<_>>()
                .join(" "),
        ] {
            let source = format!("import {{Pressable}} from '@hozo/core'; const el=<Pressable className=\"{classes}\"/>;");
            let mut parsed = hozo_parser::parse_tsx(&source);
            let legacy = hozo_web::lower(&parsed.roots[0].node, &source, &theme);
            hozo_parser::order_module_tailwind(&mut parsed, &context);
            let web = hozo_web::lower(&parsed.roots[0].node, &source, &theme);
            let native = hozo_native::lower(&parsed.roots[0].node, &source, &theme);
            assert!(web.diagnostics.is_empty());
            assert!(native.diagnostics.is_empty());
            rows.push(json!({
                "classes": classes,
                "keys": keys,
                "webCss": web.css,
                "legacyCss": legacy.css,
                "native": {"jsx": native.jsx, "styles": native.styles, "prelude": native.prelude},
            }));
        }
    }
    println!(
        "{}",
        json!({"scope": "explicit compiler-core scalar plan, not adapter defaults", "rows": rows})
    );
}
