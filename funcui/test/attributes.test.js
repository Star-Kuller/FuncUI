import test from 'node:test';
import assert from 'node:assert/strict';
import { $, div, p, input, button, label, select, option, textarea } from 'funcui';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('class aliases, standard attributes, data and aria values are applied', () => {
  env.mount(() => {
    div({ className: 'box', title: 'Title', 'data-ready': false, 'aria-hidden': false });
    label({ htmlFor: 'name' }, 'Name');
  });
  const box = env.root.firstElementChild;
  assert.equal(box.className, 'box');
  assert.equal(box.title, 'Title');
  assert.equal(box.getAttribute('data-ready'), 'false');
  assert.equal(box.getAttribute('aria-hidden'), 'false');
  assert.equal(env.root.lastElementChild.htmlFor, 'name');
});

test('boolean attributes update both presence and DOM properties', async () => {
  const state = $({ disabled: false, checked: true });
  env.mount(() => input({ disabled: () => state.disabled, checked: () => state.checked, type: 'checkbox' }));
  const element = env.root.firstElementChild;
  assert.equal(element.checked, true);
  assert.equal(element.hasAttribute('disabled'), false);
  state.disabled = true;
  state.checked = false;
  await flush();
  assert.equal(element.disabled, true);
  assert.equal(element.checked, false);
  assert.equal(element.hasAttribute('disabled'), true);
  assert.equal(element.hasAttribute('checked'), false);
});

test('reactive attributes preserve nodes and isolate their dependencies', async () => {
  const state = $({ count: 0, visible: true });
  let outerRuns = 0;
  env.mount(() => { outerRuns++; button({ title: () => `Count: ${state.count}`, class: () => state.visible ? 'on' : 'off' }, 'Stable'); });
  const element = env.root.firstElementChild;
  state.count = 5;
  state.visible = false;
  await flush();
  assert.equal(env.root.firstElementChild, element);
  assert.equal(element.title, 'Count: 5');
  assert.equal(element.className, 'off');
  assert.equal(outerRuns, 1);
});

test('null removes attributes and false remains a literal aria value', async () => {
  const state = $({ title: 'hello', hidden: true });
  env.mount(() => div({ title: () => state.title, 'aria-hidden': () => state.hidden }));
  state.title = null;
  state.hidden = false;
  await flush();
  assert.equal(env.root.firstElementChild.hasAttribute('title'), false);
  assert.equal(env.root.firstElementChild.getAttribute('aria-hidden'), 'false');
});

test('style accepts CSS strings and camelCase object properties', () => {
  env.mount(() => {
    p({ style: 'color: red; font-weight: bold;' }, 'String');
    p({ style: { color: 'blue', fontWeight: '700', '--accent': 'mint' } }, 'Object');
  });
  assert.equal(env.root.firstElementChild.style.color, 'red');
  assert.equal(env.root.firstElementChild.style.fontWeight, 'bold');
  assert.equal(env.root.lastElementChild.style.fontWeight, '700');
  assert.equal(env.root.lastElementChild.style.getPropertyValue('--accent'), 'mint');
});

test('computed style properties update independently of the render scope', async () => {
  const state = $({ visible: true });
  let outerRuns = 0;
  env.mount(() => { outerRuns++; div({ style: { opacity: () => state.visible ? 1 : 0.5, fontWeight: 600 } }); });
  const element = env.root.firstElementChild;
  state.visible = false;
  await flush();
  assert.equal(element.style.opacity, '0.5');
  assert.equal(element.style.fontWeight, '600');
  assert.equal(outerRuns, 1);
});

