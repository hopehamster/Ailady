import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'sse_parser.dart';

/// Transform a raw byte stream (from the streamed HTTP response body) into
/// parsed [SseEvent]s. Pure + testable — independent of dio, auth, and Firebase.
Stream<SseEvent> parseSseByteStream(Stream<List<int>> byteStream) async* {
  final parser = SseParser();
  await for (final chunk in byteStream) {
    final text = utf8.decode(chunk, allowMalformed: true);
    for (final event in parser.push(text)) {
      yield event;
    }
  }
  final tail = parser.flush();
  if (tail != null) {
    yield tail;
  }
}

/// Client for the `generateResponseStream` SSE endpoint (Phase 3.2). Streams the
/// response sentence-by-sentence so the UI can render progressively and start
/// TTS on the first sentence. Runs PARALLEL to the existing non-streaming
/// callable — callers fall back to `FirebaseService.generateResponse` when the
/// endpoint is disabled (503), unauthorized, or the transport fails.
class StreamingChatService {
  StreamingChatService({Dio? dio, FirebaseAuth? auth})
      : _dio = dio ?? Dio(),
        _auth = auth ?? FirebaseAuth.instance;

  final Dio _dio;
  final FirebaseAuth _auth;

  /// Functions-emulator host from --dart-define (physical-device path, same
  /// define emulator_config.dart uses). Empty = production.
  static const String _functionsEmulatorHost =
      String.fromEnvironment('FIREBASE_FUNCTIONS_EMULATOR_HOST');

  /// Cloud Functions HTTP URL for the streaming endpoint (us-central1).
  /// Routes to the local functions emulator when the emulator define is set.
  String endpointUrl() {
    final projectId = Firebase.app().options.projectId;
    if (_functionsEmulatorHost.isNotEmpty) {
      return 'http://$_functionsEmulatorHost/$projectId/us-central1/generateResponseStream';
    }
    return 'https://us-central1-$projectId.cloudfunctions.net/generateResponseStream';
  }

  /// Stream the response for [message] as SSE events. Throws [StateError] if the
  /// user is not authenticated, [StreamingUnavailable] if the endpoint is
  /// disabled / non-2xx (so the caller can fall back to the callable), and
  /// rethrows transport errors (DioException) for the same fallback path.
  Stream<SseEvent> streamResponse(String message) async* {
    final token = await _auth.currentUser?.getIdToken();
    if (token == null) {
      throw StateError('StreamingChatService: not authenticated');
    }

    final response = await _dio.post<ResponseBody>(
      endpointUrl(),
      data: {'message': message},
      options: Options(
        responseType: ResponseType.stream,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        // Read the status ourselves so a 503 (streaming_disabled) / 401 / 429
        // becomes a clean fallback signal instead of a thrown error.
        validateStatus: (status) => status != null && status < 500,
      ),
    );

    final status = response.statusCode ?? 0;
    if (status != 200) {
      throw StreamingUnavailable(status);
    }

    final body = response.data;
    if (body == null) {
      return;
    }
    yield* parseSseByteStream(body.stream);
  }
}

/// Raised when the streaming endpoint is not usable for this request (disabled,
/// unauthorized, rate-limited). The caller should fall back to the callable.
class StreamingUnavailable implements Exception {
  final int statusCode;
  const StreamingUnavailable(this.statusCode);

  @override
  String toString() => 'StreamingUnavailable(status: $statusCode)';
}
