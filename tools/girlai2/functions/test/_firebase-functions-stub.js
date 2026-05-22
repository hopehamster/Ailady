// Comprehensive firebase-functions stub for unit tests. Supports:
//  - functions.logger.{warn,info,error,debug,log}
//  - functions.https.HttpsError (throwable Error subclass with .code)

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'HttpsError';
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  logger: {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
    log: () => {},
  },
  https: {
    HttpsError,
  },
};
