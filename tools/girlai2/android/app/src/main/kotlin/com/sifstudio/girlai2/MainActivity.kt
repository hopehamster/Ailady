package com.sifstudio.girlai2

import com.sifstudio.girlai2.live2d.Live2DMethodChannelHandler
import com.sifstudio.girlai2.live2d.Live2DPlatformViewFactory
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        flutterEngine
            .platformViewsController
            .registry
            .registerViewFactory("girlai2/live2d_view", Live2DPlatformViewFactory())

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "girlai2/live2d_bridge"
        ).setMethodCallHandler(Live2DMethodChannelHandler())
    }
}
