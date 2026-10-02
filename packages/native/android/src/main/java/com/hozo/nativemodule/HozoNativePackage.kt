package com.hozo.nativemodule

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * What autolinking finds.
 *
 * React Native's CLI reads the sources in this directory looking for a class
 * extending or implementing something named `*ReactPackage`, and registers it with
 * the application without anybody editing `MainApplication`. That is the whole of
 * the installation step, and the reason this file has to exist even though it adds
 * no behaviour.
 *
 * `BaseReactPackage` rather than the older `ReactPackage`: it is the one that
 * provides modules lazily, by name, which is what the New Architecture's module
 * registry asks for.
 */
class HozoNativePackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == HozoAccessibilityModule.NAME) HozoAccessibilityModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            HozoAccessibilityModule.NAME to
                ReactModuleInfo(
                    HozoAccessibilityModule.NAME,
                    HozoAccessibilityModule.NAME,
                    // Overriding an existing module: no. There is nothing to
                    // override, and a package that claimed the right to would be a
                    // package that can break an application quietly.
                    false,
                    // Eager initialisation: no. The module is wanted when a dialog
                    // closes, which is late enough to construct it then and soon
                    // enough that nobody notices.
                    false,
                    // A C++ module: no. Kotlin only, which is the whole shape of
                    // this package.
                    false,
                    // A TurboModule: yes. Generated spec, codegen'd registration,
                    // and the reason there is no legacy fallback in here.
                    true,
                )
        )
    }
}
