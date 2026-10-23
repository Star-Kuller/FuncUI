import test from 'node:test';
import assert from 'node:assert/strict';
import { hello } from '../../demo/src/components/hello.js';
import { counter } from '../../demo/src/components/counter.js';
import { usersList } from '../../demo/src/components/users.js';
import { springAnimation } from '../../demo/src/components/animation.js';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('Hello uses the external name, a generated feature list and reactive input', async () => {
  env.mount(() => hello({ name: 'Reader' }));

  assert.equal(env.root.querySelector('.greeting').textContent, 'Hello, Reader!');
  assert.equal(env.root.querySelectorAll('.feature-list li').length, 3);

  const input = env.root.querySelector('input');
  const greeting = env.root.querySelector('.greeting');
  const textNode = greeting.firstChild;

  input.value = '';
  input.dispatchEvent(new env.window.Event('input'));
  await flush();

  assert.equal(greeting.textContent, 'Hello, stranger!');
  assert.equal(greeting.firstChild, textNode);
});

test('counter supports quick increments, negatives and reset while preserving surrounding UI', async () => {
  env.mount(() => {
    hello({ name: 'World' });
    counter();
  });

  const helloCard = env.root.querySelector('.hello-card');
  const counterCard = env.root.querySelector('.counter-card');
  const count = env.root.querySelector('.counter-value');
  const textNode = count.firstChild;
  const increase = env.root.querySelector('[aria-label="Increase count"]');
  const decrease = env.root.querySelector('[aria-label="Decrease count"]');
  const reset = env.root.querySelector('[aria-label="Reset count"]');

  assert.equal(reset.disabled, true);

  for (let i = 0; i < 20; i++) {
    increase.click();
  }

  await flush();

  assert.equal(count.textContent, '20');
  assert.equal(reset.disabled, false);

  for (let i = 0; i < 22; i++) {
    decrease.click();
  }

  await flush();

  assert.equal(count.textContent, '-2');

  reset.click();
  await flush();

  assert.equal(count.textContent, '0');
  assert.equal(count.firstChild, textNode);
  assert.equal(env.root.querySelector('.hello-card'), helloCard);
  assert.equal(env.root.querySelector('.counter-card'), counterCard);
});

test('each counter invocation has independent state', async () => {
  env.mount(() => {
    counter();
    counter();
  });

  env.root.querySelector('[aria-label="Increase count"]').click();
  await flush();

  const values = [...env.root.querySelectorAll('.counter-value')];
  const counts = values.map(element => element.textContent);

  assert.deepEqual(counts, ['1', '0']);

  const headingIds = [...env.root.querySelectorAll('h2')].map(heading => heading.id);

  assert.equal(new Set(headingIds).size, 2);
});

test('editable list supports addition, replacement, reordering and removal without recreating rows', async () => {
  env.mount(usersList);

  const original = [...env.root.querySelectorAll('.user-row')];
  const firstInput = original[0].querySelector('input');

  function click(text) {
    const buttons = [...env.root.querySelectorAll('button')];
    const target = buttons.find(button => button.textContent === text);

    target.click();
  }

  click('Replace objects');
  await flush();

  firstInput.value = 'Edited';
  firstInput.dispatchEvent(new env.window.Event('input'));
  await flush();

  click('Uppercase all');
  await flush();

  assert.equal(firstInput.value, 'EDITED');
  assert.equal(env.root.querySelector('.user-row'), original[0]);

  const draft = env.root.querySelector('[aria-label="New user name"]');

  draft.value = 'New';
  draft.dispatchEvent(new env.window.Event('input'));
  await flush();

  click('Add user');
  await flush();

  assert.equal(env.root.querySelectorAll('.user-row').length, 4);
  assert.equal(draft.value, '');

  click('Reverse order');
  await flush();

  assert.equal(env.root.querySelector('.user-row:last-of-type'), original[0]);

  env.root.querySelector('[aria-label="Move user 1 up"]').click();
  await flush();

  assert.equal(env.root.querySelectorAll('.user-row')[2], original[0]);

  env.root.querySelector('[aria-label="Remove user 1"]').click();
  await flush();

  assert.equal(original[0].isConnected, false);
  assert.equal(env.root.querySelectorAll('.user-row').length, 3);
});

test('spring advances by frames, reacts to settings, pauses, resets and cancels on abort', async () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map();
  let nextId = 1;
  const lifetime = new AbortController();

  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;

    callbacks.set(id, callback);

    return id;
  };

  globalThis.cancelAnimationFrame = id => callbacks.delete(id);

  async function frame(time) {
    const queued = [...callbacks.values()];
    callbacks.clear();

    for (const callback of queued) {
      callback(time);
    }

    await flush();
  }

  function click(text) {
    const buttons = [...env.root.querySelectorAll('button')];
    const target = buttons.find(button => button.textContent === text);

    target.click();
  }

  try {
    env.mount(() => springAnimation({ signal: lifetime.signal }));

    const ball = env.root.querySelector('.spring-ball');
    const initial = ball.style.left;

    click('Play');

    assert.equal(callbacks.size, 1);
    await frame(0);
    await frame(16);

    assert.notEqual(ball.style.left, initial);
    assert.equal(env.root.querySelector('.spring-ball'), ball);

    const stiffness = env.root.querySelector('input[type="range"]');

    stiffness.value = '180';
    stiffness.dispatchEvent(new env.window.Event('input'));
    await flush();

    assert.equal(env.root.querySelector('.setting-value').textContent, '180');

    click('Pause');
    await flush();

    assert.equal(callbacks.size, 0);

    const paused = ball.style.left;

    await frame(32);

    assert.equal(ball.style.left, paused);

    click('Reset motion');
    await flush();

    assert.equal(ball.style.left, initial);

    click('Move target');
    await frame(48);
    await frame(64);

    assert.ok(parseFloat(ball.style.left) < 50);

    lifetime.abort();
    await flush();

    assert.equal(callbacks.size, 0);

    click('Play');

    assert.equal(callbacks.size, 0);
  } finally {
    lifetime.abort();

    if (originalRequest) {
      globalThis.requestAnimationFrame = originalRequest;
    } else {
      delete globalThis.requestAnimationFrame;
    }

    if (originalCancel) {
      globalThis.cancelAnimationFrame = originalCancel;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});
