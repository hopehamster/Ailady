package com.sifstudio.girlai2.live2d;

import android.app.Activity;
import android.content.Context;
import android.opengl.GLSurfaceView;
import android.view.MotionEvent;
import android.view.SurfaceHolder;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class Live2DGLSurfaceView extends GLSurfaceView {
    private final GLRenderer renderer;
    private final AtomicBoolean isDisposed = new AtomicBoolean(false);
    private final AtomicBoolean isSurfaceReady = new AtomicBoolean(false);
    private final AtomicBoolean isPaused = new AtomicBoolean(false);
    private volatile String pendingModelJsonPath;
    private volatile String lastModelJsonPath;

    public Live2DGLSurfaceView(Context context) {
        super(context);

        Context appContext = context.getApplicationContext();
        JniBridgeJava.setContext(appContext != null ? appContext : context);

        if (context instanceof Activity) {
            JniBridgeJava.setActivityInstance((Activity) context);
        }

        setEGLContextClientVersion(2);
        setPreserveEGLContextOnPause(true);
        renderer = new GLRenderer(() -> {
            isSurfaceReady.set(true);
            final String pendingPath =
                (pendingModelJsonPath != null && !pendingModelJsonPath.isEmpty())
                    ? pendingModelJsonPath
                    : lastModelJsonPath;
            if (!isDisposed.get() && pendingPath != null && !pendingPath.isEmpty()) {
                pendingModelJsonPath = null;
                JniBridgeJava.nativeLoadModel(pendingPath);
            }
        });
        setRenderer(renderer);
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

        JniBridgeJava.nativeOnStart();
    }

    public void loadModel(String modelJsonPath) {
        if (isDisposed.get() || modelJsonPath == null || modelJsonPath.isEmpty()) {
            return;
        }
        lastModelJsonPath = modelJsonPath;
        pendingModelJsonPath = modelJsonPath;
        if (isPaused.get() || !isSurfaceReady.get()) {
            return;
        }
        queueEvent(() -> {
            if (isDisposed.get() || !isSurfaceReady.get()) {
                return;
            }
            final String path = pendingModelJsonPath;
            if (path == null || path.isEmpty()) {
                return;
            }
            pendingModelJsonPath = null;
            JniBridgeJava.nativeLoadModel(path);
        });
    }

    public void setExpression(String expressionName) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> JniBridgeJava.nativeSetExpression(expressionName));
    }

    public void setParameter(String parameterId, float value) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> JniBridgeJava.nativeSetParameter(parameterId, value));
    }

    public void setBackgroundColor(float r, float g, float b) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> JniBridgeJava.nativeSetBackgroundColor(r, g, b));
    }

    public void clearParameter(String parameterId) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> JniBridgeJava.nativeClearParameter(parameterId));
    }

    public void setParameters(Map<String, Float> parameters) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> {
            for (Map.Entry<String, Float> entry : parameters.entrySet()) {
                JniBridgeJava.nativeSetParameter(entry.getKey(), entry.getValue());
            }
        });
    }

    public void clearParameters(Iterable<String> parameterIds) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> {
            for (String id : parameterIds) {
                if (id != null && !id.isEmpty()) {
                    JniBridgeJava.nativeClearParameter(id);
                }
            }
        });
    }

    public void setViewTransform(float scale, float offsetX, float offsetY) {
        if (isDisposed.get()) {
            return;
        }
        queueEvent(() -> JniBridgeJava.nativeSetViewTransform(scale, offsetX, offsetY));
    }

    public boolean isSurfaceReadyForDraw() {
        return !isDisposed.get() && isSurfaceReady.get();
    }

    public boolean hasNativeModel() {
        if (isDisposed.get()) {
            return false;
        }
        return JniBridgeJava.nativeHasModel();
    }

    public long getRenderFrameAgeMs() {
        if (isDisposed.get()) {
            return -1L;
        }
        return JniBridgeJava.nativeGetRenderFrameAgeMs();
    }

    public void onFlutterPause() {
        if (isDisposed.get()) {
            return;
        }
        isPaused.set(true);
        if (lastModelJsonPath != null && !lastModelJsonPath.isEmpty()) {
            pendingModelJsonPath = lastModelJsonPath;
        }
        queueEvent(() -> {
            JniBridgeJava.nativeOnTouchesEnded(0.0f, 0.0f);
            JniBridgeJava.nativeOnPause();
        });
        onPause();
    }

    public void onFlutterResume() {
        if (isDisposed.get()) {
            return;
        }
        isPaused.set(false);
        onResume();
        queueEvent(() -> {
            if (isDisposed.get()) {
                return;
            }
            JniBridgeJava.nativeOnStart();
            // Some resume paths keep the surface/context and skip callback
            // ordering; only reload when the GL surface is truly ready.
            final String pendingPath =
                (pendingModelJsonPath != null && !pendingModelJsonPath.isEmpty())
                    ? pendingModelJsonPath
                    : lastModelJsonPath;
            if (isSurfaceReady.get() && pendingPath != null && !pendingPath.isEmpty()) {
                pendingModelJsonPath = null;
                JniBridgeJava.nativeLoadModel(pendingPath);
            }
        });
    }

    public void onFlutterDispose() {
        if (!isDisposed.compareAndSet(false, true)) {
            return;
        }
        isSurfaceReady.set(false);
        pendingModelJsonPath = null;
        lastModelJsonPath = null;
        onPause();
        // Flutter can fully dispose and recreate the PlatformView across app
        // switches. Keeping the old native renderer/model state alive leaves
        // the next surface bound to stale resources and results in a blank
        // avatar after relaunch. Treat disposal as a true native stop so the
        // next PlatformView starts from a clean delegate/model state.
        JniBridgeJava.nativeOnStop();
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        isSurfaceReady.set(false);
        super.surfaceDestroyed(holder);
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
