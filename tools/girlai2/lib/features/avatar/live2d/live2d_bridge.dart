import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class Live2DBridge {
  Live2DBridge._();

  static final Live2DBridge instance = Live2DBridge._();

  static const MethodChannel _channel = MethodChannel('girlai2/live2d_bridge');

  bool get isSupported => defaultTargetPlatform == TargetPlatform.android;

  Future<bool> loadModel(String modelJsonPath) async {
    return _invoke('loadModel', <String, dynamic>{
      'modelJsonPath': modelJsonPath,
    });
  }

  Future<bool> setExpression(String name) async {
    return _invoke('setExpression', <String, dynamic>{'name': name});
  }

  Future<bool> setParameter(String id, double value) async {
    return _invoke('setParameter', <String, dynamic>{
      'id': id,
      'value': value,
    });
  }

  Future<bool> setParameters(Map<String, double> parameters) async {
    return _invoke(
        'setParameters', <String, dynamic>{'parameters': parameters});
  }

  Future<bool> clearParameter(String id) async {
    return _invoke('clearParameter', <String, dynamic>{'id': id});
  }

  Future<bool> clearParameters(List<String> ids) async {
    return _invoke('clearParameters', <String, dynamic>{'ids': ids});
  }

  Future<bool> setViewTransform({
    required double scale,
    required double offsetX,
    required double offsetY,
  }) async {
    return _invoke('setViewTransform', <String, dynamic>{
      'scale': scale,
      'offsetX': offsetX,
      'offsetY': offsetY,
    });
  }

  Future<bool> pause() async {
    return _invoke('pause');
  }

  Future<bool> resume() async {
    return _invoke('resume');
  }

  Future<bool> dispose() async {
    return _invoke('dispose');
  }

  Future<bool> isSurfaceReady() async {
    return _invoke('isSurfaceReady');
  }

  Future<bool> hasNativeModel() async {
    return _invoke('hasNativeModel');
  }

  Future<int> getRenderFrameAgeMs() async {
    if (!isSupported) return -1;
    try {
      final result = await _channel.invokeMethod<dynamic>('getRenderFrameAgeMs');
      if (result is int) {
        return result;
      }
      if (result is num) {
        return result.toInt();
      }
      return -1;
    } on MissingPluginException {
      return -1;
    } on PlatformException catch (e) {
      if (kDebugMode) {
        debugPrint(
            'Live2D bridge call failed (getRenderFrameAgeMs): ${e.code} ${e.message}');
      }
      return -1;
    }
  }

  Future<bool> _invoke(String method, [Map<String, dynamic>? arguments]) async {
    if (!isSupported) return false;

    try {
      final result = await _channel.invokeMethod<dynamic>(method, arguments);
      if (result is bool) {
        return result;
      }
      return true;
    } on MissingPluginException {
      // Ignore in unsupported/test environments.
      return false;
    } on PlatformException catch (e) {
      if (kDebugMode) {
        debugPrint(
            'Live2D bridge call failed ($method): ${e.code} ${e.message}');
      }
      return false;
    }
  }
}
