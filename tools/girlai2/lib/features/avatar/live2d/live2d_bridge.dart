import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class Live2DBridge {
  Live2DBridge._();

  static final Live2DBridge instance = Live2DBridge._();

  static const MethodChannel _channel = MethodChannel('girlai2/live2d_bridge');

  bool get isSupported => defaultTargetPlatform == TargetPlatform.android;

  Future<void> loadModel(String modelJsonPath) async {
    await _invoke('loadModel', <String, dynamic>{
      'modelJsonPath': modelJsonPath,
    });
  }

  Future<void> setExpression(String name) async {
    await _invoke('setExpression', <String, dynamic>{'name': name});
  }

  Future<void> setParameter(String id, double value) async {
    await _invoke('setParameter', <String, dynamic>{
      'id': id,
      'value': value,
    });
  }

  Future<void> setParameters(Map<String, double> parameters) async {
    await _invoke('setParameters', <String, dynamic>{'parameters': parameters});
  }

  Future<void> pause() async {
    await _invoke('pause');
  }

  Future<void> resume() async {
    await _invoke('resume');
  }

  Future<void> dispose() async {
    await _invoke('dispose');
  }

  Future<void> _invoke(String method, [Map<String, dynamic>? arguments]) async {
    if (!isSupported) return;

    try {
      await _channel.invokeMethod<void>(method, arguments);
    } on MissingPluginException {
      // Ignore in unsupported/test environments.
    } on PlatformException catch (e) {
      if (kDebugMode) {
        debugPrint(
            'Live2D bridge call failed ($method): ${e.code} ${e.message}');
      }
    }
  }
}
