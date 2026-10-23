import test from 'node:test';
import assert from 'node:assert/strict';
import { $, p, div } from 'funcui';
import { createEffect, createOwner, withOwner } from '../src/effect.js';
import { domTests, flush, settle } from './support/dom.js';

const env = domTests();

test('a thousand synchronous writes use one global flush across mounts', async () => {
  const state = $({ count: 0 });
  const other = env.document.createElement('div');

  env.document.body.append(other);

  let runs = 0;

  env.mount(() => {
    p(() => {
      runs++;

      return state.count;
    });
  });

  env.mount(() => {
    p(() => {
      runs++;

      return state.count;
    });
  }, other);

  const originalQueue = globalThis.queueMicrotask;
  let flushes = 0;

  globalThis.queueMicrotask = callback => {
    flushes++;

    originalQueue(callback);
  };

  try {
    for (let index = 0; index < 1000; index++) {
      state.count++;
    }

    assert.equal(state.count, 1000);
    assert.equal(env.root.textContent, '0');

    await Promise.resolve();

    assert.equal(flushes, 1);
    assert.equal(runs, 4);
    assert.equal(other.textContent, '1000');
  } finally {
    globalThis.queueMicrotask = originalQueue;
  }
});

test('an already executed effect is deferred to a subsequent microtask', async () => {
  const state = $({ first: 0, second: 0 });
  const observed = [];

  env.mount(() => {
    p(() => {
      observed.push(state.second);

      return state.second;
    });

    p(() => {
      if (state.first) {
        state.second = state.first;
      }

      return state.first;
    });
  });

  state.second = 2;
  state.first = 1;

  await Promise.resolve();

  assert.deepEqual(observed, [0, 2]);

  await settle();

  assert.deepEqual(observed, [0, 2, 1]);
  assert.equal(env.root.firstElementChild.textContent, '1');
});

test('new jobs during flush are inserted before deeper pending jobs', async () => {
  const state = $({ activate: 0, parent: 0, child: 0 });
  const owner = createOwner(null);
  const childOwner = createOwner(owner);
  const order = [];

  try {
    withOwner(owner, () => {
      createEffect(() => {
        if (state.activate) {
          order.push('first');
          state.parent = 1;
        }
      }).run();

      createEffect(() => {
        if (state.parent) {
          order.push('parent');
        }
      }).run();

      withOwner(childOwner, () => {
        createEffect(() => {
          if (state.child) {
            order.push('child');
          }
        }).run();
      });
    });

    state.activate = 1;
    state.child = 1;

    await flush();

    assert.deepEqual(order, ['first', 'parent', 'child']);
  } finally {
    owner.dispose();
  }
});

test('errors do not block newly scheduled effects or later batches', async () => {
  const state = $({ fail: false, value: 0 });

  env.mount(() => {
    p(() => {
      if (state.fail) {
        state.value = 2;

        throw new Error('Expected');
      }

      return 'ready';
    });

    p(() => state.value);
  });

  state.fail = true;
  await settle();

  assert.equal(env.errors.length, 1);
  assert.equal(env.root.lastElementChild.textContent, '2');

  state.value = 3;
  await flush();

  assert.equal(env.root.lastElementChild.textContent, '3');
});

test('effects initially created in a flush are not rerun in that same flush', async () => {
  const state = $({ show: false, value: 0, change: false });
  let childRuns = 0;

  env.mount(() => {
    div(() => {
      if (state.show) {
        p(() => {
          childRuns++;

          return state.value;
        });
      }
    });

    p(() => {
      if (state.change) {
        state.value = 5;
      }

      return '';
    });
  });

  state.show = true;
  state.change = true;

  await Promise.resolve();

  assert.equal(childRuns, 1);

  await settle();

  assert.equal(childRuns, 2);
  assert.equal(env.root.querySelector('div p').textContent, '5');
});
