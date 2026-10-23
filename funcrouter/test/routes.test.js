import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, route } from 'funcrouter';

const page = () => {};
const routerFor = routes => createRouter(routes, { mode: 'memory' });

test('specific routes win over parameters and wildcards regardless of declaration order', () => {
  const fallback = route('*', page);
  const files = route('/files/*rest', page);
  const user = route('/users/:id', page);
  const create = route('/users/new', page);
  const router = routerFor([fallback, files, user, create]);
  assert.equal(router.resolve('/users/new').route.handler, create.handler);
  assert.equal(router.resolve('/users/new').route.path, '/users/new');
  assert.equal(router.resolve('/users/42').route.path, '/users/:id');
  assert.equal(router.resolve('/files/a/b').params.rest, 'a/b');
  assert.equal(router.resolve('/missing').route.path, '*');
  assert.equal(router.resolve('/files').params.rest, '');
});

test('nested routes inherit parameters, parsers and the chain of guards', () => {
  const guard = () => true;
  const router = routerFor([
    route('/teams/:team', {
      params: { team: Number },
      beforeEnter: [guard],
      children: [
        route('', page),
        route('users/:user', {
          params: { user: Number }
        }, page)
      ]
    })
  ]);
  const match = router.resolve('/teams/2/users/7/?tag=a&tag=b#bio');
  assert.deepEqual(match.params, { team: 2, user: 7 });
  assert.equal(match.path, '/teams/2/users/7');
  assert.deepEqual(match.query.getAll('tag'), ['a', 'b']);
  assert.equal(match.hash, '#bio');
  assert.equal(match.matched[0].beforeEnter[0], guard);
  assert.equal(router.resolve('/teams/2').route.path, '');
});

test('optional segments can be omitted before a static suffix', () => {
  const router = routerFor([
    route('/', page),
    route('/:language?/help', page),
    route('/users/:id?', page)
  ]);
  assert.deepEqual(router.resolve('/help').params, {});
  assert.deepEqual(router.resolve('/ru/help').params, { language: 'ru' });
  assert.deepEqual(router.resolve('/users').params, {});
  assert.deepEqual(router.resolve('/users/42').params, { id: '42' });
  assert.equal(router.resolve('/').route.path, '/');
  assert.equal(router.resolve('/help/extra'), null);
});

test('required parameters do not consume empty segments and wildcards preserve internal slashes', () => {
  const router = routerFor([
    route('/users/:id/details', page),
    route('/files/*rest', page)
  ]);
  assert.equal(router.resolve('/users//details'), null);
  assert.equal(router.resolve('/files/a//b').params.rest, 'a//b');
});

test('decoding is segment based, preserves encoded slashes and rejects malformed encodings', () => {
  const router = routerFor([route('/files/:name', page)]);
  assert.equal(router.resolve('/files/a%2Fb').params.name, 'a/b');
  assert.equal(router.resolve('/files/%D0%BA%D0%BE%D1%82').params.name, 'кот');
  assert.throws(() => router.resolve('/files/%zz'), URIError);
});

test('parsers validate a selected route instead of silently falling through to 404', () => {
  const router = routerFor([
    route('/users/:id', {
      params: { id: Number }
    }, page),
    route('*', page)
  ]);

  assert.equal(router.resolve('/users/12').params.id, 12);
  assert.throws(() => router.resolve('/users/invalid'), /invalid value.*id/);

  const undefinedParser = routerFor([
    route('/:id', {
      params: { id: () => undefined }
    }, page)
  ]);

  assert.throws(() => undefinedParser.resolve('/a'), /invalid value/);

  const asyncParser = routerFor([
    route('/:id', {
      params: {
        id: () => Promise.reject(new Error('async parser'))
      }
    }, page)
  ]);

  assert.throws(() => asyncParser.resolve('/a'), /synchronous/);
});

test('route configurations fail early with actionable errors', () => {
  assert.throws(() => routerFor([route('/empty')]), /handler or children/);
  assert.throws(() => routerFor([route('/:id/:id', page)]), /duplicate parameter/);
  assert.throws(() => routerFor([route('/a/*rest/b', page)]), /wildcard.*last/);
  assert.throws(() => {
    routerFor([
      route('/a', {
        children: [route('/b', page)]
      })
    ]);
  }, /relative/);
  assert.throws(() => routerFor([route('/:id', page), route('/:other', page)]), /duplicate route/);
  assert.throws(() => {
    routerFor([
      route('/a', {
        params: { missing: Number }
      }, page)
    ]);
  }, /invalid parser/);

  assert.throws(() => {
    routerFor([
      route('/a', {
        beforeEnter: [false]
      }, page)
    ]);
  }, /functions/);
});

test('parameter names cannot change the object prototype', () => {
  const router = routerFor([route('/:__proto__', page)]);
  const match = router.resolve('/safe');
  assert.equal(Object.getPrototypeOf(match.params), Object.prototype);
  assert.equal(match.params.__proto__, 'safe');
  assert.equal(Object.isFrozen(match.params), true);
});
