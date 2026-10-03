package com.hozonativedemo

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // EXPERIMENT (#714), not for merging: log every Fabric mount instruction
    // (CREATE [tag] - component, INSERT, DELETE, ...) so the tag React Native
    // reports as missing can be named. Forced after loadReactNative, which has
    // just set the stable flags, and before the first surface reads this one.
    ReactNativeFeatureFlags.dangerouslyForceOverride(
      object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
        override fun enableFabricLogs(): Boolean = true
      },
    )
  }
}
