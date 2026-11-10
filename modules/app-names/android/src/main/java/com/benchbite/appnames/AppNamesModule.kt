package com.benchbite.appnames

import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The names of the apps on the phone, by their package, for the apps that wrote to Health Connect.
class AppNamesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppNames")

    // The name the app shows on the phone, or null for one the phone does not have or show.
    Function("appName") { packageName: String ->
      val packages = appContext.reactContext?.packageManager ?: return@Function null
      try {
        packages.getApplicationLabel(packages.getApplicationInfo(packageName, 0)).toString()
      } catch (error: PackageManager.NameNotFoundException) {
        null
      }
    }
  }
}
