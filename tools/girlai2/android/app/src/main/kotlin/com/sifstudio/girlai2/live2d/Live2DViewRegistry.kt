package com.sifstudio.girlai2.live2d

object Live2DViewRegistry {
    @Volatile
    var currentView: Live2DGLSurfaceView? = null
}