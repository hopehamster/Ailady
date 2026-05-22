
    let lastWrite = null;
    module.exports = {
      firestore: () => ({
        collection: (c) => ({
          doc: (d) => ({
            collection: (sub) => ({
              add: async (data) => {
                lastWrite = { collection: c, scope: d, subcollection: sub, data };
                return { id: 'evt_test' };
              },
            }),
          }),
        }),
      }),
    };
    module.exports.firestore.FieldValue = {
      serverTimestamp: () => '<<server-ts>>',
    };
    module.exports.__getLastWrite = () => lastWrite;
  