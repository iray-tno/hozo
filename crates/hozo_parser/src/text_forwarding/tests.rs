use super::*;

#[test]
fn forwarding_does_not_assume_unresolved_merger_rules() {
    let source = button(
            "return <Host {...rest} disabled={disabled} className={classes('text-sm', 'text-lg', className)} />",
        );
    let join = format!("import {{ twJoin as classes }} from 'tailwind-merge';{source}");
    let merge = format!("import {{ twMerge as classes }} from 'tailwind-merge';{source}");
    assert_eq!(summarize_text_forwarding(&join).components.len(), 1);
    assert!(summarize_text_forwarding(&merge).components.is_empty());
}

fn button(body: &str) -> String {
    format!(
        "import {{ cx }} from '@hozo/core'
import {{ Button as Host }} from '@hozo/primitives'
export function HozoButton({{ tone = 'neutral', size = 'md', className, disabled, ...rest }}) {{
{body}
}}
"
    )
}

#[test]
fn a_tone_chain_is_read_for_every_combination() {
    let source = button(
            "  if (tone === 'accent') {
    return (
      <Host {...rest} disabled={disabled} className={cx('font-semibold text-white disabled:text-gray-500', size === 'sm' ? 'text-sm' : 'text-base', className)} />
    )
  }
  return <Host {...rest} disabled={disabled} className={cx('text-black', className)} />",
        );
    let summary = summarize_text_forwarding(&source);
    let [component] = summary.components.as_slice() else {
        panic!("{summary:?}")
    };
    assert_eq!(component.name, "HozoButton");
    assert_eq!(component.disabled_prop.as_deref(), Some("disabled"));
    assert!(
        component.host_states,
        "a pressable primitive shares its state"
    );
    let props: Vec<_> = component
        .props
        .iter()
        .map(|p| (p.name.as_str(), p.default.as_deref(), p.values.clone()))
        .collect();
    assert_eq!(
        props,
        [
            ("size", Some("md"), vec!["md".to_string(), "sm".to_string()]),
            (
                "tone",
                Some("neutral"),
                vec!["accent".to_string(), "neutral".to_string()]
            ),
        ]
    );
    let variant = |size: &str, tone: &str| {
        component
            .variants
            .iter()
            .find(|v| v.when == [size, tone])
            .map(|v| v.classes.as_str())
    };
    assert_eq!(
        variant("sm", "accent"),
        Some("font-semibold text-white disabled:text-gray-500 text-sm")
    );
    assert_eq!(
        variant("md", "accent"),
        Some("font-semibold text-white disabled:text-gray-500 text-base")
    );
    assert_eq!(variant("md", "neutral"), Some("text-black"));
    assert_eq!(component.variants.len(), 4);
}

