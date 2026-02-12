package com.sifstudio.girlai2.live2d

import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class Live2DMethodChannelHandler : MethodChannel.MethodCallHandler {
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val surfaceView = Live2DViewRegistry.currentView
        if (surfaceView == null) {
            result.error("NO_LIVE2D_VIEW", "Live2D view is not available", null)
            return
        }

        when (call.method) {
            "loadModel" -> {
                val modelJsonPath = call.argument<String>("modelJsonPath")
                if (modelJsonPath.isNullOrBlank()) {
                    result.error("INVALID_ARGS", "modelJsonPath is required", null)
                    return
                }
                surfaceView.loadModel(modelJsonPath)
                result.success(null)
            }

            "setExpression" -> {
                val name = call.argument<String>("name") ?: "Neutral"
                surfaceView.setExpression(name)
                result.success(null)
            }

            "setParameter" -> {
                val id = call.argument<String>("id")
                val value = call.argument<Double>("value")
                if (id.isNullOrBlank() || value == null) {
                    result.error("INVALID_ARGS", "id and value are required", null)
                    return
                }
                surfaceView.setParameter(id, value.toFloat())
                result.success(null)
            }

            "setParameters" -> {
                val argMap = call.argument<Map<String, Any?>>("parameters") ?: emptyMap()
                val values = LinkedHashMap<String, Float>()
                for ((key, value) in argMap) {
                    if (key.isNotBlank() && value is Number) {
                        values[key] = value.toFloat()
                    }
                }
                surfaceView.setParameters(values)
                result.success(null)
            }

            "pause" -> {
                surfaceView.onFlutterPause()
                result.success(null)
            }

            "resume" -> {
                surfaceView.onFlutterResume()
                result.success(null)
            }

            "dispose" -> {
                surfaceView.onFlutterDispose()
                result.success(null)
            }

            else -> result.notImplemented()
        }
    }
}