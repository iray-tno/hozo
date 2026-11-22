//! The project-wide candidate classes and the Native module that resolves them.

use napi_derive::napi;

use super::prepared_module::PreparedTailwindContext;
use super::tailwind_order;
use super::theme::{to_theme, JsTheme};

/// An approximate ordering seed, not a runtime CSS candidate set or a
/// replacement for checking the actual module's parsed units.
#[napi]
pub fn scan_tailwind_order_candidates(source: String) -> Vec<String> {
    hozo_parser::scan_tailwind_order_candidates(&source)
}

/// The build-side half of proposal §7's third tier.
///
/// A `className` the compiler couldn't read is passed through to runtime,
/// so something has to have already emitted CSS for whatever string it
/// evaluates to. That set can't come from the file being transformed --
/// a class written in one module can be produced by an expression in
/// another -- so it's accumulated across the whole project here, and the
/// stylesheet is generated once from the union.
///
/// Lives on the JS side rather than inside `compile()` because the
/// bundler owns the project walk and knows about file deletions; this
/// only owns the scanning, the staleness rule, and persistence.
#[napi]
pub struct CandidateCache {
    inner: hozo_cache::CandidateCache,
    /// The modules the project lowers primitives from, so the scan
    /// subtracts what the compile will actually read. See
    /// `hozo_parser::scan_class_candidates_with`.
    sources: Option<Vec<String>>,
}

// The ordinary runtime map and context-free static compilation must choose
// the same authority. Descriptors are build-time data; only compact ranks
// enter the generated resolver. Unassessed classes remain whole-input
// barriers in that resolver, not invented rank-zero writes.
pub(super) fn builtin_candidate_module(
    names: &[String],
    theme: &hozo_ir::Theme,
) -> napi::Result<String> {
    hozo_parser::builtin_tailwind_context(names.iter().map(String::as_str))
        .and_then(|context| hozo_native::render_final_candidate_module_plan(names, theme, &context))
        .map(|plan| plan.code)
        .map_err(|reason| {
            napi::Error::from_reason(format!("Cannot order Native candidates: {reason}"))
        })
}

#[napi]
impl CandidateCache {
    /// Opens the cache at `path` (JSON on disk today -- the format is the
    /// Rust side's business). Pass no path for a build that has nothing to
    /// resume from, e.g. a one-shot production build.
    #[napi(constructor)]
    pub fn new(path: Option<String>, sources: Option<Vec<String>>) -> Self {
        let store: Box<dyn hozo_cache::SnapshotStore> = match path {
            Some(path) => Box::new(hozo_cache::JsonFileStore::new(path)),
            None => Box::new(hozo_cache::MemoryStore::new()),
        };
        let mut inner = hozo_cache::CandidateCache::open(store);
        inner.set_source_policy(serde_json::json!(&sources).to_string());
        CandidateCache { inner, sources }
    }

    /// Whether `path` was already scanned at this exact `modifiedMs`, i.e.
    /// the caller can skip reading and scanning it entirely.
    #[napi]
    pub fn is_current(&self, path: String, modified_ms: f64) -> bool {
        self.inner.is_current(&path, modified_ms as u64)
    }

    /// Scans `source` and records the result under `path`.
    ///
    /// Returns whether the candidate set changed -- saving a file without
    /// touching its classes returns `false`, so callers can leave the
    /// generated stylesheet alone instead of rewriting identical bytes and
    /// triggering a pointless HMR round.
    #[napi]
    pub fn scan_file(&mut self, path: String, source: String, modified_ms: f64) -> bool {
        let class_names = hozo_parser::scan_class_candidates_with(&source, self.sources.as_deref());
        let uses_tailwind = hozo_parser::source_uses_tailwind(&source);
        self.inner
            .record(&path, modified_ms as u64, class_names, uses_tailwind)
    }

    /// An opaque, versioned contribution for a bundler to keep with its
    /// transform metadata. Mtime is deliberately excluded: source revision
    /// validation belongs to the adapter, and a timestamp-only save must not
    /// turn equal worker observations into a conflict.
    #[napi]
    pub fn export_file(&self, path: String) -> Option<String> {
        self.inner.file_entry(&path).map(|entry| {
            serde_json::json!({
                "schema": 1,
                "scanVersion": hozo_cache::SNAPSHOT_VERSION,
                "sources": self.sources,
                "entry": {
                    "classNames": entry.class_names,
                    "usesTailwind": entry.uses_tailwind,
                },
            })
            .to_string()
        })
    }

    /// Restore only facts produced by the same scan contract. Validate all
    /// fields before changing the cache; this neither scans source nor claims
    /// the caller has validated the associated bundler/source revision.
    #[napi]
    pub fn import_file(
        &mut self,
        path: String,
        record: String,
        modified_ms: f64,
    ) -> napi::Result<bool> {
        let invalid = || napi::Error::from_reason("Invalid cached candidate contribution");
        let value: serde_json::Value = serde_json::from_str(&record).map_err(|_| invalid())?;
        if value.as_object().map(|fields| fields.len()) != Some(4)
            || value.get("sources").is_none()
            || value["schema"].as_u64() != Some(1)
            || value["scanVersion"].as_u64() != Some(hozo_cache::SNAPSHOT_VERSION as u64)
        {
            return Err(invalid());
        }
        if value["sources"] != serde_json::json!(self.sources) {
            return Err(napi::Error::from_reason(
                "Cached candidate contribution has incompatible source policy",
            ));
        }
        let entry = &value["entry"];
        if entry.as_object().map(|fields| fields.len()) != Some(2) {
            return Err(invalid());
        }
        let mut names: Vec<String> =
            serde_json::from_value(entry["classNames"].clone()).map_err(|_| invalid())?;
        let uses_tailwind = entry["usesTailwind"].as_bool().ok_or_else(invalid)?;
        names.sort();
        names.dedup();
        Ok(self
            .inner
            .record(&path, modified_ms as u64, names, uses_tailwind))
    }

