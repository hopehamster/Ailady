const test = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareSpeechTextForTts,
} = require('../lib/services/voiceService.js');
const {
  buildTruthKernelForRuntimeContext,
  buildCapabilityOverviewResponseFromKernel,
} = require('../lib/services/truthKernelService.js');

test('prepareSpeechTextForTts normalizes dates and awkward punctuation', () => {
  const prepared = prepareSpeechTextForTts(
    'Okay!!! My interview is April 3rd, 2026 & dinner is 4/10/2026…',
  );

  assert.match(prepared, /Okay!!/);
  assert.match(prepared, /April third, twenty twenty-six/);
  assert.match(prepared, /April tenth, twenty twenty-six/);
  assert.doesNotMatch(prepared, /&/);
});

test('truth kernel treats location awareness setting as enabled without fresh snapshot', () => {
  const kernel = buildTruthKernelForRuntimeContext(
    { displayName: 'Mike', locationAwarenessEnabled: true },
    null,
    undefined,
    { locationAwarenessEnabled: true },
  );

  assert.equal(kernel.locationAwareness.enabled.value, true);
  assert.equal(kernel.locationAwareness.freshSnapshotAvailable.value, false);
  assert.equal(kernel.locationAwareness.source.kind, 'settings');
});

test('capability overview mentions location awareness when setting is enabled', () => {
  const kernel = buildTruthKernelForRuntimeContext(
    { displayName: 'Mike', locationAwarenessEnabled: true },
    null,
    undefined,
    { locationAwarenessEnabled: true },
  );

  const response = buildCapabilityOverviewResponseFromKernel(
    'what features are active for me right now',
    kernel,
    null,
    {
      isCapabilityQuery: true,
      wantsComparison: false,
      wantsDemoPrompts: false,
      wantsLimits: false,
      focus: 'overview',
    },
    undefined,
  );

  assert.match(response, /Location awareness: Location awareness is on in Settings/i);
});
