package dev.hozo.speechlog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Explicit CI command endpoint for the bound accessibility action driver. */
public final class AccessibilityActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AccessibilityActionService.activate(intent.getStringExtra("label"));
    }
}
