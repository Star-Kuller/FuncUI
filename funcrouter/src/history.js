let nextSession = 0;
const stateKey = '__funcrouter';

// Браузерные детали остаются в этом модуле. Сопоставлению путей и guards
// не нужен document.
export function createHistory({
  mode = 'history',
  base = '/',
  initial = '/',
  window: providedWindow
} = {}) {
  if (!['history', 'hash', 'memory'].includes(mode)) {
    throw new TypeError('FuncRouter: mode must be history, hash, or memory.');
  }
  if (typeof base !== 'string' || !base.startsWith('/') || /[?#]/.test(base)) {
    throw new TypeError('FuncRouter: base must be an absolute pathname.');
  }

  const prefix = base.replace(/\/+$/, '');
  let browser;
  let session;
  const initialURL = toURL(initial);
  let memory = {
    url: `${initialURL.pathname}${initialURL.search}${initialURL.hash}`,
    index: 0
  };
  let notify;
  let lastObserved;
  let restoring;

  function origin() {
    const currentWindow = browser ?? providedWindow ?? globalThis.window;

    return currentWindow?.location.origin ?? 'http://funcrouter.local';
  }

  function toURL(input, relativeTo = '/') {
    if (typeof input !== 'string' && !(input instanceof URL)) {
      throw new TypeError('FuncRouter: URL must be a string or URL.');
    }

    const url = new URL(input, new URL(relativeTo, origin()));

    if (url.origin !== origin() || !['http:', 'https:'].includes(url.protocol)) {
      throw new TypeError('FuncRouter: navigation must stay on the same origin.');
    }

    const absolute = input instanceof URL || /^(?:[A-Za-z][A-Za-z\d+.-]*:|\/\/)/.test(input);

    if (absolute && mode !== 'memory') {
      if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
        throw new TypeError('FuncRouter: URL is outside the configured base.');
      }

      if (mode === 'hash') {
        if (url.hash && !url.hash.startsWith('#/')) {
          throw new TypeError('FuncRouter: hash routes must start with #/.');
        }

        return new URL(url.hash.slice(1) || '/', origin());
      }

      url.pathname = url.pathname.slice(prefix.length) || '/';
    }

    return url;
  }

  function locationURL(href = browser.location.href) {
    const url = new URL(href);

    if (url.origin !== browser.location.origin || !['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
      return null;
    }

    if (mode === 'hash') {
      if (url.hash && !url.hash.startsWith('#/')) {
        return null;
      }

      return url.hash.slice(1) || '/';
    }

    return `${url.pathname.slice(prefix.length) || '/'}${url.search}${url.hash}`;
  }

  function href(url) {
    if (mode === 'hash') {
      return `${browser.location.pathname}${browser.location.search}#${url}`;
    }

    return `${prefix}${url}`;
  }

  function read() {
    if (mode === 'memory' || !browser) {
      return { ...memory };
    }

    const marker = browser.history.state?.[stateKey];
    const url = locationURL();

    if (url === null) {
      throw new Error('FuncRouter: browser URL is outside the configured base or hash route.');
    }

    return {
      url,
      index: marker?.session === session ? marker.index : null
    };
  }

  function writeState(url, index, replace) {
    const state = browser.history.state;
    const method = replace ? 'replaceState' : 'pushState';
    const nextState = {
      ...(state && typeof state === 'object' ? state : {}),
      [stateKey]: {
        session,
        index
      }
    };

    browser.history[method](nextState, '', href(url));
    lastObserved = read();

    return lastObserved;
  }

  function observe() {
    let target;

    try {
      target = read();
    } catch (error) {
      notify(null, error);
      return;
    }

    if (restoring) {
      const expected = restoring.position;
      const finish = restoring.finish;
      restoring = null;
      lastObserved = target;
      finish();

      if (target.url === expected.url && target.index === expected.index) {
        return;
      }

      notify(target);
      return;
    }

    // Один переход по hash-истории может вызвать и popstate, и hashchange.
    if (lastObserved?.url === target.url && lastObserved.index === target.index) {
      return;
    }

    lastObserved = target;
    notify(target);
  }

  return {
    toURL,
    read,

    start(onChange) {
      notify = onChange;

      if (mode === 'memory') {
        return read();
      }

      browser = providedWindow ?? globalThis.window;

      if (!browser?.history || !browser?.location) {
        throw new Error('FuncRouter: browser modes need a window; use mode: memory outside a browser.');
      }

      session = `${Date.now()}-${++nextSession}`;
      const position = read();
      writeState(position.url, 0, true);
      browser.addEventListener('popstate', observe);

      if (mode === 'hash') {
        browser.addEventListener('hashchange', observe);
      }

      return read();
    },

    write(url, replace = false) {
      const position = read();
      const index = (position.index ?? 0) + (replace ? 0 : 1);

      if (mode === 'memory') {
        memory = { url, index };
        return read();
      }

      return writeState(url, index, replace);
    },

    accept(position) {
      if (mode === 'memory' || position.index !== null) {
        return position;
      }

      // Запись, созданная вне роутера, начинает новый участок истории,
      // позиции которого роутер может отслеживать.
      session = `${Date.now()}-${++nextSession}`;

      return writeState(position.url, 0, true);
    },

    restore(position) {
      const actual = read();

      if (actual.url === position.url && actual.index === position.index) {
        return Promise.resolve();
      }

      if (mode === 'memory') {
        memory = { ...position };
        return Promise.resolve();
      }

      if (actual.index === null || position.index === null || actual.index === position.index) {
        writeState(position.url, position.index ?? 0, true);
        return Promise.resolve();
      }

      const promise = new Promise(finish => {
        restoring = { position, finish };
      });
      restoring.promise = promise;
      browser.history.go(position.index - actual.index);

      return promise;
    },

    ready() {
      return restoring?.promise ?? Promise.resolve();
    },

    listenLinks(root, onNavigate) {
      if (!root) {
        return () => {};
      }

      if (mode === 'memory' || !root.addEventListener) {
        throw new TypeError('FuncRouter: links needs a DOM event target and a browser history mode.');
      }

      function click(event) {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey
        ) {
          return;
        }

        const anchor = event.composedPath().find(node => node.matches?.('a[href]'));

        if (!anchor || anchor.hasAttribute('download') || anchor.relList.contains('external')) {
          return;
        }

        if (anchor.target && anchor.target.toLowerCase() !== '_self') {
          return;
        }

        const raw = anchor.getAttribute('href');

        if (!raw || (raw.startsWith('#') && (mode !== 'hash' || !raw.startsWith('#/')))) {
          return;
        }

        const url = new URL(anchor.href);
        const target = locationURL(url.href);

        if (target === null) {
          return;
        }

        if (
          mode === 'history' &&
          url.pathname === browser.location.pathname &&
          url.search === browser.location.search &&
          url.hash
        ) {
          return;
        }

        event.preventDefault();
        onNavigate(target);
      }

      root.addEventListener('click', click);

      return () => root.removeEventListener('click', click);
    },

    stop() {
      browser?.removeEventListener('popstate', observe);
      browser?.removeEventListener('hashchange', observe);
      restoring?.finish();
      restoring = null;
      notify = null;
    }
  };
}
