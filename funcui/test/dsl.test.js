import test from 'node:test';
import assert from 'node:assert/strict';
import { $, div, h1, p, span, input, button, table, tbody, tr, td, template, mount } from 'funcui';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('all documented HTML overloads create real DOM elements', () => {
  const elements = [div(), div('Hello'), div(123), div({ class: 'container' }), div({ class: 'container' }, 'Hello'), div(() => 'Hello')];
  assert.ok(elements.every(element => element instanceof env.window.HTMLElement));
  assert.deepEqual(elements.map(element => element.textContent), ['', 'Hello', '123', '', 'Hello', 'Hello']);
  assert.equal(elements[3].className, 'container');
});

test('render scopes attach nested tags to the correct parent', () => {
  env.mount(() => {
    div({ class: 'outer' }, () => {
      h1('Title');
      div({ class: 'inner' }, () => { p('Description'); });
      span('Sibling');
    });
    p('Outside');
  });
  assert.equal(env.root.querySelector('.inner > p').textContent, 'Description');
  assert.equal(env.root.querySelector('.outer > span').textContent, 'Sibling');
  assert.equal(env.root.lastElementChild.textContent, 'Outside');
});

test('plain text is never parsed as HTML', () => {
  env.mount(() => p('<img src=x onerror=alert(1)>'));
  assert.equal(env.root.querySelector('img'), null);
  assert.equal(env.root.textContent, '<img src=x onerror=alert(1)>');
});

test('callbacks can return strings, numbers, null, or undefined', () => {
  env.mount(() => { div(() => 'hello'); div(() => 42); div(() => null); div(() => undefined); });
  assert.deepEqual([...env.root.children].map(element => element.textContent), ['hello', '42', '', '']);
});

test('a returned detached element is attached once', () => {
  const detached = env.document.createElement('strong');
  detached.textContent = 'Native';
  env.mount(() => div(() => detached));
  assert.equal(env.root.firstElementChild.firstElementChild, detached);
});

test('a callback returning a DSL element does not duplicate it', () => {
  env.mount(() => div(() => p('Only once')));
  assert.equal(env.root.querySelectorAll('p').length, 1);
  assert.equal(env.root.textContent, 'Only once');
});

test('attached elements are never moved or inserted again', () => {
  const existing = env.document.createElement('aside');
  env.document.body.append(existing);
  env.mount(() => div(() => existing));
  assert.equal(existing.parentNode, env.document.body);
  assert.equal(env.root.querySelector('aside'), null);
});

test('component functions compose using ordinary JavaScript', () => {
  const item = name => p({ class: 'item' }, name);
  env.mount(() => div(() => { for (const name of ['one', 'two', 'three']) item(name); }));
  assert.deepEqual([...env.root.querySelectorAll('.item')].map(element => element.textContent), ['one', 'two', 'three']);
});

test('a component without return can compose helpers and create multiple roots', async () => {
  const state = $({ count: 0 });
  let textRuns = 0;

  function counterComponent() {
    heading();
    controls();
  }

  function heading() {
    h1('Counter');
    p(() => {
      textRuns++;
      return state.count;
    });
  }

  function controls() {
    button({ onClick: () => state.count++ }, 'Increment');
  }

  const app = env.mount(counterComponent);
  const textNode = env.root.querySelector('p').firstChild;
  assert.deepEqual([...env.root.children].map(element => element.localName), ['h1', 'p', 'button']);

  env.root.querySelector('button').click();
  await flush();
  assert.equal(textNode.data, '1');
  assert.equal(env.root.querySelector('p').firstChild, textNode);

  app.unmount();
  state.count++;
  await flush();
  assert.equal(textRuns, 2);
});

test('components with and without return compose inside the same parent', async () => {
  const state = $({ value: 'first' });

  function withReturn() {
    return p({ class: 'with-return' }, () => state.value);
  }

  function withoutReturn() {
    p({ class: 'without-return' }, () => state.value);
  }

  env.mount(() => div(() => {
    withReturn();
    withoutReturn();
  }));

  assert.equal(env.root.querySelectorAll('div > p').length, 2);
  state.value = 'second';
  await flush();
  assert.equal(env.root.querySelector('.with-return').textContent, 'second');
  assert.equal(env.root.querySelector('.without-return').textContent, 'second');
});

test('table elements retain their requested DOM hierarchy', () => {
  env.mount(() => table(() => tbody(() => tr(() => td('Cell')))));
  assert.equal(env.root.querySelector('table > tbody > tr > td').textContent, 'Cell');
});

test('template children are created in its native content fragment', async () => {
  const state = $({ name: 'First' });
  env.mount(() => template(() => p(() => state.name)));
  const element = env.root.firstElementChild;
  assert.equal(element.childNodes.length, 0);
  assert.equal(element.content.querySelector('p').textContent, 'First');
  state.name = 'Second';
  await flush();
  assert.equal(element.content.querySelector('p').textContent, 'Second');
});

test('mount accepts elements and clears previous content', () => {
  const root = env.root;
  root.append('old');
  env.mount(() => button('new'), root);
  assert.equal(root.childNodes.length, 1);
  assert.equal(root.textContent, 'new');
});

test('invalid containers, content, and void-element children fail clearly', () => {
  assert.throws(() => mount('#missing', () => {}), /container/);
  assert.throws(() => div(true), /content/);
  assert.throws(() => div('a', 'b'), /attributes/);
  assert.throws(() => div({}, 'a', 'b'), /at most/);
  assert.throws(() => input('content'), /void/);
});

test('an element can be created without a current render parent', () => {
  const element = div(() => { h1('Detached'); p('Tree'); });
  assert.equal(element.parentNode, null);
  assert.equal(element.children.length, 2);
  assert.equal(env.root.childNodes.length, 0);
});
