import 'dart:convert';

/// A single parsed server-sent event from the streaming endpoint.
///
/// The backend (`generateResponseStream`) emits frames of the form:
///   event: sentence
///   data: {"index":0,"text":"..."}
///
/// with frames separated by a blank line (`\n\n`). Event types are:
///   - `sentence` : a guarded sentence ({index, text})
///   - `replace`  : safety swap — replace the whole reply ({text})
///   - `done`     : stream complete ({blocked, sentenceCount})
///   - `error`    : stream failed ({message})
class SseEvent {
  final String event;
  final Map<String, dynamic> data;

  const SseEvent(this.event, this.data);

  String get text => data['text'] as String? ?? '';

  @override
  String toString() => 'SseEvent($event, $data)';
}

/// Incremental SSE frame parser. Feed raw text chunks as they arrive from the
/// streamed HTTP response; get back any complete events. Buffers partial frames
/// across chunk boundaries (a frame can be split mid-way by the transport), so
/// it is safe to call [push] with arbitrary chunking.
class SseParser {
  final StringBuffer _buffer = StringBuffer();

  /// Feed a raw text chunk; returns the complete events it completed.
  List<SseEvent> push(String chunk) {
    if (chunk.isEmpty) return const [];
    _buffer.write(chunk);
    final text = _buffer.toString();

    final events = <SseEvent>[];
    var start = 0;
    var idx = text.indexOf('\n\n', start);
    while (idx != -1) {
      final frame = text.substring(start, idx);
      final event = _parseFrame(frame);
      if (event != null) events.add(event);
      start = idx + 2;
      idx = text.indexOf('\n\n', start);
    }

    // Retain the unterminated remainder for the next chunk.
    _buffer
      ..clear()
      ..write(text.substring(start));
    return events;
  }

  /// Parse any remaining buffered frame at end-of-stream (some servers omit the
  /// final blank line). Returns null if nothing complete remains.
  SseEvent? flush() {
    final remainder = _buffer.toString();
    _buffer.clear();
    if (remainder.trim().isEmpty) return null;
    return _parseFrame(remainder);
  }

  SseEvent? _parseFrame(String frame) {
    String? event;
    String? data;
    for (final line in frame.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data = line.substring(5).trim();
      }
    }
    if (event == null || event.isEmpty || data == null) return null;
    try {
      final decoded = jsonDecode(data);
      return SseEvent(
        event,
        decoded is Map<String, dynamic> ? decoded : <String, dynamic>{'value': decoded},
      );
    } catch (_) {
      // Non-JSON data — surface raw so the consumer can decide.
      return SseEvent(event, <String, dynamic>{'raw': data});
    }
  }
}
