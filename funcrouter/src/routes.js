export function route(path, options = {}, handler) {
  if (typeof options === 'function') {
    handler = options;
    options = {};
  }

  if (
    typeof path !== 'string' ||
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw new TypeError('FuncRouter route(): expected a path and an options object or handler.');
  }
  if (handler !== undefined && typeof handler !== 'function') {
    throw new TypeError('FuncRouter route(): handler must be a function.');
  }

  return { ...options, path, handler };
}

export function guards(value, name) {
  if (value === undefined) {
    return [];
  }

  const list = Array.isArray(value) ? [...value] : [value];

  if (list.some(guard => typeof guard !== 'function')) {
    throw new TypeError(`FuncRouter: ${name} must contain functions.`);
  }

  return list;
}

export function createMatcher(routes) {
  const candidates = [];
  const patterns = new Set();

  function visit(list, parentTokens = [], parents = [], parentParsers = {}) {
    if (!Array.isArray(list)) {
      throw new TypeError('FuncRouter: routes and children must be arrays.');
    }

    for (const definition of list) {
      if (!definition || typeof definition.path !== 'string') {
        throw new TypeError('FuncRouter: each route needs a string path.');
      }
      if (parents.length && definition.path.startsWith('/')) {
        throw new TypeError('FuncRouter: child paths must be relative to their parent.');
      }

      const tokens = [...parentTokens, ...tokenize(definition.path)];
      const names = tokens
        .filter(token => token.name)
        .map(token => token.name);

      if (new Set(names).size !== names.length) {
        throw new TypeError(`FuncRouter: duplicate parameter in ${definition.path}.`);
      }
      const wildcardBeforeEnd = tokens.some((token, index) => {
        return token.kind === 'wildcard' && index !== tokens.length - 1;
      });

      if (wildcardBeforeEnd) {
        throw new TypeError('FuncRouter: a wildcard must be the last path segment.');
      }

      const parsers = { ...parentParsers, ...definition.params };

      for (const [name, parser] of Object.entries(parsers)) {
        if (!names.includes(name) || typeof parser !== 'function') {
          throw new TypeError(`FuncRouter: invalid parser for parameter ${name}.`);
        }
      }

      const record = {
        ...definition,
        beforeEnter: guards(definition.beforeEnter, 'beforeEnter'),
        beforeLeave: guards(definition.beforeLeave, 'beforeLeave')
      };
      const matched = [...parents, record];

      if (record.handler !== undefined) {
        if (typeof record.handler !== 'function') {
          throw new TypeError('FuncRouter: handler must be a function.');
        }

        const pattern = JSON.stringify(tokens.map(token => [token.kind, token.value]));

        if (patterns.has(pattern)) {
          throw new TypeError(`FuncRouter: duplicate route ${definition.path}.`);
        }

        patterns.add(pattern);
        candidates.push({ tokens, matched, parsers });
      } else if (!record.children?.length) {
        throw new TypeError(`FuncRouter: route ${definition.path} needs a handler or children.`);
      }

      if (record.children !== undefined) {
        visit(record.children, tokens, matched, parsers);
      }
    }
  }

  visit(routes);
  candidates.sort(compareSpecificity);

  return function match(url) {
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const segments = path === '/'
      ? []
      : path.slice(1).split('/').map(decodeURIComponent);

    for (const candidate of candidates) {
      const entries = matchSegments(candidate.tokens, segments);

      if (!entries) {
        continue;
      }

      const params = parseParameters(entries, candidate.parsers);

      return Object.freeze({
        url: `${url.pathname}${url.search}${url.hash}`,
        path,
        params: Object.freeze(params),
        query: new URLSearchParams(url.search),
        hash: url.hash,
        route: candidate.matched.at(-1),
        matched: Object.freeze([...candidate.matched])
      });
    }

    return null;
  };
}

function parseParameters(entries, parsers) {
  const params = Object.fromEntries(entries);

  for (const [name, parser] of Object.entries(parsers)) {
    if (!Object.hasOwn(params, name)) {
      continue;
    }

    const value = parser(params[name]);

    if (typeof value?.then === 'function') {
      // Ошибка parser уже сообщается ниже. Поздний отказ Promise не должен
      // дополнительно создавать необработанную ошибку.
      Promise.resolve(value).catch(() => {});

      throw new TypeError(`FuncRouter: parser for parameter ${name} must be synchronous.`);
    }

    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new TypeError(`FuncRouter: invalid value for parameter ${name}.`);
    }

    params[name] = value;
  }

  return params;
}

function tokenize(path) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');

  if (!trimmed) {
    return [];
  }

  return trimmed.split('/').map(parseSegment);
}

function parseSegment(segment) {
  if (segment === '*') {
    return { kind: 'wildcard', name: 'path' };
  }

  if (segment.startsWith('*') || segment.startsWith(':')) {
    const wildcard = segment[0] === '*';
    const optional = !wildcard && segment.endsWith('?');
    const name = segment.slice(1, optional ? -1 : undefined);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new TypeError(`FuncRouter: invalid path segment ${segment}.`);
    }

    let kind = 'parameter';

    if (wildcard) {
      kind = 'wildcard';
    } else if (optional) {
      kind = 'optional';
    }

    return { kind, name };
  }

  if (!segment || /[?#:*]/.test(segment)) {
    throw new TypeError(`FuncRouter: invalid path segment ${segment}.`);
  }

  return { kind: 'static', value: decodeURIComponent(segment) };
}

function compareSpecificity(first, second) {
  const rank = {
    static: 4,
    parameter: 3,
    optional: 2,
    wildcard: 1
  };
  const length = Math.max(first.tokens.length, second.tokens.length);

  for (let index = 0; index <= length; index++) {
    const firstRank = rank[first.tokens[index]?.kind] ?? 5;
    const secondRank = rank[second.tokens[index]?.kind] ?? 5;
    const difference = secondRank - firstRank;

    if (difference) {
      return difference;
    }
  }

  return 0;
}

function matchSegments(tokens, segments, tokenIndex = 0, segmentIndex = 0) {
  if (tokenIndex === tokens.length) {
    return segmentIndex === segments.length ? [] : null;
  }

  const token = tokens[tokenIndex];

  if (token.kind === 'wildcard') {
    const remainingPath = segments.slice(segmentIndex).join('/');

    return [[token.name, remainingPath]];
  }

  if (segmentIndex < segments.length && segments[segmentIndex] !== '') {
    const segment = segments[segmentIndex];

    if (token.kind !== 'static' || token.value === segment) {
      const rest = matchSegments(tokens, segments, tokenIndex + 1, segmentIndex + 1);

      if (rest) {
        if (token.kind === 'static') {
          return rest;
        }

        return [[token.name, segment], ...rest];
      }
    }
  }

  if (token.kind === 'optional') {
    return matchSegments(tokens, segments, tokenIndex + 1, segmentIndex);
  }

  return null;
}
