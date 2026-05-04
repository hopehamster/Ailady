import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Add the Google services Gradle plugin
    id("com.google.gms.google-services")
    // Firebase Crashlytics
    id("com.google.firebase.crashlytics")
}

val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localPropertiesFile.inputStream().use { load(it) }
    }
}

// Release signing — keystore + passwords come from android/key.properties
// (which is gitignored). If the file is missing we fall back to the debug
// keystore so `flutter run --release` works locally without signing material.
val keyProperties = Properties().apply {
    val keyPropertiesFile = rootProject.file("key.properties")
    if (keyPropertiesFile.exists()) {
        keyPropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseSigning = keyProperties.containsKey("storeFile") &&
    keyProperties.containsKey("storePassword") &&
    keyProperties.containsKey("keyAlias") &&
    keyProperties.containsKey("keyPassword")

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

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Use real release signing when key.properties is present; otherwise
            // fall back to debug keystore so `flutter run --release` still works
            // for local iteration. Store-listing builds MUST have key.properties.
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
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
