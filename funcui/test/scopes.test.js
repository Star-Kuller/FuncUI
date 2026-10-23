import test from 'node:test';
import assert from 'node:assert/strict';
import { $, div, h1, p, button } from 'funcui';
import { domTests, flush, settle } from './support/dom.js';

const env = domTests();

test('scope-based reads rerender only their containing scope', async () => {
  const state = $({ count: 0 });
  env.mount(() => {
    h1('Stable');
    div(() => { p(state.count); button({ onClick: () => state.count++ }, 'Increment'); });
  });
  const heading = env.root.querySelector('h1');
  const container = env.root.querySelector('div');
  const previousText = container.querySelector('p');
  container.querySelector('button').click();
  await flush();
  assert.equal(env.root.querySelector('h1'), heading);
  assert.equal(env.root.querySelector('div'), container);
  assert.notEqual(container.querySelector('p'), previousText);
  assert.equal(container.querySelector('p').textContent, '1');
  container.querySelector('button').click();
  await flush();
  assert.equal(container.querySelector('p').textContent, '2');
});

test('fine-grained text preserves the element, text node, and siblings', async () => {
  const state = $({ count: 0 });
  let rootRuns = 0;
  env.mount(() => { rootRuns++; p(() => state.count); button('Stable'); });
  const paragraph = env.root.firstElementChild;
  const text = paragraph.firstChild;
  const sibling = env.root.lastElementChild;
  state.count = 4;
  await flush();
  assert.equal(paragraph.firstChild, text);
  assert.equal(env.root.firstElementChild, paragraph);
  assert.equal(env.root.lastElementChild, sibling);
  assert.equal(text.data, '4');
  assert.equal(rootRuns, 1);
});

test('empty computed text can become text without replacing its node', async () => {
  const state = $({ value: null });
  env.mount(() => p(() => state.value));
  const text = env.root.firstElementChild.firstChild;
  state.value = 'Now visible';
  await flush();
  assert.equal(env.root.firstElementChild.firstChild, text);
  assert.equal(text.data, 'Now visible');
});

test('conditional structure switches branches and releases old dependencies', async () => {
  const state = $({ enabled: true, first: 'A', second: 'B' });
  let runs = 0;
  env.mount(() => div(() => { runs++; if (state.enabled) h1(state.first); else p(state.second); }));
  state.enabled = false;
  await flush();
  assert.equal(env.root.querySelector('h1'), null);
  assert.equal(env.root.querySelector('p').textContent, 'B');
  state.first = 'unused';
  await flush();
  assert.equal(runs, 2);
  state.second = 'C';
  await flush();
  assert.equal(env.root.querySelector('p').textContent, 'C');
});

test('computed text rebuilds conditional dependencies', async () => {
  const state = $({ enabled: true, firstName: 'Alex', lastName: 'Smith' });
  let runs = 0;
  env.mount(() => p(() => { runs++; return state.enabled ? state.firstName : state.lastName; }));
  state.lastName = 'Jones';
  await flush();
  assert.equal(runs, 1);
  state.enabled = false;
  await flush();
  state.firstName = 'unused';
  await flush();
  assert.equal(runs, 2);
  assert.equal(env.root.textContent, 'Jones');
});

test('nested effects do not subscribe their parents', async () => {
  const state = $({ outer: 0, inner: 0, tail: 0 });
  let outerRuns = 0;
  let innerRuns = 0;
  env.mount(() => div(() => {
    outerRuns++;
    p(state.outer);
    p(() => { innerRuns++; return state.inner; });
    p(state.tail);
  }));
  state.inner++;
  await flush();
  assert.equal(outerRuns, 1);
  assert.equal(innerRuns, 2);
  state.tail++;
  await flush();
  assert.equal(outerRuns, 2);
});

test('multiple synchronous writes produce one update with the final value', async () => {
  const state = $({ count: 0 });
  let runs = 0;
  env.mount(() => p(() => { runs++; return state.count; }));
  state.count++;
  state.count++;
  state.count++;
  assert.equal(env.root.textContent, '0');
  await flush();
  assert.equal(env.root.textContent, '3');
  assert.equal(runs, 2);
});

test('one effect subscribed to several changed properties still runs once', async () => {
  const state = $({ first: 1, second: 2 });
  let runs = 0;
  env.mount(() => p(() => { runs++; return state.first + state.second; }));
  state.first++;
  state.second++;
  await flush();
  assert.equal(runs, 2);
  assert.equal(env.root.textContent, '5');
});

test('a parent update disposes a queued child before it executes', async () => {
  const state = $({ show: true, value: 0 });
  let childRuns = 0;
  env.mount(() => div(() => { if (state.show) p(() => { childRuns++; return state.value; }); }));
  state.value++;
  state.show = false;
  await flush();
  assert.equal(childRuns, 1);
  assert.equal(env.root.textContent, '');
});

test('recreated children do not receive duplicate queued updates', async () => {
  const state = $({ version: 0, value: 0 });
  let childRuns = 0;
  env.mount(() => div(() => { p(state.version); p(() => { childRuns++; return state.value; }); }));
  state.value++;
  state.version++;
  await flush();
  assert.equal(childRuns, 2);
  state.value++;
  await flush();
  assert.equal(childRuns, 3);
});

test('a callback can transition between text and structural content', async () => {
  const state = $({ structured: false });
  env.mount(() => div(() => { if (state.structured) return p('Nested'); return 'Plain'; }));
  state.structured = true;
  await flush();
  assert.equal(env.root.querySelector('div > p').textContent, 'Nested');
  state.structured = false;
  await flush();
  assert.equal(env.root.querySelector('p'), null);
  assert.equal(env.root.textContent, 'Plain');
});

test('cyclic updates stop with diagnostics instead of locking the scheduler', async () => {
  const state = $({ value: 0, stable: 0 });
  env.mount(() => { p(() => { const value = state.value; state.value++; return value; }); p(() => state.stable); });
  state.stable = 42;
  await settle();
  assert.equal(env.errors.length, 1);
  assert.match(env.errors[0].message, /cycle.*100/);
  assert.equal(env.root.lastElementChild.textContent, '42');
});
