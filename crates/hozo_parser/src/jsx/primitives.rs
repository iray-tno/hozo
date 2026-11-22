//! Which JSX names are Hozo primitives.

use hozo_ir::{Primitive, SvgElement};

/// Whether a name is one the compiler lowers when it appears as a tag.
pub fn is_primitive_name(name: &str) -> bool {
    // One table decides both import recognition and lowering. Keeping a
    // second list here once left Modal, RefreshControl, Separator and other
    // supported components dependent on the unsafe bare-name fallback.
    primitive_for_name(name).is_some()
}

/// Whether `name` exports a component whose Web lowering is a
/// `@hozo/rn-compat` stand-in. See `ReactNativeCompat`.
pub(crate) fn is_react_native_compat_name(name: &str) -> bool {
    primitive_for_name(name).is_some_and(Primitive::is_react_native_compat)
}

pub(super) fn primitive_for_name(name: &str) -> Option<Primitive> {
    match name {
        "View" => Some(Primitive::View),
        "Text" => Some(Primitive::Text),
        "Paragraph" => Some(Primitive::Paragraph),
        "Heading" => Some(Primitive::Heading),
        "Section" => Some(Primitive::Section),
        "Article" => Some(Primitive::Article),
        "Nav" => Some(Primitive::Nav),
        "List" => Some(Primitive::List),
        "ListItem" => Some(Primitive::ListItem),
        "ActivityIndicator" => Some(Primitive::ActivityIndicator),
        "Pressable" => Some(Primitive::Pressable),
        "TouchableOpacity" => Some(Primitive::TouchableOpacity),
        "TouchableWithoutFeedback" => Some(Primitive::TouchableWithoutFeedback),
        "TextInput" => Some(Primitive::TextInput),
        "Dialog" => Some(Primitive::Dialog),
        "Button" => Some(Primitive::Button),
        "Link" => Some(Primitive::Link),
        "Image" => Some(Primitive::Image),
        "ScrollView" => Some(Primitive::ScrollView),
        "FlatList" => Some(Primitive::FlatList),
        "RefreshControl" => Some(Primitive::RefreshControl),
        "Modal" => Some(Primitive::Modal),
        // The root, which is both the element and the namespace object.
        "Svg" => Some(Primitive::Svg(SvgElement::Root)),
        "Main" => Some(Primitive::Main),
        "Header" => Some(Primitive::Header),
        "Footer" => Some(Primitive::Footer),
        "Aside" => Some(Primitive::Aside),
        "Search" => Some(Primitive::Search),
        "Figure" => Some(Primitive::Figure),
        "Figcaption" => Some(Primitive::Figcaption),
        "Time" => Some(Primitive::Time),
        "Address" => Some(Primitive::Address),
        "Fieldset" => Some(Primitive::Fieldset),
        "Legend" => Some(Primitive::Legend),
        "Details" => Some(Primitive::Details),
        "Summary" => Some(Primitive::Summary),
        "TermList" => Some(Primitive::TermList),
        "Term" => Some(Primitive::Term),
        "Description" => Some(Primitive::Description),
        "Separator" => Some(Primitive::Separator),
        "Progress" => Some(Primitive::Progress),
        "Meter" => Some(Primitive::Meter),
        "Badge" => Some(Primitive::Badge),
        "Chip" => Some(Primitive::Chip),
        "Avatar" => Some(Primitive::Avatar),
        "Pagination" => Some(Primitive::Pagination),
        "Stepper" => Some(Primitive::Stepper),
        "OtpInput" => Some(Primitive::OtpInput),
        "CommandPalette" => Some(Primitive::CommandPalette),
        "Combobox" => Some(Primitive::Combobox),
        "Listbox" => Some(Primitive::Listbox),
        "Menu" => Some(Primitive::Menu),
        "ColorPicker" => Some(Primitive::ColorPicker),
        "Table" => Some(Primitive::Table),
        "TableCaption" => Some(Primitive::TableCaption),
        "TableHeader" => Some(Primitive::TableHeader),
        "TableBody" => Some(Primitive::TableBody),
        "TableFooter" => Some(Primitive::TableFooter),
        "TableRow" => Some(Primitive::TableRow),
        "TableHead" => Some(Primitive::TableHead),
        "TableCell" => Some(Primitive::TableCell),
        "Skeleton" => Some(Primitive::Skeleton),
        "Strong" => Some(Primitive::Strong),
        "Emphasis" => Some(Primitive::Emphasis),
        "Underline" => Some(Primitive::Underline),
        "Strikethrough" => Some(Primitive::Strikethrough),
        "Sub" => Some(Primitive::Sub),
        "Sup" => Some(Primitive::Sup),
        "Code" => Some(Primitive::Code),
        "Preformatted" => Some(Primitive::Preformatted),
        "Small" => Some(Primitive::Small),
        "Mark" => Some(Primitive::Mark),
        "NoBreak" => Some(Primitive::NoBreak),
        "Ruby" => Some(Primitive::Ruby),
        "RubyText" => Some(Primitive::RubyText),
        _ => None,
    }
}
