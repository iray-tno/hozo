// What iOS actually announces, read the way a screen reader reads it.
//
// The Android job answers this with `uiautomator dump`, and every defect
// the native workflow has found came out of that tree rather than out of
// the boot: an invisible Separator, a Progress with no box, a Dialog with
// no testID, a Del that threw. iOS had no equivalent -- `ios-smoke.sh`
// says so in its own header -- so it could only say that the app drew
// something.
//
// XCUITest is the equivalent. It is Apple's own, it reads the accessibility
// hierarchy from outside the process the way `uiautomator` does, and it
// needs nothing installed. What it costs is a target in the Xcode project,
// which is why it took a decision rather than a commit.
//
// The tree is printed rather than attached. An `XCTAttachment` lands in an
// `.xcresult` bundle that then needs `xcresulttool` and a schema that
// changes between Xcode versions to read; the log is already collected,
// already an artifact, and the markers below make it machine-readable
// without any of that. `native-tree.ts` reads the result offline against
// what the compiler emitted for the same source, which is the whole point
// of collecting it.

import XCTest

/// One element, in the shape the offline comparison wants.
///
/// `identifier` is where React Native puts `testID` on iOS, and it is the
/// only thing in this tree that survives compilation recognisably -- the
/// same role `resource-id` plays in the Android dump, which is what lets
/// one file be joined to the other.
private struct Element: Encodable {
  let identifier: String
  let type: String
  let label: String
  let value: String
  let traits: [String]
  let frame: [Double]
  let enabled: Bool
}

final class AccessibilityTreeTests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testAccessibilityTree() throws {
    let app = XCUIApplication()
    app.launch()

    // The outermost thing on the acceptance screen, so it is present
    // whatever else failed to lay out. Thirty seconds because a cold
    // simulator on a shared runner is slow, and `waitForExistence` returns
    // as soon as it appears rather than sleeping for the whole budget.
    let list = app.descendants(matching: .any).matching(identifier: "smoke-list").firstMatch
    XCTAssertTrue(
      list.waitForExistence(timeout: 30),
      "smoke-list never appeared: the app started and rendered nothing recognisable"
    )

    dumpTree(app, named: "acceptance")

    // The census screen, reached the way the Android script reaches it.
    //
    // Existence is not enough to tap, which is what #471 was. The button is
    // on screen -- the acceptance dump puts it at y 555 with a height of 36,
    // well inside every simulator this runs on -- so it is never a scrolling
    // problem. What it is, five failures in one day say, is that the press
    // registers and the screen never follows: either the element is not yet
    // hittable when the tap is delivered, or the tap arrives while the JS
    // thread is still settling the acceptance screen, which starts a
    // PanResponder, a Skia canvas and an image load at once.
    //
    // Those two cannot be told apart from outside the process, so this closes
    // both: wait until the element reports itself hittable, then tap with a
    // bounded retry, checking for the destination between attempts. A retry is
    // honest here rather than a papered-over race -- the thing being tested is
    // the accessibility tree of the census screen, not how many taps it takes
    // to get there, and the Android script already reaches the same screen
    // with its own retry.
    let gallery = app.descendants(matching: .any).matching(identifier: "smoke-gallery").firstMatch
    XCTAssertTrue(gallery.waitForExistence(timeout: 10), "the Gallery button is not in the tree")

