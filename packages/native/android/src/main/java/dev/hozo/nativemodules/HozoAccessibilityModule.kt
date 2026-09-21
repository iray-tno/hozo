package dev.hozo.nativemodules

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
      // Resolved through the tag's own UI manager: Fabric and the legacy one
      // keep separate registries, and asking the wrong one returns nothing.
      val view = UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag)
      // Gone with its screen. A dialog can close because the whole route is
      // unmounting, and the view it would restore to went with it.
      if (view == null) return@runOnUiThread
      view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS, null)
      view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
    }
  }

  companion object {
    const val NAME = "HozoAccessibility"
  }
}
