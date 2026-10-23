import test from 'node:test';
import assert from 'node:assert/strict';
import { $, reactive, p, div } from 'funcui';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('$ and reactive are the same API and reject unsupported roots', () => {
  assert.equal($, reactive);
  for (const value of [null, undefined, 1, 'x', true, Symbol(), () => {}, new Date(), new Map(), new Set(), new (class State {})()]) {
    assert.throws(() => $(value), /plain object or an array/);
  }
});

test('proxy identity is cached and cyclic references are supported', () => {
  const raw = { child: { name: 'Alex' } };
  raw.self = raw;
  const state = $(raw);
  assert.equal($(raw), state);
  assert.equal($(state), state);
  assert.equal(state.child, state.child);
  assert.equal(state.self, state);
});

test('nested properties and replacing a nested object both update the view', async () => {
  const state = $({ user: { name: 'Alex' } });
  env.mount(() => p(() => state.user.name));
  state.user.name = 'Sam';
  await flush();
  assert.equal(env.root.textContent, 'Sam');
  const oldUser = state.user;
  state.user = { name: 'Robin' };
  await flush();
  assert.equal(env.root.textContent, 'Robin');
  oldUser.name = 'Detached';
  await flush();
  assert.equal(env.root.textContent, 'Robin');
});

test('Object.is prevents unchanged writes and distinguishes signed zero', async () => {
  const state = $({ value: NaN });
  let runs = 0;
  env.mount(() => p(() => { runs++; return String(state.value); }));
  state.value = NaN;
  await flush();
  assert.equal(runs, 1);
  state.value = 0;
  await flush();
  state.value = -0;
  await flush();
  assert.equal(runs, 3);
});

test('assigning a proxy of the same raw value does not notify', async () => {
  const state = $({ child: {} });
  let runs = 0;
  env.mount(() => p(() => { runs++; return String(Boolean(state.child)); }));
  state.child = state.child;
  await flush();
  assert.equal(runs, 1);
});

test('only properties actually read are subscribed', async () => {
  const state = $({ used: 1, unused: 1 });
  let runs = 0;
  env.mount(() => p(() => { runs++; return state.used; }));
  state.unused++;
  await flush();
  assert.equal(runs, 1);
  state.used++;
  await flush();
  assert.equal(runs, 2);
});

test('enumeration reacts to adding and deleting keys, not changing values', async () => {
  const state = $({ first: 1 });
  let runs = 0;
  env.mount(() => p(() => { runs++; return Object.keys(state).join(','); }));
  state.first = 2;
  await flush();
  assert.equal(runs, 1);
  state.second = undefined;
  await flush();
  assert.equal(env.root.textContent, 'first,second');
  delete state.first;
  await flush();
  assert.equal(env.root.textContent, 'second');
  delete state.missing;
  await flush();
  assert.equal(runs, 3);
});

test('the in operator tracks addition and deletion', async () => {
  const state = $({});
  env.mount(() => p(() => 'name' in state ? 'present' : 'absent'));
  state.name = 'Alex';
  await flush();
  assert.equal(env.root.textContent, 'present');
  delete state.name;
  await flush();
  assert.equal(env.root.textContent, 'absent');
});

test('symbols and null-prototype objects are reactive', async () => {
  const key = Symbol('key');
  const state = $(Object.assign(Object.create(null), { [key]: 'one' }));
  env.mount(() => p(() => state[key]));
  state[key] = 'two';
  await flush();
  assert.equal(env.root.textContent, 'two');
});

test('Date, Map, Set and class instances remain opaque nested values', () => {
  const date = new Date();
  const map = new Map([['x', 1]]);
  const set = new Set([1]);
  const instance = new (class Model {})();
  const state = $({ date, map, set, instance });
  assert.equal(state.date, date);
  assert.equal(state.map.get('x'), 1);
  assert.equal(state.set.has(1), true);
  assert.equal(state.instance, instance);
});

test('frozen data properties respect native Proxy invariants', () => {
  const child = {};
  const state = $(Object.freeze({ child }));
  assert.equal(state.child, child);
  assert.throws(() => { state.child = {}; }, TypeError);
});

test('array push and index insertion notify length observers once per batch', async () => {
  const state = $({ items: [1] });
  let runs = 0;
  env.mount(() => p(() => { runs++; return state.items.length; }));
  state.items.push(2, 3);
  await flush();
  assert.equal(env.root.textContent, '3');
  assert.equal(runs, 2);
  state.items[5] = 6;
  await flush();
  assert.equal(env.root.textContent, '6');
});

test('shrinking array length invalidates removed index and enumeration dependencies', async () => {
  const state = $([10, 20, 30]);
  env.mount(() => { p(() => String(state[2])); p(() => Object.keys(state).join(',')); });
  state.length = 1;
  await flush();
  assert.deepEqual([...env.root.children].map(element => element.textContent), ['undefined', '0']);
});

test('deleting an array index updates enumeration without changing length', async () => {
  const state = $([1, 2]);
  let lengthRuns = 0;
  env.mount(() => { p(() => Object.keys(state).join(',')); p(() => { lengthRuns++; return state.length; }); });
  delete state[0];
  await flush();
  assert.equal(env.root.firstElementChild.textContent, '1');
  assert.equal(lengthRuns, 1);
});

test('standard array mutations update rendered lists and nested item values', async () => {
  const state = $({ items: [{ name: 'B' }, { name: 'C' }] });
  env.mount(() => div(() => { for (const item of state.items) p(item.name); }));
  const names = () => [...env.root.querySelectorAll('p')].map(element => element.textContent);
  state.items.unshift({ name: 'A' });
  await flush();
  assert.deepEqual(names(), ['A', 'B', 'C']);
  state.items.splice(1, 1, { name: 'D' });
  await flush();
  assert.deepEqual(names(), ['A', 'D', 'C']);
  state.items.reverse();
  await flush();
  assert.deepEqual(names(), ['C', 'D', 'A']);
  state.items.sort((a, b) => a.name.localeCompare(b.name));
  await flush();
  assert.deepEqual(names(), ['A', 'C', 'D']);
  state.items[0].name = 'Z';
  await flush();
  assert.deepEqual(names(), ['Z', 'C', 'D']);
  state.items.pop();
  state.items.shift();
  await flush();
  assert.deepEqual(names(), ['C']);
});
