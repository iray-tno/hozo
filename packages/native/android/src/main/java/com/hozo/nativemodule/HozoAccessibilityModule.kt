package com.hozo.nativemodule

import android.util.Log
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper

/**
 * The one line of native code this package exists for.
 *
 * `AccessibilityInfo.sendAccessibilityEvent(view, 'focus')` -- everything React
 * Native exposes to JavaScript -- reaches
 * `View.sendAccessibilityEvent(TYPE_VIEW_FOCUSED)`. That is an *event*: a
 * notification that something happened. The thing that moves accessibility focus
 * is the *action* `ACTION_ACCESSIBILITY_FOCUS`, and nothing under React Native's
 * `Libraries/` reaches it. #491 traced the whole path through the 0.87 sources on
 * the Fabric architecture before concluding that; this file is that conclusion.
 *
 * Android only. iOS's `setAccessibilityFocus` already performs the real thing, so
 * there is no `ios/` directory here and the JavaScript export is `undefined`
 * there.
 */
@ReactModule(name = HozoAccessibilityModule.NAME)
class HozoAccessibilityModule(context: ReactApplicationContext) :
    NativeHozoAccessibilitySpec(context) {

    override fun getName(): String = NAME

    /**
     * Resolving a view requires the UI thread, so the whole body is posted there
     * and the result comes back as a promise.
     *
     * What it reports is Android's answer to the request, not TalkBack's. False
     * means the view refused accessibility focus at that moment -- unmounted, or
     * not important for accessibility, or behind a window that still owns it. A
     * warning goes with it, because a refused accessibility action is something an
     * application developer can act on and nothing else would tell them.
     */
    override fun moveAccessibilityFocus(viewTag: Double, promise: Promise) {
        val tag = viewTag.toInt()
        UiThreadUtil.runOnUiThread {
            val view = resolve(tag)
            if (view == null) {
                Log.w(NAME, "no view behind react tag $tag; accessibility focus was not moved")
                promise.resolve(false)
                return@runOnUiThread
            }
            val moved =
                view.performAccessibilityAction(
                    AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS,
                    null,
                )
            if (!moved) {
                Log.w(NAME, "view for react tag $tag refused ACTION_ACCESSIBILITY_FOCUS")
            }
            promise.resolve(moved)
        }
    }

    /**
     * The view, or null for a tag that no longer has one.
     *
     * A dialog's opener can be unmounted between the dismissal and this call --
     * the JavaScript side already checks, and by the time this runs a frame has
     * passed. `resolveView` throws rather than returning null for an unknown tag,
     * so the absence has to be caught to be treated as absence.
     */
    private fun resolve(tag: Int): View? =
        try {
            UIManagerHelper.getUIManagerForReactTag(reactApplicationContext, tag)?.resolveView(tag)
        } catch (error: Exception) {
            null
        }

    companion object {
        /**
         * Matches `TurboModuleRegistry.get('HozoAccessibility')` in
         * `src/NativeHozoAccessibility.ts`. The two are a pair with nothing checking
         * them against each other, so they are the one thing in this package worth
         * reading twice.
         */
        const val NAME = "HozoAccessibility"
    }
}
