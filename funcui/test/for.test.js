import test from 'node:test';
import assert from 'node:assert/strict';
import { $, For, div, p, ul, li, input, button, span } from 'funcui';
import { domTests, flush, settle } from './support/dom.js';

const env = domTests();

function users() {
  return $({ users: [
    { id: 1, name: 'Alex' },
    { id: 2, name: 'Sam' },
    { id: 3, name: 'Robin' }
  ] });
}

function mountUsers(state, onRender = () => {}) {
  return env.mount(() => ul(() => For(
    () => state.users,
    user => {
      onRender(user);
      li({ 'data-id': user.id }, () => {
        p(() => user.name);
        input({ value: () => user.name, onInput: event => user.name = event.target.value });
        button({ onClick: () => user.name += '!' }, 'Edit');
      });
    },
    user => user.id
  )));
}

function rows() {
  return [...env.root.querySelectorAll('li')];
}

function observe() {
  const changes = [];
  const observer = new env.window.MutationObserver(records => changes.push(...records));
  observer.observe(env.root, { subtree: true, childList: true, characterData: true, attributes: true });
  return { changes, observer };
}

test('For renders rows in place between surrounding siblings', () => {
  const state = users();
  env.mount(() => div(() => {
    p('Before');
    For(() => state.users, user => span(() => user.name), user => user.id);
    p('After');
  }));
  assert.deepEqual([...env.root.firstElementChild.children].map(node => node.textContent), ['Before', 'Alex', 'Sam', 'Robin', 'After']);
});

test('editing an item updates only its dependent text and property', async () => {
  const state = users();
  let renders = 0;
  mountUsers(state, () => renders++);
  const original = rows();
  const text = original[1].querySelector('p').firstChild;
  const { changes, observer } = observe();
  state.users[1].name = 'Changed';
  await settle();
  assert.deepEqual(rows(), original);
  assert.equal(original[1].querySelector('p').firstChild, text);
  assert.equal(text.data, 'Changed');
  assert.equal(renders, 3);
  assert.equal(changes.filter(change => change.type === 'childList').length, 0);
  assert.equal(changes.filter(change => change.type === 'characterData').length, 1);
  observer.disconnect();
});

test('insertion and deletion preserve surviving nodes and create only new rows', async () => {
  const state = users();
  let renders = 0;
  mountUsers(state, () => renders++);
  const original = rows();
  state.users.splice(1, 0, { id: 4, name: 'New' });
  await flush();
  assert.equal(rows()[0], original[0]);
  assert.equal(rows()[2], original[1]);
  assert.equal(renders, 4);
  state.users.splice(2, 1);
  await flush();
  assert.equal(rows()[2], original[2]);
  assert.equal(renders, 4);
});

test('rotations in either direction move one retained row using LIS', async () => {
  const state = users();
  mountUsers(state);
  const original = rows();
  const list = env.root.querySelector('ul');
  const insertBefore = list.insertBefore;
  let moves = 0;
  list.insertBefore = function (...args) {
    moves++;
    return insertBefore.apply(this, args);
  };

  state.users = [state.users[2], state.users[0], state.users[1]];
  await flush();
  assert.deepEqual(rows(), [original[2], original[0], original[1]]);
  assert.equal(moves, 1);
  moves = 0;
  state.users = [state.users[1], state.users[2], state.users[0]];
  await flush();
  assert.deepEqual(rows(), original);
  assert.equal(moves, 1);
});

test('reversing a list reuses DOM and event handlers', async () => {
  const state = users();
  let renders = 0;
  mountUsers(state, () => renders++);
  const original = rows();
  state.users.reverse();
  await flush();
  assert.deepEqual(rows(), [...original].reverse());
  rows()[0].querySelector('button').click();
  await flush();
  assert.equal(state.users[0].name, 'Robin!');
  assert.equal(renders, 3);
});

test('new objects with the same keys preserve DOM and redirect captured handlers', async () => {
  const state = users();
  let renders = 0;
  mountUsers(state, () => renders++);
  const original = rows();
  const oldUser = state.users[0];
  state.users = state.users.map(user => ({ id: user.id, name: `${user.name} updated` }));
  await settle();
  assert.deepEqual(rows(), original);
  assert.equal(renders, 3);
  assert.equal(original[0].querySelector('p').textContent, 'Alex updated');
  original[0].querySelector('button').click();
  await flush();
  assert.equal(state.users[0].name, 'Alex updated!');
  assert.equal(oldUser.name, 'Alex');
  oldUser.name = 'Stale';
  await flush();
  assert.equal(original[0].querySelector('p').textContent, 'Alex updated!');
});

