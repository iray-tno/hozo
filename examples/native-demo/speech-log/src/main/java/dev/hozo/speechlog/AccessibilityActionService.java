package dev.hozo.speechlog;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/** Drives one semantic action after the real TalkBack traversal has completed. */
public final class AccessibilityActionService extends AccessibilityService {
    private static final String TAG = "HozoA11yDriver";
    private static AccessibilityActionService connected;

    @Override
    protected void onServiceConnected() {
        connected = this;
        Log.i(TAG, "ready");
    }

    static void activate(String label) {
        AccessibilityActionService service = connected;
        if (service == null) {
            Log.i(TAG, "activation requested before the service connected");
            return;
        }
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        AccessibilityNodeInfo target = findByLabel(root, label);
        if (target != null) {
            Log.i(
                    TAG,
                    "target "
                            + label
                            + " clickable="
                            + target.isClickable()
                            + " actions="
                            + target.getActionList());
        }
        boolean activated =
                target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        Log.i(TAG, "activated " + label + " returned " + activated);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (connected == this) connected = null;
        super.onDestroy();
    }

    private static AccessibilityNodeInfo findByLabel(
            AccessibilityNodeInfo node, String wanted) {
        if (node == null || wanted == null) return null;
        CharSequence label = node.getContentDescription();
        if (wanted.contentEquals(label)) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = findByLabel(node.getChild(index), wanted);
            if (found != null) return found;
        }
        return null;
    }
}
