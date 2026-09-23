package dev.hozo.speechlog;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/** Drives one semantic action after the real TalkBack traversal has completed. */
public final class AccessibilityActionService extends AccessibilityService {
    private static final String TAG = "HozoA11yDriver";
    private static final String ACTION_ACTIVATE = "dev.hozo.speechlog.ACTIVATE";

    private final BroadcastReceiver receiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String label = intent.getStringExtra("label");
                    AccessibilityNodeInfo root = getRootInActiveWindow();
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
                            target != null
                                    && target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.i(TAG, "activated " + label + " returned " + activated);
                }
            };

    @Override
    protected void onServiceConnected() {
        IntentFilter filter = new IntentFilter(ACTION_ACTIVATE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(receiver, filter);
        }
        Log.i(TAG, "ready");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        unregisterReceiver(receiver);
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