test('unchanged computed attributes and styles avoid DOM writes', async () => {
  const state = $({ revision: 0 });
  env.mount(() => {
    input({
      title: () => `Version ${Math.floor(state.revision / 2)}`,
      disabled: () => state.revision < 10,
      style: { color: 'red', opacity: () => state.revision < 2 ? 0.5 : 0.6 }
    });
    div({ style: () => { state.revision; return 'color:red'; } });
  });
  const changes = [];
  const observer = new env.window.MutationObserver(records => changes.push(...records));
  observer.observe(env.root, { subtree: true, attributes: true });
  state.revision = 1;
  await flush();
  assert.equal(changes.length, 0);
  state.revision = 2;
  await flush();
  assert.deepEqual(changes.map(change => change.attributeName).sort(), ['style', 'title']);
  assert.equal(env.root.querySelector('input').style.color, 'red');
  observer.disconnect();
});

test('a computed style object removes stale styles and can become a string', async () => {
  const state = $({ mode: 0 });
  env.mount(() => div({ style: () => state.mode === 0 ? { color: 'red', opacity: 0.5 } : state.mode === 1 ? { color: 'blue' } : 'color: green;' }));
  const element = env.root.firstElementChild;
  state.mode = 1;
  await flush();
  assert.equal(element.style.opacity, '');
  assert.equal(element.style.color, 'blue');
  state.mode = 2;
  await flush();
  assert.equal(element.style.color, 'green');
});

test('input value bindings use live properties and onInput writes state', async () => {
  const state = $({ name: 'Alex' });
  env.mount(() => {
    input({ value: () => state.name, onInput: event => state.name = event.target.value });
    p(() => state.name);
  });
  const element = env.root.firstElementChild;
  assert.equal(element.value, 'Alex');
  element.value = 'Robin';
  element.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  await flush();
  assert.equal(env.root.lastElementChild.textContent, 'Robin');
  state.name = 'Sam';
  await flush();
  assert.equal(element.value, 'Sam');
});

test('unchanged input value does not reset the caret', async () => {
  const state = $({ name: 'Alex', version: 0 });
  env.mount(() => input({ value: () => { state.version; return state.name; } }));
  const element = env.root.firstElementChild;
  element.setSelectionRange(2, 2);
  state.version++;
  await flush();
  assert.equal(element.selectionStart, 2);
});

test('textarea, select values and additional form properties work', async () => {
  const state = $({ choice: 'b', choices: ['a', 'b'], checked: true });
  env.mount(() => {
    textarea({ value: 'Text', readOnly: true });
    select({ value: () => state.choice }, () => { for (const value of state.choices) option({ value }, value); });
    input({ type: 'checkbox', indeterminate: () => state.checked });
  });
  const element = env.root.querySelector('select');
  assert.equal(element.value, 'b');
  assert.equal(env.root.querySelector('textarea').value, 'Text');
  assert.equal(env.root.querySelector('textarea').readOnly, true);
  state.choices.push('c');
  await flush();
  assert.equal(element.value, 'b');
  state.choice = 'c';
  state.checked = false;
  await flush();
  assert.equal(element.value, 'c');
  assert.equal(env.root.querySelector('input').indeterminate, false);
});

test('events execute only on dispatch and retain the element as this', async () => {
  const state = $({ count: 0 });
  let calls = 0;
  let receiver;
  env.mount(() => button({ onClick: function () { calls++; receiver = this; state.count++; } }, () => state.count));
  const element = env.root.firstElementChild;
  assert.equal(calls, 0);
  element.click();
  element.click();
  element.click();
  await flush();
  assert.equal(element.textContent, '3');
  assert.equal(calls, 3);
  assert.equal(receiver, element);
});

test('invalid handlers, styles and asynchronous attribute callbacks are rejected', () => {
  assert.throws(() => button({ onClick: 'alert(1)' }), /event handler/);
  assert.throws(() => div({ style: 42 }), /style/);
  assert.throws(() => div({ title: async () => 'async' }), /synchronous/);
  assert.throws(() => div({ title: () => Promise.resolve('async') }), /synchronous/);
  assert.throws(() => div({ style: async () => ({}) }), /synchronous/);
});
