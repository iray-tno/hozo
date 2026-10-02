package com.hozo.nativemodule

import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Asking TalkBack for focus, and finding out whether it listened.
 *
 * The asking is what React Native already does: Fabric's
 * `SurfaceMountingManager.sendAccessibilityEvent` is
 * `view.sendAccessibilityEvent(TYPE_VIEW_FOCUSED)` on the UI thread, and so is the
 * first line here. TalkBack treats that event as the app saying where focus
 * should go -- `InputFocusInterpreter` names it -- and syncs its own focus to it,
 * *unless* the windows are still settling after the dialog closed, in which case
 * it drops the move and, a moment later, restores focus from its own history
 * instead (#484 has the logs).
 *
 * The finding out is the part JavaScript cannot do. React Native passes nothing
 * about accessibility focus to JavaScript, so a dropped request and an honoured
 * one look the same from there. Here they do not: every view that takes
 * accessibility focus sends `TYPE_VIEW_ACCESSIBILITY_FOCUSED` up through its
 * parents, and a delegate on the window's root sees it.
 *
 * What this never does is put focus somewhere itself. #491's first version
 * performed `ACTION_ACCESSIBILITY_FOCUS`, and measured worse than sending nothing:
 * focus placed behind TalkBack's back is focus TalkBack then corrects.
 *
 * Android only. iOS's `setAccessibilityFocus` already lands every time, so there
 * is no `ios/` directory and the JavaScript export is `undefined` there.
 */
@ReactModule(name = HozoAccessibilityModule.NAME)
class HozoAccessibilityModule(context: ReactApplicationContext) :
    NativeHozoAccessibilitySpec(context) {

    override fun getName(): String = NAME

    override fun restoreAccessibilityFocus(viewTag: Double, watchMs: Double, promise: Promise) {
        val tag = viewTag.toInt()
        UiThreadUtil.runOnUiThread {
            val view = resolve(tag)
            if (view == null) {
                Log.w(NAME, "no view behind react tag $tag; accessibility focus was not requested")
                promise.resolve("missing")
                return@runOnUiThread
            }
            val root = view.rootView
            // Only a root with no delegate of its own is watched. Below API 29
            // there is no asking whether it has one, and replacing a delegate
            // someone else installed would break whatever it was for -- so
            // those cases get the request alone, which is today's behaviour.
            val watchable =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && root.accessibilityDelegate == null
            view.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED)
            if (!watchable) {
                promise.resolve("unwatched")
                return@runOnUiThread
            }
            FocusWatch(view, root, watchMs.toLong(), promise).start()
        }
    }

    /**
     * The view, or null for a tag that no longer has one.
     *
     * A dialog's opener can be unmounted between the dismissal and this call.
     * `resolveView` throws rather than returning null for an unknown tag, so the
     * absence has to be caught to be treated as absence.
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

/**
 * One request's watch: the first place accessibility focus lands in the window,
 * and one more request if that was not the opener.
 *
 * Only the first landing is acted on, and only one request is ever repeated.
 * After a dialog closes, the first landing is TalkBack's -- either our request
 * honoured, or its own restore from history. Anything after that may be the user
 * moving on, and a watch that pulled focus back from a user would be worse than
 * the defect it fixes.
 */
@RequiresApi(Build.VERSION_CODES.Q)
private class FocusWatch(
    private val opener: View,
    private val root: View,
    private val watchMs: Long,
    private val promise: Promise,
) : View.AccessibilityDelegate() {
    private var resent = false
    private var done = false
    private val timeout = Runnable { finish(if (resent) "resent" else "quiet") }

    fun start() {
        root.accessibilityDelegate = this
        root.postDelayed(timeout, watchMs)
    }

    override fun onRequestSendAccessibilityEvent(
        host: ViewGroup,
        child: View,
        event: AccessibilityEvent,
    ): Boolean {
        // Posted rather than handled here: this runs inside the call that is
        // moving focus -- TalkBack's own action, arriving over binder -- and a
        // second request sent from the middle of it would be sent before the
        // first has finished landing.
        if (!done && event.eventType == AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED) {
            root.post { landed() }
        }
        return super.onRequestSendAccessibilityEvent(host, child, event)
    }

    private fun landed() {
        if (done) return
        if (opener.isAccessibilityFocused) {
            finish(if (resent) "resent-landed" else "landed")
            return
        }
        if (resent) {
            finish("resent")
            return
        }
        // By now the windows have settled -- TalkBack only restores once they
        // have -- so this request is one it honours.
        resent = true
        opener.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED)
    }

    private fun finish(outcome: String) {
        if (done) return
        done = true
        root.removeCallbacks(timeout)
        if (root.accessibilityDelegate === this) root.accessibilityDelegate = null
        promise.resolve(outcome)
    }
}
