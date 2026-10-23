import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, route } from 'funcrouter';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

test('start, navigation, cleanup, subscriptions and restart have independent lifetimes', async () => {
  const events = [];
  const router = createRouter([
    route('/', ({ signal }) => {
      events.push('home');

      return () => events.push(`clean:${signal.aborted}`);
    }),
    route('/users/:id', ({ params }) => {
      events.push(`user:${params.id}`);
    })
  ], { mode: 'memory' });
  const unsubscribe = router.subscribe(match => events.push(`visit:${match.path}`));
  assert.equal(router.current, null);
  assert.equal(await router.start(), true);
  assert.equal(await router.start(), false);
  assert.equal(await router.navigate('/users/42'), true);
  assert.deepEqual(events, ['home', 'visit:/', 'clean:true', 'user:42', 'visit:/users/42']);
  assert.equal(await router.navigate('/users/42'), true);
  assert.equal(await router.navigate('/unknown'), false);
  assert.equal(router.current.path, '/users/42');
  unsubscribe();
  router.stop();
  router.stop();
  assert.equal(router.current, null);
  await assert.rejects(router.navigate('/'), /start/);
  await router.start();
  assert.equal(router.current.path, '/users/42');
  router.stop();
});

test('global and nested guards run in leave then enter order', async () => {
  const events = [];
  function guard(name) {
    return function recordGuard() {
      events.push(name);
    };
  }

  const router = createRouter([
    route('/old', {
      beforeLeave: [guard('leave old')]
    }, () => {}),
    route('/users', {
      beforeEnter: [guard('enter users')],
      beforeLeave: [guard('leave users')],
      children: [
        route(':id', {
          beforeEnter: [guard('enter id')],
          beforeLeave: [guard('leave id')]
        }, () => {})
      ]
    })
  ], {
    mode: 'memory',
    initial: '/old',
    beforeEnter: [guard('global enter')],
    beforeLeave: [guard('global leave')]
  });
  await router.start();
  events.length = 0;
  await router.navigate('/users/1');
  assert.deepEqual(events, ['global leave', 'leave old', 'global enter', 'enter users', 'enter id']);
  events.length = 0;
  await router.navigate('/users/2');
  assert.deepEqual(events, ['global leave', 'leave id', 'leave users', 'global enter', 'enter users', 'enter id']);
  router.stop();
});

test('a denied guard keeps the current page alive and does not notify subscribers', async () => {
  let signal;
  let changes = 0;
  const router = createRouter([
    route('/', context => {
      signal = context.signal;
    }),
    route('/private', {
      beforeEnter: [async () => false]
    }, () => assert.fail('private handler'))
  ], { mode: 'memory' });
  router.subscribe(() => changes++);
  await router.start();
  assert.equal(await router.navigate('/private'), false);
  assert.equal(router.current.path, '/');
  assert.equal(signal.aborted, false);
  assert.equal(changes, 1);
  router.stop();
  assert.equal(signal.aborted, true);
});

test('a redirect checks destination guards and calls only the final handler', async () => {
  const events = [];

  function checkLogin() {
    events.push('login guard');
  }

  function showLogin({ query }) {
    events.push(query.get('next'));
  }

  const router = createRouter([
    route('/', () => {}),
    route('/private', {
      beforeEnter: [() => '/login?next=%2Fprivate']
    }, () => assert.fail()),
    route('/login', {
      beforeEnter: [checkLogin]
    }, showLogin)
  ], { mode: 'memory' });
  await router.start();
  assert.equal(await router.navigate('/private'), true);
  assert.deepEqual(events, ['login guard', '/private']);
  assert.equal(router.current.path, '/login');
  router.stop();
});

test('a redirect does not ask the same exit guard twice', async () => {
  let confirmations = 0;

  function confirmLeave() {
    confirmations++;

    return true;
  }

  const router = createRouter([
    route('/', {
      beforeLeave: [confirmLeave]
    }, () => {}),
    route('/private', {
      beforeEnter: [() => '/login']
    }, () => assert.fail()),
    route('/login', () => {})
  ], { mode: 'memory' });
  await router.start();
  await router.navigate('/private');
  assert.equal(confirmations, 1);
  router.stop();
});

test('handler errors cancel its signal, do not notify, and allow retrying the same URL', async () => {
  const errors = [];
  let fail = true;
  let signal;
  const router = createRouter([
    route('/', () => {}),
    route('/retry', context => {
      signal = context.signal;

      if (fail) {
        throw new Error('render');
      }
    })
  ], {
    mode: 'memory',
    onError: error => errors.push(error.message)
  });
  await router.start();
  let visits = 0;
  router.subscribe(() => visits++);
  await assert.rejects(router.navigate('/retry'), /render/);
  assert.equal(signal.aborted, true);
  assert.equal(visits, 0);
  assert.equal(router.current.path, '/retry');
  fail = false;
  await router.navigate('/retry');
  assert.equal(signal.aborted, false);
  assert.equal(visits, 1);
  assert.deepEqual(errors, ['render']);
  router.stop();
});

