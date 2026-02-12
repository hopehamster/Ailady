package com.sifstudio.girlai2.live2d;

import android.app.Activity;
import android.content.Context;
import android.opengl.GLSurfaceView;
import android.view.MotionEvent;

import java.util.Map;

public final class Live2DGLSurfaceView extends GLSurfaceView {
    private final GLRenderer renderer;

    public Live2DGLSurfaceView(Context context) {
        super(context);

        Context appContext = context.getApplicationContext();
        JniBridgeJava.setContext(appContext != null ? appContext : context);

        if (context instanceof Activity) {
            JniBridgeJava.setActivityInstance((Activity) context);
        }

        setEGLContextClientVersion(2);
        renderer = new GLRenderer();
        setRenderer(renderer);
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

        JniBridgeJava.nativeOnStart();
    }

    public void loadModel(String modelJsonPath) {
        queueEvent(() -> JniBridgeJava.nativeLoadModel(modelJsonPath));
    }

    public void setExpression(String expressionName) {
        queueEvent(() -> JniBridgeJava.nativeSetExpression(expressionName));
    }

    public void setParameter(String parameterId, float value) {
        queueEvent(() -> JniBridgeJava.nativeSetParameter(parameterId, value));
    }

    public void setParameters(Map<String, Float> parameters) {
        queueEvent(() -> {
            for (Map.Entry<String, Float> entry : parameters.entrySet()) {
                JniBridgeJava.nativeSetParameter(entry.getKey(), entry.getValue());
            }
        });
    }

    public void onFlutterPause() {
        onPause();
        queueEvent(JniBridgeJava::nativeOnPause);
    }

    public void onFlutterResume() {
        onResume();
    }

    public void onFlutterDispose() {
        queueEvent(() -> {
            JniBridgeJava.nativeOnStop();
            JniBridgeJava.nativeOnDestroy();
        });
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        final float pointX = event.getX();
        final float pointY = event.getY();

        queueEvent(() -> {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                JniBridgeJava.nativeOnTouchesBegan(pointX, pointY);
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                JniBridgeJava.nativeOnTouchesEnded(pointX, pointY);
            } else if (action == MotionEvent.ACTION_MOVE) {
                JniBridgeJava.nativeOnTouchesMoved(pointX, pointY);
            }
        });

        return true;
    }
}