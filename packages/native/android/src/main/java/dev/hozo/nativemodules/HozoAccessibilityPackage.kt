package dev.hozo.nativemodules

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/** Registers the one module. Autolinking finds this class by convention. */
class HozoAccessibilityPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == HozoAccessibilityModule.NAME) HozoAccessibilityModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        HozoAccessibilityModule.NAME to
            ReactModuleInfo(
                HozoAccessibilityModule.NAME,
                HozoAccessibilityModule::class.java.name,
                false,
                false,
                false,
                true,
            ))
  }

  // Nothing to draw. This package moves focus; it renders no views.
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()
}
