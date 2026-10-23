import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRouter, route } from 'funcrouter';

function nextVisit(router, path) {
  return new Promise(resolve => {
    const unsubscribe = router.subscribe(match => {
      if (match.path === path) {
        unsubscribe();
        resolve(match);
      }
    });
  });
}

function traversal(window) {
  return new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
}

test('history supports initial deep links, replace, back, forward and preserved user state', async t => {
  const dom = new JSDOM('', { url: 'https://demo.test/app/users/1?tab=bio' });
  const { window } = dom;
  window.history.replaceState({ application: 42 }, '');

  const router = createRouter([
    route('/users/:id', () => {})
  ], {
    window,
    base: '/app/'
  });

  t.after(() => {
    router.stop();
    window.close();
  });

  await router.start();
  assert.equal(router.current.params.id, '1');
  assert.equal(router.resolve('https://demo.test/app/users/8').params.id, '8');
  assert.throws(() => router.resolve('https://demo.test/outside'), /outside.*base/);
  assert.equal(window.history.state.application, 42);
  await router.navigate('/users/2');
  assert.equal(window.location.pathname, '/app/users/2');
  const length = window.history.length;
  await router.navigate('/users/3', { replace: true });
  assert.equal(window.history.length, length);
  const back = nextVisit(router, '/users/1');
  window.history.back();
  await back;
  const forward = nextVisit(router, '/users/3');
  window.history.forward();
  await forward;
  assert.equal(window.location.pathname, '/app/users/3');
});

test('a denied back transition restores the old history position and leaves Forward intact', async t => {
  const dom = new JSDOM('', { url: 'https://demo.test/' });
  const { window } = dom;
  let blocked = true;
  let blockedGuard;
  const blockedAttempt = new Promise(resolve => {
    blockedGuard = resolve;
  });

  function checkLeaving() {
    if (blocked) {
      blockedGuard();

      return false;
    }
  }

  const router = createRouter([
    route('/', () => {}),
    route('/edit', {
      beforeLeave: [checkLeaving]
    }, () => {})
  ], { window });
  t.after(() => {
    router.stop();
    window.close();
  });

  await router.start();
  await router.navigate('/edit');
  window.history.back();
  await blockedAttempt;
  await traversal(window);
  assert.equal(window.location.pathname, '/edit');
  assert.equal(router.current.path, '/edit');
  blocked = false;
  const back = nextVisit(router, '/');
  window.history.back();
  await back;
  const forward = nextVisit(router, '/edit');
  window.history.forward();
  await forward;
});

test('a redirect replaces its source and does not create an inaccessible history entry', async t => {
  const dom = new JSDOM('', { url: 'https://demo.test/' });
  const { window } = dom;
  const router = createRouter([
    route('/', () => {}),
    route('/private', {
      beforeEnter: [() => '/login']
    }, () => assert.fail()),
    route('/login', () => {})
  ], { window });
  t.after(() => {
    router.stop();
    window.close();
  });

  await router.start();
  const length = window.history.length;
  await router.navigate('/private');
  assert.equal(window.history.length, length);
  assert.equal(window.location.pathname, '/login');
});

test('hash routing handles direct hashes, back/forward, and does not render twice per traversal', async t => {
  const dom = new JSDOM('', { url: 'https://demo.test/index.html#/shapes/circle' });
  const { window } = dom;
  const visits = [];
  const router = createRouter([
    route('/shapes/:shape', ({ params }) => {
      visits.push(params.shape);
    })
  ], {
    window,
    mode: 'hash'
  });

  t.after(() => {
    router.stop();
    window.close();
  });

  await router.start();
  await router.navigate('/shapes/square');
  assert.equal(window.location.hash, '#/shapes/square');
  const back = nextVisit(router, '/shapes/circle');
  window.history.back();
  await back;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(visits, ['circle', 'square', 'circle']);
  const direct = nextVisit(router, '/shapes/triangle');
  window.location.hash = '/shapes/triangle';
  await direct;
  assert.equal(router.current.params.shape, 'triangle');
});

test('link interception respects normal browser gestures, targets, downloads, fragments and base', async t => {
  const dom = new JSDOM('<a href="/app/users/2"><span>Open</span></a>', {
    url: 'https://demo.test/app/users/1'
  });
  const { window } = dom;
  const errors = [];
  const router = createRouter([
    route('/users/:id', () => {})
  ], {
    window,
    base: '/app',
    onError: error => errors.push(error)
  });

  t.after(() => {
    router.stop();
    window.close();
  });

  const root = window.document.body;
  await router.start({ links: root });
  const anchor = window.document.querySelector('a');

  function click(settings = {}) {
    const event = new window.MouseEvent('click', {
      bubbles: true,
      composed: true,
      cancelable: true,
      button: 0,
      ...settings
    });

    anchor.firstElementChild.dispatchEvent(event);

    return event.defaultPrevented;
  }

  // После проверки перехвата роутером отменяем штатную навигацию jsdom.
  window.document.addEventListener('click', event => event.preventDefault());

  // Этот listener выполнится сразу после обработчика роутера на том же root.
  let handled;

  root.addEventListener('click', event => {
    handled = event.defaultPrevented;
  });

  const visit = nextVisit(router, '/users/2');
  click();
  assert.equal(handled, true);
  await visit;

  const browserGestures = [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 }
  ];

  for (const settings of browserGestures) {
    click(settings);
    assert.equal(handled, false);
  }
  const nativeLinkAttributes = [
    ['target', '_blank'],
    ['download', 'file'],
    ['rel', 'external']
  ];

  for (const [name, value] of nativeLinkAttributes) {
    anchor.setAttribute(name, value);
    click();
    assert.equal(handled, false);
    anchor.removeAttribute(name);
  }
  const nativeURLs = [
    '#section',
    '/outside',
    'https://other.test/app/users/3',
    'mailto:test@example.test',
    'blob:https://demo.test/image'
  ];

  for (const url of nativeURLs) {
    anchor.href = url;
    click();
    assert.equal(handled, false);
  }
  assert.deepEqual(errors, []);
});

test('a pop redirect to the already active page also restores the browser URL', async t => {
  const dom = new JSDOM('', { url: 'https://demo.test/private' });
  const { window } = dom;
  let authorized = true;
  let attempted;
  const guardRan = new Promise(resolve => {
    attempted = resolve;
  });

  function requireAuthorization() {
    if (authorized) {
      return true;
    }

    attempted();

    return '/other';
  }

  const router = createRouter([
    route('/private', {
      beforeEnter: [requireAuthorization]
    }, () => {}),
    route('/other', () => {})
  ], { window });
  t.after(() => {
    router.stop();
    window.close();
  });

  await router.start();
  await router.navigate('/other');
  authorized = false;
  window.history.back();
  await guardRan;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(router.current.path, '/other');
  assert.equal(window.location.pathname, '/other');
});

test('stopped routers release link and history listeners', async t => {
  const dom = new JSDOM('<a href="/next">Next</a>', {
    url: 'https://demo.test/'
  });
  const { window } = dom;
  let renders = 0;
  const router = createRouter([
    route('*', () => {
      renders++;
    })
  ], { window });
  t.after(() => window.close());
  await router.start({ links: window.document });
  router.stop();
  const event = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  window.document.querySelector('a').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  assert.equal(renders, 1);
});
