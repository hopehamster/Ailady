package com.sifstudio.girlai2.live2d

import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class Live2DMethodChannelHandler : MethodChannel.MethodCallHandler {
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method == "isSurfaceReady") {
            result.success(Live2DViewRegistry.currentView?.isSurfaceReadyForDraw() == true)
            return
        }

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

            "clearParameter" -> {
                val id = call.argument<String>("id")
                if (id.isNullOrBlank()) {
                    result.error("INVALID_ARGS", "id is required", null)
                    return
                }
                surfaceView.clearParameter(id)
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

            "setBackgroundColor" -> {
                val r = call.argument<Double>("r")
                val g = call.argument<Double>("g")
                val b = call.argument<Double>("b")
                if (r == null || g == null || b == null) {
                    result.error("INVALID_ARGS", "r, g, b are required", null)
                    return
                }
                surfaceView.setBackgroundColor(r.toFloat(), g.toFloat(), b.toFloat())
                result.success(null)
            }

            "clearParameters" -> {
                val ids = call.argument<List<String>>("ids") ?: emptyList()
                val validIds = ids.filter { it.isNotBlank() }
                surfaceView.clearParameters(validIds)
                result.success(null)
            }

            "setViewTransform" -> {
                val scale = call.argument<Double>("scale") ?: 1.0
                val offsetX = call.argument<Double>("offsetX") ?: 0.0
                val offsetY = call.argument<Double>("offsetY") ?: 0.0
                surfaceView.setViewTransform(
                    scale.toFloat(),
                    offsetX.toFloat(),
                    offsetY.toFloat()
                )
                result.success(null)
            }

            "isSurfaceReady" -> {
                result.success(surfaceView.isSurfaceReadyForDraw())
            }

            "hasNativeModel" -> {
                result.success(surfaceView.hasNativeModel())
            }
            "getRenderFrameAgeMs" -> {
                result.success(surfaceView.getRenderFrameAgeMs())
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
