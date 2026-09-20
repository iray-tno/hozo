package dev.hozo.nativemodules

import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Moves accessibility focus for real, rather than announcing that it moved.
 *
 * `AccessibilityInfo.sendAccessibilityEvent` reaches
 * `View.sendAccessibilityEvent(TYPE_VIEW_FOCUSED)`, which tells the
 * accessibility framework a view took focus. `ACTION_ACCESSIBILITY_FOCUS` asks
 * it to put focus there. The difference is why #484 could not be fixed from
 * JavaScript at any delay.
 */
@ReactModule(name = HozoAccessibilityModule.NAME)
class HozoAccessibilityModule(reactContext: ReactApplicationContext) :
    NativeHozoAccessibilitySpec(reactContext) {

  override fun getName(): String = NAME

  override fun moveAccessibilityFocus(reactTag: Double) {
    val context = reactApplicationContext
    val tag = reactTag.toInt()
    // Views belong to the UI thread, and a TurboModule method does not arrive
    // on it.
    UiThreadUtil.runOnUiThread {
      // One manager, not two. `getUIManagerForReactTag` ignores the tag and
      // returns the Fabric one; `ViewUtil.getUIManagerType` is deprecated and
      // always answers FABRIC, because Fabric is the only UIManager in 0.87.
      val view = UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag)
      // Gone with its screen. A dialog can close because the whole route is
      // unmounting, and the view it would restore to went with it.
      if (view == null) {
        // TEMPORARY, NOT FOR MERGING. Investigation for #484.
        //
        // The JS side returns `true` the moment it calls this method -- the
        // work is on the UI thread and this returns nothing -- so "the module
        // ran" and "the action was performed on a real view" are the same
        // observation from JavaScript. They are not the same thing, and the
        // device probe could not tell them apart.
        Log.w(TAG, "probe: no view for tag $tag")
        return@runOnUiThread
      }
      val performed =
          view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
      // The return value the first version of this discarded. `false` means the
      // framework declined the action, which is a different finding from the
      // action being taken and TalkBack staying where it was.
      Log.w(TAG, "probe: action on tag $tag returned $performed")
    }
  }

  companion object {
    const val NAME = "HozoAccessibility"
    private const val TAG = "HozoA11y"
  }
}
