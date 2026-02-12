package com.sifstudio.girlai2.live2d;

import android.app.Activity;
import android.content.Context;

import java.io.IOException;
import java.io.InputStream;

public final class JniBridgeJava {
    private static final String LIBRARY_NAME = "girlai2_live2d";

    private static Activity activityInstance;
    private static Context context;

    static {
        System.loadLibrary(LIBRARY_NAME);
    }

    private JniBridgeJava() {}

    // Native lifecycle
    public static native void nativeOnStart();
    public static native void nativeOnPause();
    public static native void nativeOnStop();
    public static native void nativeOnDestroy();

    // Native renderer callbacks
    public static native void nativeOnSurfaceCreated();
    public static native void nativeOnSurfaceChanged(int width, int height);
    public static native void nativeOnDrawFrame();

    // Native touch callbacks
    public static native void nativeOnTouchesBegan(float pointX, float pointY);
    public static native void nativeOnTouchesEnded(float pointX, float pointY);
    public static native void nativeOnTouchesMoved(float pointX, float pointY);

    // Live2D model controls
    public static native void nativeLoadModel(String modelJsonPath);
    public static native void nativeSetExpression(String expressionName);
    public static native void nativeSetParameter(String parameterId, float value);

    public static void setContext(Context ctx) {
        context = ctx;
    }

    public static void setActivityInstance(Activity activity) {
        activityInstance = activity;
    }

    public static byte[] LoadFile(String filePath) {
        if (context == null) {
            return null;
        }

        InputStream fileData = null;
        try {
            fileData = context.getAssets().open(filePath);
            int fileSize = fileData.available();
            byte[] fileBuffer = new byte[fileSize];
            fileData.read(fileBuffer, 0, fileSize);
            return fileBuffer;
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        } finally {
            if (fileData != null) {
                try {
                    fileData.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    public static void MoveTaskToBack() {
        if (activityInstance != null) {
            activityInstance.moveTaskToBack(true);
        }
    }
}