test('equal replacement objects cause no DOM mutations and subscriptions follow them', async () => {
  const state = users();
  mountUsers(state);
  const original = rows();
  const { changes, observer } = observe();
  state.users = state.users.map(user => ({ ...user }));
  await settle();
  assert.equal(changes.length, 0);
  state.users[2].name = 'Current';
  await flush();
  assert.equal(original[2].querySelector('p').textContent, 'Current');
  observer.disconnect();
});

test('removed rows dispose bindings and listeners, including pending updates', async () => {
  const state = users();
  mountUsers(state);
  const removed = rows()[1];
  const oldUser = state.users[1];
  state.users.splice(1, 1);
  oldUser.name = 'Must not render';
  await flush();
  assert.equal(removed.querySelector('p').textContent, 'Sam');
  removed.querySelector('button').click();
  assert.equal(oldUser.name, 'Must not render');
  oldUser.name = 'Still detached';
  await flush();
  assert.equal(removed.querySelector('p').textContent, 'Sam');
});

test('For can become empty and populate again', async () => {
  const state = users();
  mountUsers(state);
  state.users = [];
  await flush();
  assert.equal(rows().length, 0);
  state.users.push({ id: 4, name: 'Back' });
  await flush();
  assert.equal(rows()[0].textContent, 'BackEdit');
});

test('one row may contain several roots and move them together without return', async () => {
  const state = users();
  env.mount(() => div(() => For(() => state.users, user => {
    p(() => user.name);
    span(() => user.id);
  }, user => user.id)));
  const original = [...env.root.firstElementChild.children];
  state.users.reverse();
  await flush();
  assert.deepEqual([...env.root.firstElementChild.children], [original[4], original[5], original[2], original[3], original[0], original[1]]);
});

test('For can render primitive text from an object row and keep its text node', async () => {
  const state = users();
  env.mount(() => div(() => For(() => state.users, user => user.name, user => user.id)));
  const text = [...env.root.firstElementChild.childNodes].find(node => node.nodeType === 3);
  state.users[0].name = 'Text';
  await flush();
  assert.equal(text.data, 'Text');
  assert.ok(text.parentNode);
});

test('nested lists retain independent ownership', async () => {
  const state = $({ groups: [{ id: 1, users: [{ id: 1, name: 'First' }] }, { id: 2, users: [{ id: 1, name: 'Second' }] }] });
  env.mount(() => For(() => state.groups, group => div(() => For(() => group.users, user => p(() => user.name), user => user.id)), group => group.id));
  const firstGroup = env.root.firstElementChild;
  const firstText = firstGroup.querySelector('p');
  state.groups[0].users.push({ id: 2, name: 'Added' });
  await flush();
  assert.equal(firstGroup.querySelector('p'), firstText);
  state.groups.reverse();
  await flush();
  assert.equal(env.root.lastElementChild, firstGroup);
  assert.equal(env.root.lastElementChild.querySelectorAll('p').length, 2);
});

test('duplicate keys leave the last valid list intact and allow recovery', async () => {
  const state = users();
  mountUsers(state);
  const original = rows();
  state.users.push({ id: 1, name: 'Duplicate' });
  await flush();
  assert.deepEqual(rows(), original);
  assert.match(env.errors[0].message, /duplicate key/);
  state.users.pop();
  await flush();
  assert.deepEqual(rows(), original);
});

test('a failed new renderer rolls back its resources and preserves the list', async () => {
  const state = users();
  let partial;
  let events = 0;
  env.mount(() => For(() => state.users, user => {
    const node = button({ onClick: () => events++ }, () => user.name);
    if (user.id === 5) {
      partial = node;
      throw new Error('New row failed');
    }
  }, user => user.id));
  const original = [...env.root.children];
  state.users.push({ id: 4, name: 'Prepared' }, { id: 5, name: 'Fail' });
  await flush();
  assert.deepEqual([...env.root.children], original);
  partial.click();
  assert.equal(events, 0);
  assert.match(env.errors[0].message, /New row failed/);
  state.users.splice(3, 2);
  await flush();
  assert.deepEqual([...env.root.children], original);
});