    /// Drops a deleted file's contribution. Returns whether it was tracked.
    #[napi]
    pub fn forget(&mut self, path: String) -> bool {
        self.inner.forget(&path)
    }

    /// Reconciles the persistent cache with one complete project walk and
    /// returns how many files disappeared since the previous walk.
    #[napi]
    pub fn retain_files(&mut self, paths: Vec<String>) -> u32 {
        self.inner.retain_files(paths) as u32
    }

    /// The stylesheet for every candidate in the project, written under the
    /// classes' real Tailwind names so a runtime-produced string matches by
    /// itself -- no runtime resolution code involved.
    ///
    /// `order` is the same candidates in the order Tailwind would write
    /// them, from `@hozo/tailwind`'s `loadClassOrder`.
    ///
    /// Every utility here is a single class, so they all carry the same
    /// specificity and the order they are written in *is* the cascade.
    /// `union` is alphabetical -- for byte-identical output between builds,
    /// which is still wanted -- and alphabetical puts `2xl:` first and
    /// `sm:` after `md:`, so `hidden sm:block md:hidden` stayed visible
    /// past `md`.
    ///
    /// Taken as a hint rather than as the list to render: what is rendered
    /// is still this cache's own union, sorted by position in `order`, so
    /// a caller that passes a stale or partial list gets a complete
    /// stylesheet in a worse order rather than a missing rule. Without a
    /// project hint, use the compiler's built-in Tailwind descriptors.
    #[napi]
    pub fn render_css(&self, theme: Option<JsTheme>, order: Option<Vec<String>>) -> String {
        let mut names = self.inner.union();
        let theme = to_theme(theme);
        if let Some(order) = order {
            let rank: std::collections::HashMap<&str, usize> = order
                .iter()
                .enumerate()
                .map(|(index, name)| (name.as_str(), index))
                .collect();
            // Unranked names keep their alphabetical order among themselves
            // and go last, which is where Tailwind puts what it does not
            // recognise.
            names.sort_by_key(|name| rank.get(name.as_str()).copied().unwrap_or(usize::MAX));
            hozo_web::render_candidate_stylesheet(&names, &theme)
        } else {
            hozo_web::render_builtin_candidate_stylesheet(&names, &theme)
        }
    }

    /// Every candidate this cache holds, so a caller can ask Tailwind what
    /// order to write them in and hand it back to `render_css`.
    #[napi]
    pub fn candidates(&self) -> Vec<String> {
        self.inner.union()
    }

    /// The React Native counterpart of `renderCss`: a JS module holding a
    /// class-name -> style-object map plus a resolver bound to it.
    ///
    /// A separate call rather than a second field on one result because a
    /// project builds for one platform at a time -- generating the module
    /// a Web build will never import would be wasted work.
    #[napi]
    pub fn render_native_module(&self, theme: Option<JsTheme>) -> napi::Result<String> {
        builtin_candidate_module(&self.inner.union(), &to_theme(theme))
    }

    /// One context selects static and candidate output policy together.
    /// Reporting-only contexts retain their own sidecar facts, over the same
    /// built-in output as a context-free call (as static compilation does).
    #[napi]
    pub fn render_native_module_plan(
        &self,
        context: &PreparedTailwindContext,
        theme: Option<JsTheme>,
    ) -> napi::Result<tailwind_order::NativeCandidatePlan> {
        let render = if context.ordered {
            hozo_native::render_final_candidate_module_plan
        } else {
            hozo_native::render_candidate_module_plan
        };
        let names = self.inner.union();
        let theme = to_theme(theme);
        let mut plan =
            render(&names, &theme, &context.context).map_err(napi::Error::from_reason)?;
        if !context.ordered && !context.authored {
            plan.code = builtin_candidate_module(&names, &theme)?;
        }
        plan.fingerprint = context.fingerprint();
        Ok(plan.into())
    }

    /// Whether any scanned file names a Tailwind utility.
    ///
    /// Not the same as the candidate stylesheet being non-empty: that
    /// holds only what the compiler *couldn't* read, and an ordinary
    /// project's Tailwind is all static `className` the compiler reads
    /// exactly. See `source_uses_tailwind`.
    #[napi(getter)]
    pub fn uses_tailwind(&self) -> bool {
        self.inner.uses_tailwind()
    }

    /// Number of files tracked.
    #[napi(getter)]
    pub fn size(&self) -> u32 {
        self.inner.len() as u32
    }

    /// Writes the cache back, if anything changed since it was opened.
    #[napi]
    pub fn persist(&mut self) -> napi::Result<()> {
        self.inner
            .persist()
            .map_err(|err| napi::Error::from_reason(err.to_string()))
    }
}
