package com.sifstudio.girlai2.live2d;

import android.opengl.GLSurfaceView;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public final class GLRenderer implements GLSurfaceView.Renderer {
    private final Runnable onSurfaceCreatedCallback;

    public GLRenderer(Runnable onSurfaceCreatedCallback) {
        this.onSurfaceCreatedCallback = onSurfaceCreatedCallback;
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        JniBridgeJava.nativeOnSurfaceCreated();
        if (onSurfaceCreatedCallback != null) {
            onSurfaceCreatedCallback.run();
        }
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        JniBridgeJava.nativeOnSurfaceChanged(width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        JniBridgeJava.nativeOnDrawFrame();
    }
}
