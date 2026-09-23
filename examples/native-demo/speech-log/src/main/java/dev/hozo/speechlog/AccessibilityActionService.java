package dev.hozo.speechlog;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/** Drives one semantic action after the real TalkBack traversal has completed. */
public final class AccessibilityActionService extends AccessibilityService {
    private static final String TAG = "HozoA11yDriver";
    private static final String TARGET_LABEL = "January revenue";

    private boolean activated;

    @Override
    protected void onServiceConnected() {
        Log.i(TAG, "ready");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (activated || event.getEventType() != AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED)
            return;
        AccessibilityNodeInfo target = event.getSource();
        if (target == null || !TARGET_LABEL.contentEquals(target.getContentDescription())) return;
        Log.i(
                TAG,
                "target "
                        + TARGET_LABEL
                        + " clickable="
                        + target.isClickable()
                        + " actions="
                        + target.getActionList());
        boolean accepted = target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        activated = accepted;
        Log.i(TAG, "activated " + TARGET_LABEL + " returned " + accepted);
    }

    @Override
    public void onInterrupt() {}

}
