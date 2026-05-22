// Comprehensive firebase-admin stub for unit tests. Supports:
//  - collection(c).doc(d).collection(sub).add(data)  (personaHistory + auditLog)
//  - doc('path/to/doc').get()                        (appCheckGate config read)
//  - collection(c).doc(d).set(data, {merge})         (appCheckGate failure counters)
//  - FieldValue.increment / serverTimestamp
//
// Tests can mutate shared state via the helpers at the bottom.

const writes = [];
let appCheckMode = 'shadow';

function record(collectionName, docId, subcollectionName, data) {
  writes.push({
    collection: collectionName,
    scope: docId,
    subcollection: subcollectionName,
    data,
  });
}

function makeDoc(collectionName, docId) {
  return {
    collection: (sub) => ({
      add: async (data) => {
        record(collectionName, docId, sub, data);
        return { id: 'evt_test' };
      },
    }),
    get: async () => {
      if (collectionName === 'app_config' && docId === 'app_check_mode') {
        return { exists: true, data: () => ({ mode: appCheckMode }) };
      }
      return { exists: false, data: () => ({}) };
    },
    set: async (_data, _opts) => undefined,
  };
}

module.exports = {
  firestore: () => ({
    collection: (c) => ({
      doc: (d) => makeDoc(c, d),
      add: async (data) => {
        record(c, null, null, data);
        return { id: 'evt_test' };
      },
    }),
    doc: (path) => {
      const parts = String(path).split('/');
      return makeDoc(parts[0] ?? '', parts[1] ?? '');
    },
  }),
};

module.exports.firestore.FieldValue = {
  serverTimestamp: () => '<<server-ts>>',
  increment: (n) => ({ __inc: n }),
};

// Returns the most recent write across all calls. Existing tests use this.
module.exports.__getLastWrite = () => writes[writes.length - 1] ?? null;

// Returns the most recent write whose collection matches. Useful when more
// than one write fires per operation (e.g. personaHistory writes BOTH to
// persona_history/.../events AND to audit_log).
module.exports.__findLastWriteTo = (collectionName) => {
  for (let i = writes.length - 1; i >= 0; i--) {
    if (writes[i].collection === collectionName) return writes[i];
  }
  return null;
};

module.exports.__getAllWrites = () => writes.slice();
module.exports.__resetWrites = () => {
  writes.length = 0;
};

module.exports.__setAppCheckMode = (m) => {
  appCheckMode = m;
};
