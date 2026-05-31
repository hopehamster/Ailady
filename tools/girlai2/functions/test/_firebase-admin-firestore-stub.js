module.exports = {
  FieldValue: {
    serverTimestamp: () => '<<server-ts>>',
    increment: (n) => ({ __inc: n }),
  },
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
  },
};
