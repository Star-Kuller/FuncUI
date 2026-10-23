import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createDemo } from '../src/app.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let dom;
let document;
let app;
let calls;

beforeEach(async () => {
  dom = new JSDOM(html, { url: 'http://localhost/' });
  document = dom.window.document;
  calls = [];
  const context = new Proxy({}, {
    get(target, name) {
      return target[name] ?? ((...args) => {
        calls.push([name, ...args]);
      });
    }
  });
  document.querySelector('canvas').getContext = () => context;
  app = createDemo(document);
  await app.router.start({ links: document });
  calls.length = 0;
});

afterEach(() => {
  app.stop();
  dom.window.close();
});

const settle = () => new Promise(resolve => setImmediate(resolve));

test('route parameters become actual circle and rectangle dimensions in Canvas 2D', async () => {
  await app.router.navigate('/shapes/circle/75?color=9de6c4');
  assert.equal(app.router.current.params.radius, 75);
  assert.ok(calls.some(call => call[0] === 'arc' && call[3] === 75));
  assert.match(document.querySelector('#scene-description').textContent, /9de6c4/);
  calls.length = 0;
  await app.router.navigate('/shapes/rectangle/260/160?rotation=15');
  const expectedRectangle = ['rect', -130, -80, 260, 160];
  const hasRectangle = calls.some(call => {
    return JSON.stringify(call) === JSON.stringify(expectedRectangle);
  });
  const hasRotation = calls.some(call => {
    return call[0] === 'rotate' && Math.abs(call[1] - Math.PI / 12) < 1e-10;
  });

  assert.ok(hasRectangle);
  assert.ok(hasRotation);
  assert.equal(document.querySelector('#shape').value, 'rectangle');
});

test('native form submission builds the route and draws a polygon', async () => {
  const form = document.querySelector('form');
  form.elements.shape.value = 'polygon';
  form.elements.shape.dispatchEvent(new dom.window.Event('change'));
  form.elements.sides.value = '5';
  form.elements.radius.value = '120';
  form.dispatchEvent(new dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  }));
  await settle();
  assert.equal(app.router.current.path, '/shapes/polygon/5/120');
  assert.equal(app.router.current.params.sides, 5);
  assert.ok(calls.some(call => call[0] === 'closePath'));
  assert.match(document.querySelector('#scene-title').textContent, /Многоугольник/);
});

test('the guard denies scene changes without drawing or moving the URL', async () => {
  await app.router.navigate('/shapes/circle/80');
  document.querySelector('#lock').checked = true;
  calls.length = 0;
  assert.equal(await app.router.navigate('/shapes/rectangle/200/100'), false);
  assert.equal(dom.window.location.pathname, '/shapes/circle/80');
  assert.equal(calls.length, 0);
  assert.match(document.querySelector('#notice').textContent, /guard отменил/);
  document.querySelector('#lock').checked = false;
  assert.equal(await app.router.navigate('/shapes/rectangle/200/100'), true);
  assert.equal(document.querySelector('#notice').hidden, true);
});

test('bad geometry and query values preserve the scene and display actionable errors', async () => {
  await app.router.navigate('/shapes/circle/80');
  calls.length = 0;

  const invalidPaths = [
    '/shapes/circle/nope',
    '/shapes/polygon/2/100',
    '/shapes/circle/80?color=wrong',
    '/shapes/circle/80?rotation=nope'
  ];

  for (const path of invalidPaths) {
    await assert.rejects(app.router.navigate(path));
    assert.equal(document.querySelector('#notice').hidden, false);
    assert.equal(app.router.current.path, '/shapes/circle/80');
    assert.equal(calls.length, 0);
  }
});

test('ordinary links, wildcard paths and 404 render without any UI framework', async () => {
  document.querySelector('.presets a').click();
  await settle();
  assert.equal(app.router.current.path, '/shapes/circle/100');
  await app.router.navigate('/gallery/a/b/c');
  assert.equal(app.router.current.params.path, 'a/b/c');
  assert.equal(document.querySelector('#scene-detail').textContent, 'a/b/c');
  calls.length = 0;
  await app.router.navigate('/missing');
  assert.ok(calls.some(call => call[0] === 'fillText' && call[1] === '404'));
  assert.match(document.querySelector('canvas').getAttribute('aria-label'), /404/);
});
