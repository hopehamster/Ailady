package com.sifstudio.girlai2.live2d

import android.content.Context
import android.view.View
import io.flutter.plugin.platform.PlatformView

class Live2DPlatformView(context: Context) : PlatformView {
    private val surfaceView = Live2DGLSurfaceView(context)

    init {
        Live2DViewRegistry.currentView = surfaceView
    }

    override fun getView(): View = surfaceView

    override fun dispose() {
        surfaceView.onFlutterDispose()
        if (Live2DViewRegistry.currentView === surfaceView) {
            Live2DViewRegistry.currentView = null
        }
    }
}