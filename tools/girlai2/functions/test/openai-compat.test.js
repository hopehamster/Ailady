const test = require('node:test');
const assert = require('node:assert/strict');

const {
  openAiCompatBaseUrl,
  openAiCompatApiKey,
  resolveOpenAiModel,
  resolveStreamingProvider,
} = require('../lib/services/openaiCompat.js');

const KEYS = ['OPENAI_BASE_URL', 'OPENAI_COMPAT_API_KEY', 'OPENAI_API_KEY', 'OPENAI_DEFAULT_MODEL', 'STREAMING_PROVIDER'];

function withEnv(vars, fn) {
  const prev = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test('defaults: no env -> SDK default base URL, hardcoded models, anthropic streaming', () => {
  withEnv({}, () => {
    assert.equal(openAiCompatBaseUrl(), undefined);
    assert.equal(resolveOpenAiModel('gpt-4o'), 'gpt-4o');
    assert.equal(resolveOpenAiModel('gpt-4o-mini'), 'gpt-4o-mini');
    assert.equal(resolveStreamingProvider(), 'anthropic');
  });
});

test('OPENAI_BASE_URL points the client at the compat provider', () => {
  withEnv({ OPENAI_BASE_URL: 'https://api.deepseek.com' }, () => {
    assert.equal(openAiCompatBaseUrl(), 'https://api.deepseek.com');
  });
});

test('key: override wins, falls back to OPENAI_API_KEY, then empty', () => {
  withEnv({ OPENAI_API_KEY: 'real-openai', OPENAI_COMPAT_API_KEY: 'compat' }, () => {
    assert.equal(openAiCompatApiKey(), 'compat');
  });
  withEnv({ OPENAI_API_KEY: 'real-openai' }, () => {
    assert.equal(openAiCompatApiKey(), 'real-openai');
  });
  withEnv({}, () => {
    assert.equal(openAiCompatApiKey(), '');
  });
});

test('OPENAI_DEFAULT_MODEL overrides every hardcoded chat model', () => {
  withEnv({ OPENAI_DEFAULT_MODEL: 'deepseek-chat' }, () => {
    assert.equal(resolveOpenAiModel('gpt-4o'), 'deepseek-chat');
    assert.equal(resolveOpenAiModel('gpt-4o-mini'), 'deepseek-chat');
  });
});

test('STREAMING_PROVIDER=openai selects the compat streaming path', () => {
  withEnv({ STREAMING_PROVIDER: 'openai' }, () => {
    assert.equal(resolveStreamingProvider(), 'openai');
  });
  withEnv({ STREAMING_PROVIDER: 'OPENAI' }, () => {
    assert.equal(resolveStreamingProvider(), 'openai');
  });
  withEnv({ STREAMING_PROVIDER: 'garbage' }, () => {
    assert.equal(resolveStreamingProvider(), 'anthropic'); // safe default
  });
});

test('whitespace-only env values are treated as unset', () => {
  withEnv({ OPENAI_BASE_URL: '  ', OPENAI_DEFAULT_MODEL: ' ' }, () => {
    assert.equal(openAiCompatBaseUrl(), undefined);
    assert.equal(resolveOpenAiModel('gpt-4o'), 'gpt-4o');
  });
});
