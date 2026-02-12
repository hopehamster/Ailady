import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../live2d/live2d_bridge.dart';

class AvatarCreatorScreen extends StatefulWidget {
  const AvatarCreatorScreen({super.key});

  @override
  State<AvatarCreatorScreen> createState() => _AvatarCreatorScreenState();
}

class _AvatarCreatorScreenState extends State<AvatarCreatorScreen> {
  static const String _modelPath =
      'flutter_assets/assets/live2d/bezzly/bezzly.model3.json';

  final Live2DBridge _bridge = Live2DBridge.instance;
  bool _loaded = false;
  double _mouthOpen = 0.0;

  Future<void> _loadModel() async {
    await _bridge.loadModel(_modelPath);
    await _bridge.setExpression('Neutral');

    if (!mounted) return;
    setState(() {
      _loaded = true;
    });
  }

  Future<void> _setExpression(String value) async {
    await _bridge.setExpression(value);
  }

  Future<void> _setMouthOpen(double value) async {
    setState(() {
      _mouthOpen = value;
    });

    await _bridge.setParameters(<String, double>{
      'ParamMouthOpenY': _mouthOpen,
      'ParamMouthForm': 0.0,
      'MouthPucker': 0.0,
      'MouthFunnel': 0.0,
      'MouthX': 0.0,
    });
  }

  @override
  Widget build(BuildContext context) {
    if (defaultTargetPlatform != TargetPlatform.android) {
      return const Scaffold(
        body: Center(
          child: Text('Live2D rig preview is currently Android-only.'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Live2D Rig Preview')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: Stack(
              children: <Widget>[
                AndroidView(
                  viewType: 'girlai2/live2d_view',
                  onPlatformViewCreated: (_) => _loadModel(),
                  hitTestBehavior: PlatformViewHitTestBehavior.opaque,
                ),
                if (!_loaded)
                  Container(
                    color: Colors.black.withValues(alpha: 0.5),
                    alignment: Alignment.center,
                    child: const CircularProgressIndicator(color: Colors.pink),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: <Widget>[
              OutlinedButton(
                onPressed: () => _setExpression('Happy'),
                child: const Text('Happy'),
              ),
              OutlinedButton(
                onPressed: () => _setExpression('Sad'),
                child: const Text('Sad'),
              ),
              OutlinedButton(
                onPressed: () => _setExpression('Angry'),
                child: const Text('Angry'),
              ),
              OutlinedButton(
                onPressed: () => _setExpression('Neutral'),
                child: const Text('Neutral'),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: <Widget>[
                const Text('Mouth'),
                Expanded(
                  child: Slider(
                    value: _mouthOpen,
                    min: 0.0,
                    max: 1.0,
                    onChanged: _setMouthOpen,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
