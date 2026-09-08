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
    let gallery = app.descendants(matching: .any).matching(identifier: "smoke-gallery").firstMatch
    XCTAssertTrue(gallery.waitForExistence(timeout: 10), "the Gallery button is not in the tree")
    gallery.tap()

    let heading = app.descendants(matching: .any).matching(identifier: "gallery-Heading").firstMatch
    XCTAssertTrue(
      heading.waitForExistence(timeout: 20),
      "the gallery did not open: pressing smoke-gallery reached no census screen"
    )

    dumpTree(app, named: "gallery")
  }

  /// Every element the accessibility hierarchy exposes, as JSON between
  /// markers the workflow can cut on.
  private func dumpTree(_ app: XCUIApplication, named name: String) {
    var elements: [Element] = []
    for element in app.descendants(matching: .any).allElementsBoundByIndex {
      // Only what the source named. A simulator screen is full of elements
      // that belong to no source -- the status bar, the window, UIKit's own
      // scaffolding -- and reporting them as unmatched would make the
      // comparison mostly noise. The Android reader drops Android's
      // furniture for the same reason.
      let identifier = element.identifier
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
