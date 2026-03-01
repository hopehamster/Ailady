import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Add the Google services Gradle plugin
    id("com.google.gms.google-services")
}

val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localPropertiesFile.inputStream().use { load(it) }
    }
}

val defaultWindowsSdkDir = "C:/Users/Owner/Documents/CubismSdkForNative-5-r.4.1"
val configuredSdkDir = localProperties.getProperty("live2d.sdk.dir")
val envSdkDir = System.getenv("LIVE2D_SDK_ROOT")
val live2dSdkRoot = when {
    !configuredSdkDir.isNullOrBlank() -> configuredSdkDir
    !envSdkDir.isNullOrBlank() -> envSdkDir
    file(defaultWindowsSdkDir).exists() -> defaultWindowsSdkDir
    else -> null
} ?: throw GradleException(
    "Live2D SDK path not found. Set live2d.sdk.dir in android/local.properties or LIVE2D_SDK_ROOT env var."
)

android {
    namespace = "com.sifstudio.girlai2"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Application ID matching google-services.json
        applicationId = "com.sifstudio.girlai2"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // Required by Genies SDK (minSdk 31 / Android 12)
        minSdk = 31
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        externalNativeBuild {
            cmake {
                abiFilters += listOf("arm64-v8a", "x86_64", "x86")
                arguments += listOf(
                    "-DLIVE2D_SDK_ROOT=$live2dSdkRoot"
                )
            }
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
            // Keep JNI bridge methods intact to avoid runtime method lookup failures.
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs(
                "$live2dSdkRoot/Samples/OpenGL/Demo/Resources",
                "$live2dSdkRoot/Samples/OpenGL/Shaders/StandardES",
                "$live2dSdkRoot/Framework/src/Rendering/OpenGL/Shaders/StandardES"
            )
        }
    }
}

flutter {
    source = "../.."
}
