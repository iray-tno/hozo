use super::*;

fn compile(source: &str) -> LowerOutput {
    let parsed = hozo_parser::parse_tsx(source);
    lower(&parsed.roots[0].node, source, &Theme::default())
}

#[test]
fn paint_becomes_a_prop_rather_than_a_style() {
    // The asymmetry the compiler exists for: one class,
    // `fill-blue-500`, is a CSS declaration on Web and an attribute
    // here, because `react-native-svg` takes paint as props.
    let out = compile(
        "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg.Rect className=\"fill-blue-500 stroke-2\" />\n",
    );
    assert!(out.jsx.contains(r##"fill="#"##), "{}", out.jsx);
    assert!(out.jsx.contains("strokeWidth={2}"), "{}", out.jsx);
    // And not reported as a Web-only style, which is what it was
    // before the SVG elements existed to lower it onto.
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
}

#[test]
fn svg_text_holds_its_own_string() {
    // A bare string inside a `View` crashes on this platform, so the
    // compiler inserts a `Text`. Inside `<Svg.Text>` there is nothing
    // to fix, and inserting one puts a text node where an SVG element
    // belongs -- the string vanishes rather than rendering.
    let out = compile(
        "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg.Text>hi</Svg.Text>\n",
    );
    assert!(out.jsx.contains("<SvgText>hi</SvgText>"), "{}", out.jsx);
}

#[test]
fn the_import_comes_from_the_svg_subpath_by_name() {
    // `SvgText`, not `Text`: generated files already import `Text`
    // from `react-native` for the wrapper above, and two bindings of
    // one name in a file neither of them wrote is not a collision
    // anyone could debug.
    let out = compile(
        "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg><Svg.Text>hi</Svg.Text></Svg>\n",
    );
    assert!(
        out.runtime_imports.contains(&"Svg"),
        "{:?}",
        out.runtime_imports
    );
    assert!(
        out.runtime_imports.contains(&"SvgText"),
        "{:?}",
        out.runtime_imports
    );
    assert!(
        !out.runtime_imports.contains(&"Text"),
        "{:?}",
        out.runtime_imports
    );
}

#[test]
fn svg_link_uses_the_router_aware_native_group() {
    let out = compile(
            "import { Svg } from '@hozo/svg'\n\
             export const C = () => <Svg><Svg.Link href=\"/detail\" replace><Svg.Rect width={10} height={10} /></Svg.Link></Svg>\n",
        );
    assert!(
        out.runtime_imports.contains(&"SvgLink"),
        "{:?}",
        out.runtime_imports
    );
    assert!(
        out.jsx
            .contains(r#"<SvgLink replace={true} href="/detail">"#),
        "{}",
        out.jsx
    );
    assert!(out.jsx.contains("</SvgLink>"), "{}", out.jsx);
}