#[test]
fn string_switch_returns_have_the_same_summary_as_an_if_chain() {
    let imports = "import {Button as Host} from '@hozo/primitives'";
    let params = "{tone: t = 'quiet', children: label, disabled: off, ...rest}";
    let loud = "<Host {...rest} disabled={off} className=\"font-bold hover:text-red-500 disabled:text-gray-400\">{label}</Host>";
    let quiet = "<Host {...rest} disabled={off} className=\"text-sm\">{label}</Host>";
    let plain = format!("{imports}\nexport function Check({params}) {{ if (t === 'loud') return {loud}; if (t === 'strong') return {loud}; return {quiet} }}");
    let expected = summarize_text_forwarding(&plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(expected.components[0].variants.len(), 3);
    for body in [
            format!("switch (t) {{ case 'loud': case 'strong': return {loud}; default: return {quiet}; }}"),
            format!("switch (t) {{ default: return {quiet}; case 'loud': case 'strong': {{ return {loud}; }} }}"),
            format!("switch (t) {{ case 'loud': case 'strong': return {loud}; }} return {quiet};"),
        ] {
            let source = format!("{imports}\nexport const Check = ({params}) => {{ {body} }}");
            assert_eq!(summarize_text_forwarding(&source), expected, "{source}");
        }
}

#[test]
fn switch_lookups_use_the_same_constants_and_class_reader() {
    let source = "import {Button as Host} from '@hozo/primitives'
export function Check({tone = 'quiet', size = 'md', children, ...rest}) {
 const looks = {sm: 'text-sm', md: 'text-base'} as const
 switch (tone) {
   case 'loud': return <Host {...rest} className={looks[size]}>{children}</Host>
   default: return <Host {...rest} className=\"text-black\">{children}</Host>
 }
}";
    let plain = source
        .replace("switch (tone) {", "")
        .replace("case 'loud':", "if (tone === 'loud')")
        .replace("default:", "")
        .replacen("\n }\n}", "\n}", 1);
    let expected = summarize_text_forwarding(&plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(summarize_text_forwarding(source), expected);
}

#[test]
fn unreadable_switch_control_flow_gives_no_entry() {
    let host = "<Host className=\"text-sm\">{children}</Host>";
    for body in [
            format!("switch (tone) {{ case compute(): return {host}; default: return {host}; }}"),
            format!("switch (tone) {{ case 1: return {host}; default: return {host}; }}"),
            format!("switch (unknown) {{ case 'a': return {host}; default: return {host}; }}"),
            format!("switch (tone) {{ case 'a': return {host}; }}"),
            format!("switch (tone) {{ case 'a': return {host}; case 'a': return {host}; default: return {host}; }}"),
            format!("switch (tone) {{ case 'a': effect(); default: return {host}; }}"),
            format!("switch (tone) {{ case 'a': break; default: return {host}; }} return {host};"),
            format!("switch (tone) {{ case 'a': const own = 'text-lg'; return {host}; default: return {host}; }}"),
            format!("switch (tone) {{ default: return {host}; case 'a': }}"),
            format!("switch (tone) {{ default: return {host}; }} return {host};"),
        ] {
            let source = format!("import {{Button as Host}} from '@hozo/primitives'\nexport function Check({{tone = 'quiet', children}}) {{ {body} }}");
            assert!(summarize_text_forwarding(&source).components.is_empty(), "{source}");
        }
}

#[test]
fn an_absent_disabled_source_is_not_an_uninitialized_one() {
    let source = "import {Button as Host} from '@hozo/primitives'
export function Check({tone = 'z', children, disabled, ...rest}) {
 if (tone === 'a') return <Host {...rest} className=\"text-sm disabled:text-gray-400\">{children}</Host>
 return <Host {...rest} disabled={disabled} className=\"text-sm disabled:text-gray-400\">{children}</Host>
}";
    assert!(summarize_text_forwarding(source).components.is_empty());
    let switched = source
        .replace("if (tone === 'a')", "switch (tone) { case 'a':")
        .replace("\n return <Host", "\n default: return <Host")
        .replace("\n}", "\n} }");
    assert!(summarize_text_forwarding(&switched).components.is_empty());
}

#[test]
fn renamed_bindings_keep_the_public_prop_names_defaults_and_disabled_source() {
    let plain = "import {cx} from '@hozo/core'
import {Button as Host} from '@hozo/primitives'
export function Check({tone = 'neutral', size = 'md', className, children, inactive, ...rest}) {
  if (tone === 'accent') return <Host {...rest} disabled={inactive} className={cx('font-bold text-white disabled:text-gray-400', size === 'sm' ? 'text-sm' : 'text-base', className)}>{children}</Host>
  return <Host {...rest} disabled={inactive} className={cx('text-black', className)}>{children}</Host>
}";
    let aliased = plain
            .replace("{tone = 'neutral', size = 'md', className, children, inactive, ...rest}", "{tone: t = 'neutral', size: s = 'md', className: classes, children: label, inactive: off, ...rest}")
            .replace("tone ===", "t ===")
            .replace("size ===", "s ===")
            .replace("disabled={inactive}", "disabled={off}")
            .replace(", className)", ", classes)")
            .replace("{children}</Host>", "{label}</Host>");
    let expected = summarize_text_forwarding(plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(
        expected.components[0].disabled_prop.as_deref(),
        Some("inactive")
    );
    assert_eq!(expected.components[0].props[0].name, "size");
    assert_eq!(expected.components[0].props[1].name, "tone");
    assert_eq!(summarize_text_forwarding(&aliased), expected);
}

#[test]
fn renamed_props_compose_with_maps_wrappers_and_the_callers_class_join() {
    let plain = "import {memo, forwardRef} from 'react'
import {Button as Host} from '@hozo/primitives'
const looks = {quiet: 'text-sm', loud: 'font-bold hover:text-red-500 disabled:text-gray-400'} as const
export const Check = memo(forwardRef(({tone = 'quiet', className, children, disabled, ...rest}, ref) =>
  <Host ref={ref} {...rest} disabled={disabled} className={className ? `${looks[tone]} ${className}` : looks[tone]}>{children}</Host>))";
    let aliased = plain
        .replace(
            "{tone = 'quiet', className, children, disabled, ...rest}",
            "{tone: t = 'quiet', className: classes, children: label, disabled: off, ...rest}",
        )
        .replace("looks[tone]", "looks[t]")
        .replace("disabled={disabled}", "disabled={off}")
        .replace("className ?", "classes ?")
        .replace("${className}", "${classes}")
        .replace("{children}</Host>", "{label}</Host>");
    let expected = summarize_text_forwarding(plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(expected.components[0].props[0].name, "tone");
    assert_eq!(summarize_text_forwarding(&aliased), expected);
}

#[test]
fn renaming_a_prop_does_not_put_it_back_in_the_rest() {
    let source = "import {Checkbox as Host} from '@hozo/patterns'
export const Check = ({className: classes, disabled: off, ...rest}) => <Host {...rest} className=\"text-sm disabled:text-gray-400\" />";
    let summary = summarize_text_forwarding(source);
    assert_eq!(summary.components.len(), 1);
    assert_eq!(summary.components[0].disabled_prop, None);
    // Explicitly taken children are not in the rest either.
    let dropped = source.replace("disabled: off", "disabled: off, children: label");
    assert!(summarize_text_forwarding(&dropped).components.is_empty());
}

#[test]
fn a_renamed_presence_guard_still_requires_the_same_look_on_both_hosts() {
    let plain = "import {Button as Host} from '@hozo/primitives'
export function Check({children, href, ...rest}) {
  if (href != null) return <Host {...rest} href={href} className=\"text-sm\">{children}</Host>
  return <Host {...rest} className=\"text-sm\">{children}</Host>
}";
    let aliased = plain
        .replace(
            "{children, href, ...rest}",
            "{children: label, href: destination, ...rest}",
        )
        .replace("href !=", "destination !=")
        .replace("href={href}", "href={destination}")
        .replace("{children}", "{label}");
    let expected = summarize_text_forwarding(plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(summarize_text_forwarding(&aliased), expected);
    let different = aliased.replacen("text-sm", "text-lg", 1);
    assert!(summarize_text_forwarding(&different).components.is_empty());
}

#[test]
fn public_spelling_is_not_a_second_local_binding() {
    let source = "import {Button as Host} from '@hozo/primitives'
export const Check = ({tone: t = 'quiet', theme: tone = 'dim', children: label}) =>
  <Host className={tone === 'bright' ? 'text-white' : 'text-black'}>{label}</Host>";
    let summary = summarize_text_forwarding(source);
    assert_eq!(summary.components.len(), 1);
    assert_eq!(summary.components[0].props[0].name, "theme");
    assert_eq!(
        summary.components[0].props[0].default.as_deref(),
        Some("dim")
    );
    // An alias called className is not necessarily the caller's class list.
    let ordinary = source
        .replace("theme: tone", "theme: className")
        .replace("tone ===", "className ===");
    assert_eq!(summarize_text_forwarding(&ordinary), summary);
}

#[test]
fn aliases_do_not_turn_unknown_or_shadowed_values_into_facts() {
    for (extra, definition) in [
            ("", "({children: label, tone: t}) => <Host className={tone === 'loud' ? 'text-lg' : 'text-sm'}>{label}</Host>"),
            ("", "({children: label}) => <Host className=\"text-sm\">{children}</Host>"),
            ("", "({children, tone: className}) => <Host className={className}>{children}</Host>"),
            ("const own = 'text-sm'", "({children, tone: own}) => <Host className={own}>{children}</Host>"),
            ("const looks = {quiet: 'text-sm'}", "({children, tone = 'quiet', look: looks}) => <Host className={looks[tone]}>{children}</Host>"),
            ("import {cx} from '@hozo/core'", "({children, helper: cx}) => <Host className={cx('text-sm')}>{children}</Host>"),
            ("", "({children, component: Host}) => <Host className=\"text-sm\">{children}</Host>"),
            ("", "({children, tone: t = 'quiet', tone: u = 'loud'}) => <Host className={t === 'quiet' ? 'text-lg' : 'text-sm'}>{children}</Host>"),
            ("", "({children, tone: {value: t}}) => <Host className=\"text-sm\">{children}</Host>"),
            ("const key = 'tone'", "({children, [key]: t}) => <Host className=\"text-sm\">{children}</Host>"),
        ] {
            let source = format!("import {{Button as Host}} from '@hozo/primitives'\n{extra}\nexport const Check = {definition}");
            assert!(summarize_text_forwarding(&source).components.is_empty(), "{source}");
        }
}

#[test]
fn an_exported_const_arrow_block_has_the_same_summary_as_a_function() {
    let source = button(
            "const own = size === 'sm' ? 'text-sm' : 'text-base'
  if (tone === 'accent') return <Host {...rest} disabled={disabled} className={cx('text-white hover:text-red-500', own, className)} />
  return <Host {...rest} disabled={disabled} className={cx('text-black', own, className)} />",
        );
    let arrow = source.replace(
            "export function HozoButton({ tone = 'neutral', size = 'md', className, disabled, ...rest }) {",
            "export const HozoButton = ({ tone = 'neutral', size = 'md', className, disabled, ...rest }) => {",
        );
    let expected = summarize_text_forwarding(&source);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(summarize_text_forwarding(&arrow), expected);
}

#[test]
fn a_concise_arrow_uses_the_same_host_and_variant_reader() {
    let imports = "import { Checkbox as Host } from '@hozo/patterns'
const own = 'text-sm hover:text-red-500 disabled:text-gray-400'
";
    let params = "{ tone = 'quiet', children, className, ...rest }: Props";
    let host = "<Host {...rest} className={tone === 'loud' ? `font-bold ${own} ${className}` : own}>{children}</Host>";
    let source = format!("{imports}export function Check({params}) {{ return ({host}) }}");
    let arrow = format!("{imports}export const Check = ({params}) => ({host})");
    let expected = summarize_text_forwarding(&source);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(
        expected.components[0].disabled_prop.as_deref(),
        Some("disabled")
    );
    assert!(expected.components[0].host_states);
    assert_eq!(summarize_text_forwarding(&arrow), expected);
}

#[test]
fn arrows_are_recorded_only_under_their_exported_names() {
    let source = "import { View } from '@hozo/core'
const Private = ({children}) => <View className=\"text-red-500\">{children}</View>
const Local = ({children}) => <View className=\"text-sm\">{children}</View>,
      Other = ({children}) => { return <View className=\"font-bold\">{children}</View> }
export { Local as Label, Local as Alternate, Other }
export const Direct = ({children}) => <View className=\"text-lg\">{children}</View>,
             Second = ({children}) => <View className=\"text-xl\">{children}</View>";
    let summary = summarize_text_forwarding(source);
    let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Alternate", "Direct", "Label", "Other", "Second"]);
    assert_eq!(summary.components[0].variants[0].classes, "text-sm");
    assert_eq!(summary.components[2].variants[0].classes, "text-sm");
    assert!(!summary.components[0].host_states);
}

#[test]
fn react_memo_keeps_an_inline_renders_forwarding_contract() {
    let imports = "import { memo as cached } from 'react'
import { Checkbox as Host } from '@hozo/patterns'
const own = 'text-sm hover:text-red-500 disabled:text-gray-400'
";
    let params = "{ tone = 'quiet', children, className, ...rest }";
    let host = "<Host {...rest} className={tone === 'loud' ? `font-bold ${own} ${className}` : own}>{children}</Host>";
    let plain = format!("{imports}export const Check = ({params}) => ({host})");
    let expected = summarize_text_forwarding(&plain);
    assert_eq!(expected.components.len(), 1);
    for render in [
        format!("({params}) => ({host})"),
        format!("({params}) => {{ return ({host}) }}"),
        format!("function Render({params}) {{ return ({host}) }}"),
    ] {
        for wrapped in [
            format!("cached({render})"),
            format!("cached({render}, (previous, next) => previous === next)"),
        ] {
            let source = format!("{imports}const Local = {wrapped}; export {{ Local as Check }}");
            assert_eq!(summarize_text_forwarding(&source), expected, "{source}");
        }
    }
}

#[test]
fn react_forward_ref_reads_the_props_but_not_the_ref_as_props() {
    let imports = "import React, { forwardRef as withRef } from 'react'
import { Button as Host } from '@hozo/primitives'
";
    let props = "{ tone = 'quiet', children, disabled, ...rest }";
    let host = "<Host {...rest} disabled={disabled} className={tone === 'loud' ? 'text-lg hover:text-red-500' : 'text-sm'}>{children}</Host>";
    let plain = format!("{imports}export const Check = ({props}) => ({host})");
    let expected = summarize_text_forwarding(&plain);
    assert_eq!(expected.components.len(), 1);
    for wrapped in [
        format!(
            "withRef<HostRef, Props>(({props}, ref) => ({}))",
            host.replace("<Host ", "<Host ref={ref} ")
        ),
        format!(
            "React.forwardRef(function Render({props}, ref) {{ return {} }})",
            host.replace("<Host ", "<Host ref={ref} ")
        ),
        format!(
            "React.memo(withRef(({props}, ref) => {{ return {} }}))",
            host.replace("<Host ", "<Host ref={ref} ")
        ),
    ] {
        let source = format!("{imports}export const Check = {wrapped}");
        assert_eq!(summarize_text_forwarding(&source), expected, "{source}");
    }
    let namespace = plain
        .replace(
            "import React, { forwardRef as withRef } from 'react'",
            "import * as R from 'react'",
        )
        .replace(
            &format!("({props}) => ({host})"),
            &format!(
                "R.memo(R.forwardRef(({props}, ref) => ({})))",
                host.replace("<Host ", "<Host ref={ref} ")
            ),
        );
    assert_eq!(summarize_text_forwarding(&namespace), expected);
}

#[test]
fn react_wrapper_recognition_does_not_trust_names_or_hidden_renderers() {
    let render = "({children}) => <Host className=\"text-sm\">{children}</Host>";
    for (imports, wrapped) in [
            ("const memo = x => x", format!("memo({render})")),
            ("import {memo} from 'other-library'", format!("memo({render})")),
            ("import type {memo} from 'react'", format!("memo({render})")),
            ("import R from 'other-library'", format!("R.memo({render})")),
            ("import type * as R from 'react'", format!("R.memo({render})")),
            ("import {memo} from 'react'", "memo(Unknown)".to_string()),
            ("import {memo} from 'react'", format!("memo(...[{render}])")),
            ("import {memo} from 'react'", format!("memo({render}, ...comparators)")),
            ("import {memo} from 'react'", format!("memo({render}, equal, extra)")),
            ("import {forwardRef, memo} from 'react'", format!("forwardRef(memo({render}))")),
            ("import {forwardRef} from 'react'", format!("forwardRef({render}, extra)")),
            ("import {memo} from 'react'", format!("memo(async {render})")),
            ("import React from 'react'", format!("React['memo']({render})")),
            ("import React from 'react'", format!("React.memo?.({render})")),
            ("import {memo} from 'react'", "memo(function* Render({children}) { return <Host className=\"text-sm\">{children}</Host> })".to_string()),
            ("import {forwardRef} from 'react'", "forwardRef(({children}, {current}) => <Host className=\"text-sm\">{children}</Host>)".to_string()),
            ("import {forwardRef} from 'react'", "forwardRef(({children}, ref = fallback) => <Host className=\"text-sm\">{children}</Host>)".to_string()),
            ("import {forwardRef} from 'react'", "forwardRef(({children}, Host) => <Host className=\"text-sm\">{children}</Host>)".to_string()),
            ("import {memo} from 'react'", "memo(function Host({children}) { return <Host className=\"text-sm\">{children}</Host> })".to_string()),
            ("import {memo} from 'react'", "memo(({children, Host}) => <Host className=\"text-sm\">{children}</Host>)".to_string()),
            ("import {forwardRef} from 'react'; const own = 'text-sm'", "forwardRef(({children}, own) => <Host className={own}>{children}</Host>)".to_string()),
            ("import {forwardRef} from 'react'", "forwardRef(({children}, className) => <Host className={className}>{children}</Host>)".to_string()),
        ] {
            let source = format!("import {{ Button as Host }} from '@hozo/primitives'\n{imports}\nexport const Check = {wrapped}");
            assert!(summarize_text_forwarding(&source).components.is_empty(), "{source}");
        }
}

#[test]
fn memo_unwrapping_is_bounded_and_forward_ref_requires_a_render_function() {
    let render = "({children}) => <Host className=\"text-sm\">{children}</Host>";
    let source = |value: &str| {
        format!(
            "import {{memo, forwardRef}} from 'react'\nimport {{View as Host}} from '@hozo/primitives'\nexport const Check = {value}"
        )
    };
    let mut value = render.to_string();
    for _ in 0..8 {
        value = format!("memo({value})");
    }
    assert_eq!(
        summarize_text_forwarding(&source(&value)).components.len(),
        1
    );
    assert!(
        summarize_text_forwarding(&source(&format!("memo({value})")))
            .components
            .is_empty()
    );
    assert!(
        summarize_text_forwarding(&source(&format!("forwardRef(forwardRef({render}))")))
            .components
            .is_empty()
    );
}

#[test]
fn react_wrappers_share_the_object_map_reader() {
    let imports = "import {memo, forwardRef} from 'react'
import {Button as Host} from '@hozo/primitives'
const looks = {quiet: 'text-sm', loud: 'font-bold hover:text-red-500'} as const
";
    let props = "{tone = 'quiet', children, ...rest}";
    let host = "<Host {...rest} className={looks[tone]}>{children}</Host>";
    let plain = format!("{imports}export const Check = ({props}) => ({host})");
    let wrapped = format!(
        "{imports}export const Check = memo(forwardRef(({props}, ref) => ({})))",
        host.replace("<Host ", "<Host ref={ref} ")
    );
    let expected = summarize_text_forwarding(&plain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(expected.components[0].variants.len(), 2);
    assert_eq!(summarize_text_forwarding(&wrapped), expected);
}

#[test]
fn arrow_support_does_not_guess_through_mutation_wrappers_or_unknown_bodies() {
    for definition in [
            "export let B = ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export var B = ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export const B = async ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export const B = memo(({children}) => <Host className=\"text-sm\">{children}</Host>)",
            "export const B = forwardRef(({children}, ref) => <Host ref={ref} className=\"text-sm\">{children}</Host>)",
            "export const B = ({children}) => makeHost(children)",
            "export const B = ({children}) => { effect(); return <Host className=\"text-sm\">{children}</Host> }",
            "export const B = ({children}) => <Host className=\"text-sm\" />",
            "export const B = ({children}) => <Text className=\"text-sm\">{children}</Text>",
            "export const B = ({children}) => <><Host className=\"text-sm\">{children}</Host></>",
            "export const B = ({children}) => <Host className={compute()}>{children}</Host>",
            "export const B = ({children, tone: {value: t}}) => <Host className={t === 'loud' ? 'text-lg' : 'text-sm'}>{children}</Host>",
        ] {
            let source = format!(
                "import {{ Button as Host, Text }} from '@hozo/primitives'\n{definition}"
            );
            assert!(
                summarize_text_forwarding(&source).components.is_empty(),
                "{definition}"
            );
        }
}

#[test]
fn an_object_map_reads_as_the_chain_it_replaces() {
    let chain = button(
            "  return <Host {...rest} disabled={disabled} className={cx('font-semibold', tone === 'accent' ? 'text-white hover:text-red-500' : tone === 'neutral' ? 'text-black' : '', size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : '', className)} />",
        );
    let map = button(
            "  const sizes = { sm: 'text-sm', 'md': 'text-base' }
  return <Host {...rest} disabled={disabled} className={cx('font-semibold', tones[tone], sizes[size as Size], className)} />",
        )
        .replace(
            "export function",
            "const tones = { accent: 'text-white hover:text-red-500', neutral: 'text-black' } as const satisfies Record<Tone, string>\nexport function",
        );
    let expected = summarize_text_forwarding(&chain);
    assert_eq!(expected.components.len(), 1);
    assert_eq!(expected.components[0].variants.len(), 4);
    assert_eq!(summarize_text_forwarding(&map), expected);
}

#[test]
fn a_value_the_map_has_no_key_for_hands_down_nothing_from_it() {
    // The default is not a key: `tones['plain']` is undefined, which
    // the join drops.
    let source =
        button("  return <Host {...rest} className={`text-sm ${tones[tone]} ${className}`} />")
            .replace("tone = 'neutral'", "tone = 'plain'")
            .replace(
                "export function",
                "const tones = { accent: 'text-white' }\nexport function",
            );
    let summary = summarize_text_forwarding(&source);
    let [component] = summary.components.as_slice() else {
        panic!("{summary:?}")
    };
    let classes: Vec<_> = component
        .variants
        .iter()
        .map(|v| (v.when.join(","), v.classes.as_str()))
        .collect();
    assert_eq!(
        classes,
        [
            ("accent".to_string(), "text-sm text-white"),
            ("plain".to_string(), "text-sm"),
        ]
    );
}

#[test]
fn a_map_it_cannot_read_whole_gives_no_entry() {
    for (map, class_name) in [
        // A spread could hold any key.
        ("{ ...base, accent: 'text-white' }", "tones[tone]"),
        // A computed key is a value the reader would have to guess.
        ("{ [accent]: 'text-white' }", "tones[tone]"),
        ("{ accent() { return 'text-white' } }", "tones[tone]"),
        // One unreadable entry is a wrong look for the value that picks it.
        (
            "{ accent: 'text-white', neutral: compute() }",
            "tones[tone]",
        ),
        ("{}", "tones[tone]"),
        // Picked by something other than a prop.
        ("{ accent: 'text-white' }", "tones[other]"),
        ("{ accent: 'text-white' }", "tones['accent' + tone]"),
        // A map named where a class list belongs.
        ("{ accent: 'text-white' }", "tones"),
        ("{ accent: 'text-white' }", "tones.accent"),
        ("['text-white']", "tones[tone]"),
    ] {
        let source = button(&format!(
            "  return <Host {{...rest}} className={{cx({class_name}, className)}} />"
        ))
        .replace(
            "export function",
            &format!("const tones = {map}\nexport function"),
        );
        assert!(
            summarize_text_forwarding(&source).components.is_empty(),
            "{map} / {class_name}"
        );
    }
}

#[test]
fn a_shape_it_cannot_read_gives_no_entry() {
    // A class list built at runtime.
    let joined = button("  return <Host {...rest} className={[base, className].join(' ')} />");
    assert!(summarize_text_forwarding(&joined).components.is_empty());
    // Children that do not reach the host.
    let dropped = "import { Button as Host } from '@hozo/primitives'
export function Icon({ className }) { return <Host className=\"text-white\" /> }";
    assert!(summarize_text_forwarding(dropped).components.is_empty());
    // A Text host: a Text nested in it inherits without help.
    let text = "import { Text } from '@hozo/primitives'
export function Label({ ...rest }) { return <Text {...rest} className=\"text-white\" /> }";
    assert!(summarize_text_forwarding(text).components.is_empty());
    // The caller's className changes more than the caller's part.
    let differs = "import { View } from '@hozo/core'
export function Box({ children, className }) { return <View className={className ? `text-sm ${className}` : 'text-lg'}>{children}</View> }";
    assert!(summarize_text_forwarding(differs).components.is_empty());
    // A constant that is not a class list, read where one is needed.
    let computed = "import { View } from '@hozo/core'
const own = ['text-sm'].join(' ')
export function Box({ children }) { return <View className={own}>{children}</View> }";
    assert!(summarize_text_forwarding(computed).components.is_empty());
    // A join helper defined locally.
    let local = "import { Button as Host } from '@hozo/primitives'
const cx = (...a) => a.join(' ')
export function B({ className, ...rest }) { return <Host {...rest} className={cx('text-white', className)} /> }";
    assert!(summarize_text_forwarding(local).components.is_empty());
}

#[test]
fn children_named_in_the_props_must_be_rendered() {
    let source = "import { Pressable } from '@hozo/core'
export function Chip({ children, onPress }) { return <Pressable onPress={onPress} className=\"text-blue-600\">{children}</Pressable> }";
    let summary = summarize_text_forwarding(source);
    assert_eq!(summary.components[0].variants[0].classes, "text-blue-600");
    assert!(summary.components[0].props.is_empty());
}

#[test]
fn a_view_whose_classes_are_named_constants_is_read() {
    // `@hozo/ui`'s Alert, as #983 left it.
    let source = "import { View } from '@hozo/core'
const neutral = 'px-4 text-sm text-gray-700'
const accent = 'px-4 text-sm text-blue-700'
const danger = 'px-4 text-sm text-red-700'
export function HozoAlert({ children, tone = 'neutral', live = false, className }) {
  const own = tone === 'accent' ? accent : tone === 'danger' ? danger : neutral
  return (
    <View role={live === 'assertive' ? 'alert' : undefined} className={className ? `${own} ${className}` : own}>
      {children}
    </View>
  )
}
export { HozoAlert as Alert }";
    let summary = summarize_text_forwarding(source);
    let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Alert", "HozoAlert"]);
    let alert = &summary.components[0];
    assert_eq!(alert.props.len(), 1, "only `tone` decides the classes");
    assert_eq!(alert.props[0].values, ["accent", "danger", "neutral"]);
    let classes = |tone: &str| {
        alert
            .variants
            .iter()
            .find(|v| v.when == [tone])
            .map(|v| v.classes.as_str())
    };
    assert_eq!(classes("danger"), Some("px-4 text-sm text-red-700"));
    assert_eq!(classes("neutral"), Some("px-4 text-sm text-gray-700"));
    assert_eq!(alert.disabled_prop, None);
    assert!(!alert.host_states, "a View has no state to share");

    // And the same through `@hozo/patterns`' Alert, which it wears now.
    let worn = source
        .replace(
            "import { View } from '@hozo/core'",
            "import { Alert as AlertPattern } from '@hozo/patterns'",
        )
        .replace(
            "<View role={live === 'assertive' ? 'alert' : undefined}",
            "<AlertPattern live={live}",
        )
        .replace("</View>", "</AlertPattern>");
    assert_eq!(
        summarize_text_forwarding(&worn).components.len(),
        2,
        "{worn}"
    );
}

#[test]
fn a_pattern_handed_its_label_and_disabled_through_the_rest_is_read() {
    // `@hozo/ui`'s Checkbox: children and `disabled` both stay in the
    // rest, so the caller's `disabled` is the one that reaches the host.
    let source = "import { Checkbox as CheckboxPattern } from '@hozo/patterns'
const box = 'ps-9 text-sm text-gray-900 disabled:text-gray-400'
export function HozoCheckbox({ className, ...rest }) {
  return <CheckboxPattern {...rest} indicator={indicator} className={className ? `${box} ${className}` : box} />
}
export { HozoCheckbox as Checkbox }";
    let summary = summarize_text_forwarding(source);
    let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Checkbox", "HozoCheckbox"]);
    let checkbox = &summary.components[0];
    assert_eq!(
        checkbox.variants[0].classes,
        "ps-9 text-sm text-gray-900 disabled:text-gray-400"
    );
    assert_eq!(checkbox.disabled_prop.as_deref(), Some("disabled"));
    // The pattern's pressable shares its state with the caller's Text.
    assert!(checkbox.host_states);

    // A `disabled` the component takes for itself is not the caller's.
    let kept = source.replace("{ className, ...rest }", "{ className, disabled, ...rest }");
    assert_eq!(
        summarize_text_forwarding(&kept).components[0].disabled_prop,
        None
    );
}

#[test]
fn an_href_branch_with_the_same_classes_is_one_look() {
    // `@hozo/ui`'s Button since #656: the element changes with `href`,
    // the classes do not.
    let pair = |name: &str| {
        format!(
                "if (href !== undefined) return <Host {{...rest}} href={{href}} className={{cx({name}, className)}} />
    return <Host {{...rest}} className={{cx({name}, className)}} />"
            )
    };
    let source = format!(
        "import {{ cx }} from '@hozo/core'
import {{ Button as Host }} from '@hozo/primitives'
const LOUD = 'text-white'
const CALM = 'text-black'
export function B({{ tone = 'calm', className, href, ...rest }}) {{
  if (tone === 'loud') {{
    {}
  }}
  {}
}}",
        pair("LOUD"),
        pair("CALM")
    );
    let summary = summarize_text_forwarding(&source);
    let [component] = summary.components.as_slice() else {
        panic!("{summary:?}\n{source}")
    };
    let classes: Vec<_> = component
        .variants
        .iter()
        .map(|v| v.classes.as_str())
        .collect();
    assert_eq!(classes, ["text-black", "text-white"]);
    // Different classes per branch is not one look.
    let differs = source.replacen("cx(CALM, className)", "cx(LOUD, className)", 1);
    assert!(summarize_text_forwarding(&differs).components.is_empty());
}

#[test]
fn an_entry_records_its_reexports() {
    let source = "export { HozoButton as Button, HozoButton } from './button.tsx'";
    let summary = summarize_text_forwarding(source);
    let exported: Vec<_> = summary
        .reexports
        .iter()
        .map(|r| (r.exported.as_str(), r.imported.as_str()))
        .collect();
    assert_eq!(
        exported,
        [("Button", "HozoButton"), ("HozoButton", "HozoButton")]
    );
}
