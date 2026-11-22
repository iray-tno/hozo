use super::candidates::builtin_candidate_module;
use super::*;

#[test]
fn invalid_builtin_candidate_facts_do_not_publish_an_authored_module() {
    // The scanner never emits an empty identity. Deliberately violate
    // the invariant rather than equating a valid unassessed token with
    // a failed context build.
    let error = builtin_candidate_module(&[String::new()], &Theme::default()).unwrap_err();
    assert!(error
        .reason
        .contains("invalid or repeated Tailwind candidate identity"));
}