    let hittable = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "isHittable == true"),
      object: gallery
    )
    let becameHittable = XCTWaiter.wait(for: [hittable], timeout: 15) == .completed

    let heading = app.descendants(matching: .any).matching(identifier: "gallery-Heading").firstMatch
    var attempts = 0
    while attempts < 4 && !heading.exists {
      attempts += 1
      if gallery.isHittable {
        gallery.tap()
      } else {
        // Still not hittable after the wait above. Tapping the coordinate is
        // what is left, and it is what a person would do.
        gallery.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      }
      _ = heading.waitForExistence(timeout: 8)
    }

    XCTAssertTrue(
      heading.exists,
      """
      the gallery did not open: pressing smoke-gallery reached no census screen \
      after \(attempts) attempts (became hittable: \(becameHittable), \
      hittable now: \(gallery.isHittable), enabled: \(gallery.isEnabled))
      """
    )

    dumpTree(app, named: "gallery")
  }

  /// What iOS exposes for `@hozo/form`'s pickers.
  ///
  /// Its own test rather than more of the one above, because it needs the app
  /// back on the acceptance screen: the gallery replaces that screen, and the
  /// opener for this one is on it. A second `XCUIApplication().launch()` is
  /// what XCUITest gives for "start again", and a separate test method is how
  /// the failure of one is kept out of the other.
  ///
  /// Nothing here asserts what is announced. The Android job found real defects
  /// in exactly this area -- `TimePicker`'s fields were not accessibility
  /// elements at all until #559, and its value now arrives through
  /// `accessibilityValue.text` -- and whether the same wiring reaches VoiceOver
  /// is genuinely unknown: `adjustable` becomes `UIAccessibilityTraitAdjustable`
  /// here rather than a `SeekBar`, through a different path. So the tree is
  /// printed and the findings are printed, and turning any of them into an
  /// assertion on the first run that produces them would be approving them by
  /// assertion. Only arriving on the screen is required.
  func testPickersTree() throws {
    let app = XCUIApplication()
    app.launch()

    let list = app.descendants(matching: .any).matching(identifier: "smoke-list").firstMatch
    XCTAssertTrue(list.waitForExistence(timeout: 30), "smoke-list never appeared")

    // By label, because this opener deliberately has no `testID`:
    // `missingOnDevice` in `packages/tailwind-conformance` fails on one that is
    // absent from the checked-in dumps, so adding it is a fixture regeneration.
    // The Android scripts find the same button the same way.
    let opener = app.buttons["Show the pickers"]
    XCTAssertTrue(opener.waitForExistence(timeout: 10), "the Pickers button is not in the tree")

    // The hittable-then-retry shape the gallery needs, for its reasons: a press
    // can register while the JS thread is still settling the acceptance screen.
    let hittable = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "isHittable == true"),
      object: opener
    )
    _ = XCTWaiter.wait(for: [hittable], timeout: 15)

    let stepper = app.buttons["Increase Hour"]
    var attempts = 0
    while attempts < 4 && !stepper.exists {
      attempts += 1
      if opener.isHittable {
        opener.tap()
      } else {
        opener.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      }
      _ = stepper.waitForExistence(timeout: 8)
    }

    XCTAssertTrue(
      stepper.exists,
      "the pickers screen did not open after \(attempts) attempts"
    )

    dumpTree(app, named: "pickers", byLabel: true)
    reportPickers(app)
  }

  /// The four questions Android has answers to, asked of this platform.
  private func reportPickers(_ app: XCUIApplication) {
    let hour = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Hour"))
      .firstMatch
    let said = hour.exists ? (hour.value as? String ?? "") : ""

    // Whether the field is an element at all. On Android it was not until a
    // `View` was told `accessible`, and nothing but a device said so.
    print("HOZO_PICKERS hourFieldExists=\(hour.exists)")
    // Whether `accessibilityValue.text` reaches iOS's `accessibilityValue`.
    // "9:30" rather than "9" is the design: a reader moving the hour should
    // hear where that put the time.
    print("HOZO_PICKERS hourValue=\(said)")
    print("HOZO_PICKERS hourSaysWholeTime=\(said.contains("9:30"))")
    // Whether the period survived as a button.
    print("HOZO_PICKERS periodExists=\(app.buttons["AM or PM"].exists)")

    // And whether each trigger carries the value it is showing.
    //
    // This is what the first run of this test found missing and #608 fixed. iOS
    // collapses the children of an accessible `Pressable`, so with a name set
    // the formatted date was in no element at all and a VoiceOver user heard
    // "Departure, button" and nothing about which date it held. Three triggers
    // rather than two because `DatePicker` arrived on this screen last, having
    // been fixed alongside the others on the strength of sharing their shape.
    for name in ["Departure date", "Departure", "Dates of stay"] {
      let trigger = app.buttons[name]
      let carried = trigger.exists ? (trigger.value as? String ?? "") : "(absent)"
      print("HOZO_PICKERS trigger[\(name)]=\(carried)")
    }
  }

  /// Every element the accessibility hierarchy exposes, as JSON between
  /// markers the workflow can cut on.
  /// - Parameter byLabel: key each element by its accessible name instead of
  ///   its `testID`. For a screen that has no `testID`s at all, which the
  ///   pickers screen deliberately does not -- `missingOnDevice` fails on one
  ///   absent from the checked-in fixtures, so adding them is a fixture
  ///   regeneration and a device run of its own. Keeping this a parameter
  ///   rather than a second function keeps `acceptance` and `gallery` producing
  ///   exactly the bytes `ios-tree.test.ts` compares against.
  private func dumpTree(_ app: XCUIApplication, named name: String, byLabel: Bool = false) {
    var elements: [Element] = []
    for element in app.descendants(matching: .any).allElementsBoundByIndex {
      // Only what the source named. A simulator screen is full of elements
      // that belong to no source -- the status bar, the window, UIKit's own
      // scaffolding -- and reporting them as unmatched would make the
      // comparison mostly noise. The Android reader drops Android's
      // furniture for the same reason.
      let identifier = byLabel ? element.label : element.identifier
      if identifier.isEmpty { continue }
      let frame = element.frame
      elements.append(
        Element(
          identifier: identifier,
          type: describe(element.elementType),
          label: element.label,
          value: element.value as? String ?? "",
          traits: [],
          frame: [frame.origin.x, frame.origin.y, frame.size.width, frame.size.height],
          enabled: element.isEnabled
        )
      )
    }

    let data = (try? JSONEncoder().encode(elements)) ?? Data()
    print("HOZO_TREE_BEGIN \(name)")
    print(String(data: data, encoding: .utf8) ?? "[]")
    print("HOZO_TREE_END \(name)")
  }

  /// `XCUIElement.ElementType` by name.
  ///
  /// The closest iOS has to the Android dump's `class` attribute, and it is
  /// what says whether a role survived: a compiled `<Button>` that arrives
  /// as `.other` rather than `.button` announces itself as nothing, which
  /// is exactly the class of defect this exists to find. Spelled out rather
  /// than printed as a number because the raw values are an enum that Apple
  /// may extend, and a number in an artifact is a number nobody can read.
  private func describe(_ type: XCUIElement.ElementType) -> String {
    switch type {
    case .any: return "any"
    case .other: return "other"
    case .application: return "application"
    case .window: return "window"
    case .button: return "button"
    case .image: return "image"
    case .staticText: return "staticText"
    case .textField: return "textField"
    case .secureTextField: return "secureTextField"
    case .link: return "link"
    case .scrollView: return "scrollView"
    case .collectionView: return "collectionView"
    case .table: return "table"
    case .cell: return "cell"
    case .switch: return "switch"
    case .slider: return "slider"
    case .progressIndicator: return "progressIndicator"
    case .activityIndicator: return "activityIndicator"
    case .alert: return "alert"
    case .sheet: return "sheet"
    case .dialog: return "dialog"
    case .navigationBar: return "navigationBar"
    case .tabBar: return "tabBar"
    case .toolbar: return "toolbar"
    case .textView: return "textView"
    case .searchField: return "searchField"
    case .checkBox: return "checkBox"
    case .radioButton: return "radioButton"
    case .menu: return "menu"
    case .menuItem: return "menuItem"
    case .group: return "group"
    default: return "type\(type.rawValue)"
    }
  }
}
