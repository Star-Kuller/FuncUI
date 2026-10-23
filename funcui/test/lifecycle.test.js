import test from 'node:test';
import assert from 'node:assert/strict';
import { $, div, p, button, mount } from 'funcui';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('unmount removes DOM, subscriptions and event listeners', async () => {
  const state = $({ count: 0 });
  let runs = 0;
  const app = env.mount(() => button({ onClick: () => state.count++ }, () => { runs++; return state.count; }));
  const detached = env.root.firstElementChild;
  app.unmount();
  detached.click();
  state.count = 10;
  await flush();
  assert.equal(env.root.childNodes.length, 0);
  assert.equal(detached.textContent, '0');
  assert.equal(runs, 1);
});

test('unmount before the microtask flush cancels pending effects', async () => {
  const state = $({ count: 0 });
  let runs = 0;
  const app = env.mount(() => p(() => { runs++; return state.count; }));
  state.count++;
  app.unmount();
  app.unmount();
  await flush();
  assert.equal(runs, 1);
  assert.equal(env.root.childNodes.length, 0);
});

test('unmount from a running render cannot recreate the removed DOM', async () => {
  const state = $({ close: false });
  let app;
  app = env.mount(() => div(() => {
    if (state.close) {
      app.unmount();
      return 'Must not appear';
    }
    p('Mounted');
  }));
  state.close = true;
  await flush();
  assert.equal(env.root.childNodes.length, 0);
  assert.equal(env.errors.length, 0);
});

test('mount adopts a previously created detached reactive tree', async () => {
  const state = $({ value: 0 });
  let runs = 0;
  const element = button({ onClick: () => state.value++ }, () => { runs++; return state.value; });
  const app = env.mount(() => element);
  element.click();
  await flush();
  assert.equal(element.textContent, '1');
  app.unmount();
  element.click();
  state.value++;
  await flush();
  assert.equal(runs, 2);
  assert.equal(element.textContent, '1');
});

test('discarded structural branches release listeners and attribute effects', async () => {
  const state = $({ show: true, value: 0 });
  let attributeRuns = 0;
  env.mount(() => div(() => {
    if (state.show) button({ title: () => { attributeRuns++; return state.value; }, onClick: () => state.value++ }, 'Old');
  }));
  const oldButton = env.root.querySelector('button');
  state.show = false;
  await flush();
  oldButton.click();
  assert.equal(state.value, 0);
  state.value++;
  await flush();
  assert.equal(attributeRuns, 1);
});

test('mounting again disposes the previous app without a stale unmount clearing the new app', async () => {
  const state = $({ value: 0 });
  let runs = 0;
  const oldApp = env.mount(() => p(() => { runs++; return state.value; }));
  env.mount(() => p('New app'));
  oldApp.unmount();
  state.value++;
  await flush();
  assert.equal(runs, 1);
  assert.equal(env.root.textContent, 'New app');
});

test('independent mounts have separate ownership', async () => {
  const state = $({ value: 0 });
  const other = env.document.createElement('div');
  env.document.body.append(other);
  const first = env.mount(() => p(() => state.value));
  env.mount(() => p(() => state.value), other);
  first.unmount();
  state.value++;
  await flush();
  assert.equal(env.root.textContent, '');
  assert.equal(other.textContent, '1');
});

test('a failed initial render cleans up partial trees and restores context', async () => {
  const state = $({ value: 0 });
  let runs = 0;
  let detached;
  assert.throws(() => mount('#app', () => {
    detached = button({ onClick: () => state.value++ }, () => { runs++; return state.value; });
    throw new Error('Initial failure');
  }), /Initial failure/);
  assert.equal(env.root.childNodes.length, 0);
  detached.click();
  state.value++;
  await flush();
  assert.equal(runs, 1);
  assert.equal(p('Detached').parentNode, null);
  env.mount(() => p(() => state.value));
  state.value++;
  await flush();
  assert.equal(env.root.textContent, '2');
});

test('failed updates retain valid DOM, discard partial effects and continue other jobs', async () => {
  const state = $({ fail: false, value: 0, sibling: 0 });
  let partialRuns = 0;
  env.mount(() => {
    div(() => {
      if (state.fail) {
        p(() => { partialRuns++; return state.value; });
        throw new Error('Update failure');
      }
      button('Valid');
    });
    p(() => state.sibling);
  });
  const previous = env.root.querySelector('button');
  state.fail = true;
  state.sibling = 5;
  await flush();
  assert.equal(env.errors.length, 1);
  assert.equal(env.root.querySelector('button'), previous);
  assert.equal(env.root.lastElementChild.textContent, '5');
  state.value++;
  await flush();
  assert.equal(partialRuns, 1);
  state.fail = false;
  await flush();
  assert.equal(env.root.querySelector('button').textContent, 'Valid');
});

test('nested render errors caught by application code do not leak dependencies', async () => {
  const state = $({ inner: 0, outer: 0 });
  let outerRuns = 0;
  env.mount(() => div(() => {
    outerRuns++;
    try { p(() => { state.inner; throw new Error('Caught'); }); } catch { p('Recovered'); }
    p(state.outer);
  }));
  state.inner++;
  await flush();
  assert.equal(outerRuns, 1);
  state.outer++;
  await flush();
  assert.equal(outerRuns, 2);
  assert.equal(env.errors.length, 0);
});

test('async renders and promise-returning callbacks fail without leaking context', () => {
  assert.throws(() => mount('#app', async () => p('Async')), /synchronous/);
  assert.throws(() => mount('#app', () => p(() => Promise.resolve('Async'))), /synchronous/);
  assert.equal(div('Outside').parentNode, null);
});

test('a failed attribute update recovers on subsequent state changes', async () => {
  const state = $({ fail: false, value: 'first' });
  env.mount(() => button({ title: () => { if (state.fail) throw new Error('Attribute failure'); return state.value; } }, 'Button'));
  const element = env.root.firstElementChild;
  state.fail = true;
  await flush();
  assert.equal(element.title, 'first');
  assert.equal(env.errors.length, 1);
  state.fail = false;
  state.value = 'recovered';
  await flush();
  assert.equal(element.title, 'recovered');
});
