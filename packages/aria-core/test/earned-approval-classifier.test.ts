import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyApprovalEvent } from '../src/services/memoryService';

test('E1 classifier: generic approval is cheap', () => {
  assert.deepEqual(classifyApprovalEvent('you are perfect, exactly what I wanted'), {
    approvalEarned: false,
    approvalCheap: true,
  });
});

test('E1 classifier: approval for honesty/pushback is earned', () => {
  assert.deepEqual(classifyApprovalEvent('I appreciate that you pushed back honestly'), {
    approvalEarned: true,
    approvalCheap: false,
  });
});

test('E1 classifier: ordinary engagement is not an approval event', () => {
  assert.deepEqual(classifyApprovalEvent('what do you think about this?'), {
    approvalEarned: false,
    approvalCheap: false,
  });
});