test('enumeration, property deletion and the in operator follow replacement objects', async () => {
  const state = $({ users: [{ id: 1, name: 'A', extra: 1 }] });
  let reference;
  env.mount(() => For(() => state.users, user => {
    reference = user;
    p(() => Object.keys(user).join(','));
    p(() => 'extra' in user ? 'yes' : 'no');
    p(() => String(user.extra));
  }, user => user.id));
  delete reference.extra;
  assert.equal('extra' in state.users[0], false);
  await flush();
  assert.equal(env.root.textContent, 'id,namenoundefined');
  state.users = [{ id: 1, name: 'B', extra: 2 }];
  await flush();
  assert.equal(env.root.textContent, 'id,name,extrayes2');
  reference.name = 'Immediate';
  assert.equal(reference.name, 'Immediate');
  assert.equal(state.users[0].name, 'Immediate');
});

test('unmount disposes a list and all its item subscriptions', async () => {
  const state = users();
  const app = mountUsers(state);
  const original = rows();
  app.unmount();
  state.users[0].name = 'Unused';
  state.users.reverse();
  await flush();
  assert.equal(env.root.childNodes.length, 0);
  assert.equal(original[0].querySelector('p').textContent, 'Alex');
});

test('invalid collections, items, keys and callbacks fail clearly', () => {
  assert.throws(() => For(() => [], () => {}, item => item.id), /inside/);
  assert.throws(() => env.mount(() => For(() => null, () => {}, item => item.id)), /array/);
  assert.throws(() => env.mount(() => For(() => [1], () => {}, item => item)), /plain object/);
  assert.throws(() => env.mount(() => For(() => [{ name: 'Missing' }], () => {}, item => item.id)), /keys/);
  assert.throws(() => env.mount(() => For(async () => [], () => {}, item => item.id)), /synchronous/);
});

test('short map callbacks can return arrays of attached elements without duplication', async () => {
  const state = users();
  env.mount(() => div(() => state.users.map(user => p(user.name))));
  assert.equal(env.root.querySelectorAll('p').length, 3);
  state.users.push({ id: 4, name: 'More' });
  await flush();
  assert.equal(env.root.querySelectorAll('p').length, 4);
});

test('synchronous edits of all rows use one microtask and only change final text', async () => {
  const state = users();
  let renders = 0;
  mountUsers(state, () => renders++);
  const original = rows();
  const { changes, observer } = observe();
  const originalQueue = globalThis.queueMicrotask;
  let flushes = 0;
  globalThis.queueMicrotask = callback => {
    flushes++;

    originalQueue(callback);
  };

  try {
    for (let pass = 0; pass < 1000; pass++) {
      for (const user of state.users) {
        user.name = String(pass);
      }
    }

    await settle();

    assert.equal(flushes, 1);
    assert.equal(renders, 3);
    assert.deepEqual(rows(), original);
    assert.equal(changes.filter(change => change.type === 'characterData').length, 3);
    assert.equal(changes.filter(change => change.type === 'childList').length, 0);
    assert.ok(original.every(row => row.querySelector('p').textContent === '999'));
  } finally {
    globalThis.queueMicrotask = originalQueue;
    observer.disconnect();
  }
});

test('nested item dependencies follow replacements and stop observing old objects', async () => {
  const oldProfile = { name: 'Old' };
  const state = $({ users: [{ id: 1, profile: oldProfile }] });
  env.mount(() => For(() => state.users, user => p(() => user.profile.name), user => user.id));
  const node = env.root.querySelector('p');
  const oldReactiveProfile = state.users[0].profile;
  state.users = [{ id: 1, profile: { name: 'New' } }];
  await flush();
  assert.equal(env.root.querySelector('p'), node);
  assert.equal(node.textContent, 'New');
  oldReactiveProfile.name = 'Stale';
  state.users[0].profile.name = 'Current';
  await flush();
  assert.equal(node.textContent, 'Current');
});

test('changing a key replaces only that row and disposes its handlers', async () => {
  const state = users();
  mountUsers(state);
  const original = rows();
  state.users[1].id = 20;
  await flush();
  assert.equal(rows()[0], original[0]);
  assert.notEqual(rows()[1], original[1]);
  assert.equal(rows()[2], original[2]);
  original[1].querySelector('button').click();
  assert.equal(state.users[1].name, 'Sam');
});

test('unmount during creation of a row cancels the remaining list update', async () => {
  const state = users();
  let app;
  let createdAfterUnmount = false;
  app = env.mount(() => For(() => state.users, user => {
    p(() => user.name);
    if (user.id === 4) {
      app.unmount();
    }

    if (user.id === 5) {
      createdAfterUnmount = true;
    }
  }, user => user.id));
  state.users.push({ id: 4, name: 'Unmount' }, { id: 5, name: 'Cancelled' });
  await flush();
  assert.equal(env.root.childNodes.length, 0);
  assert.equal(createdAfterUnmount, false);
  assert.deepEqual(env.errors, []);
});
