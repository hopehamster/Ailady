// Minimal firebase-functions stub for unit tests that import modules
// which `require('firebase-functions')` only for logger access.
module.exports = {
  logger: {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
    log: () => {},
  },
};
