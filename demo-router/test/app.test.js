import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDemo } from '../src/app.js';

let dom;
let app;
let previousDocument;
let leaveAllowed;

beforeEach(async () => {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = dom.window.document;
  leaveAllowed = false;
  app = createDemo(document.querySelector('#app'), {
    confirmLeave: () => leaveAllowed
  });

  await app.router.start({ links: document });
});

afterEach(() => {
  app.stop();
  dom.window.close();

  if (previousDocument) {
    Object.defineProperty(globalThis, 'document', previousDocument);
  } else {
    delete globalThis.document;
  }
});

const settle = () => new Promise(resolve => setImmediate(resolve));

test('ordinary links navigate between real FuncUI pages while retaining the shell', async () => {
  const sidebar = document.querySelector('.sidebar');
  document.querySelector('a[href="/users"][data-nav]').click();
  await settle();
  assert.equal(app.router.current.path, '/users');
  assert.equal(document.querySelectorAll('.user-card').length, 3);
  document.querySelector('.user-card').click();
  await settle();
  assert.equal(app.router.current.params.id, 1);
  assert.match(document.querySelector('h1').textContent, /Ада/);
  await app.router.navigate('/users/1/settings');
  assert.match(document.querySelector('h1').textContent, /Настройки/);
  assert.equal(document.querySelector('.sidebar'), sidebar);
  assert.equal(document.querySelector('[data-nav][href="/users"]').getAttribute('aria-current'), 'page');
});

test('the authentication guard redirects to login and the login button returns to the target', async () => {
  await app.router.navigate('/workspace');
  assert.equal(app.router.current.path, '/login');
  assert.equal(app.router.current.query.get('next'), '/workspace');
  document.querySelector('.page-outlet button').click();
  await settle();
  assert.equal(app.router.current.path, '/workspace');
  assert.match(document.querySelector('h1').textContent, /исследователь/);
  document.querySelector('.page-outlet button').click();
  await settle();
  await app.router.navigate('/workspace');
  assert.equal(app.router.current.path, '/login');
});

test('an edited note blocks leaving until confirmation or saving and releases old controls', async () => {
  await app.router.navigate('/notes');
  const field = document.querySelector('textarea');
  field.value = 'Новая мысль';
  field.dispatchEvent(new dom.window.Event('input'));
  await settle();
  assert.equal(await app.router.navigate('/users'), false);
  assert.equal(app.router.current.path, '/notes');
  assert.equal(document.querySelector('textarea'), field);
  document.querySelector('.note-actions button').click();
  await settle();
  assert.equal(await app.router.navigate('/users'), true);
  // После очистки страницы старое поле FuncUI больше не имеет обработчика.
  field.value = 'Это изменение не должно сохраниться';
  field.dispatchEvent(new dom.window.Event('input'));
  await app.router.navigate('/notes');
  assert.equal(document.querySelector('textarea').value, 'Новая мысль');
  document.querySelector('textarea').value = 'Ещё одна мысль';
  document.querySelector('textarea').dispatchEvent(new dom.window.Event('input'));
  leaveAllowed = true;
  assert.equal(await app.router.navigate('/'), true);
});

test('wildcards, 404 and bad parameters are visible without breaking the app', async () => {
  await app.router.navigate('/docs/api/guards');
  assert.equal(app.router.current.params.path, 'api/guards');
  await app.router.navigate('/missing/example');
  assert.match(document.querySelector('.page-heading').textContent, /404/);
  await assert.rejects(app.router.navigate('/users/nope'), /положительным/);
  await settle();
  assert.equal(app.router.current.path, '/missing/example');
  assert.equal(document.querySelector('[role="alert"]').hidden, false);
});