test('redirect loops and invalid guard results report errors and preserve the active route', async () => {
  const errors = [];
  const router = createRouter([
    route('/', () => {}),
    route('/a', {
      beforeEnter: [() => '/b']
    }, () => {}),
    route('/b', {
      beforeEnter: [() => '/a']
    }, () => {}),
    route('/invalid', {
      beforeEnter: [() => 123]
    }, () => {})
  ], {
    mode: 'memory',
    onError: error => errors.push(error)
  });
  await router.start();
  await assert.rejects(router.navigate('/a'), /redirect loop/);
  await assert.rejects(router.navigate('/invalid'), /guards must return/);
  assert.equal(errors.length, 2);
  assert.equal(router.current.path, '/');
  router.stop();
});

test('a newer navigation cancels a waiting guard even when its promise never settles', async () => {
  const entered = deferred();
  let guardSignal;
  const rendered = [];

  function waitForever({ signal }) {
    guardSignal = signal;
    entered.resolve();

    return new Promise(() => {});
  }

  const router = createRouter([
    route('/', () => {}),
    route('/slow', {
      beforeEnter: [waitForever]
    }, () => {
      rendered.push('slow');
    }),
    route('/fast', () => {
      rendered.push('fast');
    })
  ], { mode: 'memory' });
  await router.start();
  const slow = router.navigate('/slow');
  await entered.promise;
  assert.equal(await router.navigate('/fast'), true);
  assert.equal(await slow, false);
  assert.equal(guardSignal.aborted, true);
  assert.deepEqual(rendered, ['fast']);
  router.stop();
});

test('late guard failures after cancellation are handled without reporting an obsolete error', async () => {
  const entered = deferred();
  const gate = deferred();
  const errors = [];

  function waitForGate() {
    entered.resolve();

    return gate.promise;
  }

  const router = createRouter([
    route('/', () => {}),
    route('/slow', {
      beforeEnter: [waitForGate]
    }, () => assert.fail()),
    route('/fast', () => {})
  ], {
    mode: 'memory',
    onError: error => errors.push(error)
  });
  await router.start();
  const slow = router.navigate('/slow');
  await entered.promise;
  await router.navigate('/fast');
  gate.reject(new Error('obsolete'));
  assert.equal(await slow, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  router.stop();
});

test('stop cancels a pending start and releases active resources once', async () => {
  const entered = deferred();

  function waitForever() {
    entered.resolve();

    return new Promise(() => {});
  }

  const router = createRouter([
    route('/', {
      beforeEnter: [waitForever]
    }, () => assert.fail())
  ], { mode: 'memory' });
  const started = router.start();
  await entered.promise;
  router.stop();
  assert.equal(await started, false);
  assert.equal(router.current, null);
});

test('an invalid initial address reports the error and still allows a later valid navigation', async () => {
  const errors = [];
  const router = createRouter([
    route('/users/:id', {
      params: { id: Number }
    }, () => {})
  ], {
    mode: 'memory',
    initial: '/users/invalid',
    onError: error => errors.push(error)
  });
  await assert.rejects(router.start(), /invalid value/);
  assert.equal(router.current, null);
  assert.equal(await router.navigate('/users/1'), true);
  assert.equal(router.current.params.id, 1);
  assert.equal(errors.length, 1);
  router.stop();
});

test('resolve is pure and routers do not share navigation state', async () => {
  let guards = 0;
  let renders = 0;
  function countGuard() {
    guards++;
  }

  function countRender() {
    renders++;
  }

  const routes = [
    route('/:id', {
      beforeEnter: [countGuard]
    }, countRender)
  ];
  const first = createRouter(routes, { mode: 'memory', initial: '/one' });
  const second = createRouter(routes, { mode: 'memory', initial: '/two' });
  assert.equal(first.resolve('/three').params.id, 'three');
  assert.equal(guards, 0);
  assert.equal(renders, 0);
  await first.start();
  await second.start();
  await first.navigate('/four');
  assert.equal(first.current.params.id, 'four');
  assert.equal(second.current.params.id, 'two');
  first.stop();
  second.stop();
});

test('cleanup and subscriber errors do not prevent the next handler or other subscribers', async () => {
  const errors = [];
  const events = [];
  const router = createRouter([
    route('/', () => {
      return function cleanup() {
        throw new Error('cleanup');
      };
    }),
    route('/next', () => {
      events.push('render');
    })
  ], {
    mode: 'memory',
    onError: error => errors.push(error.message)
  });
  await router.start();
  router.subscribe(() => {
    throw new Error('subscriber');
  });
  router.subscribe(() => events.push('notification'));
  await router.navigate('/next');
  assert.deepEqual(events, ['render', 'notification']);
  assert.deepEqual(errors, ['cleanup', 'subscriber']);
  router.stop();
});
