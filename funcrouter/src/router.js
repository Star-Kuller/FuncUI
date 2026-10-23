import { createHistory } from './history.js';
import { createMatcher, guards } from './routes.js';

const cancelled = Symbol('cancelled');

export function createRouter(routes, options = {}) {
  const match = createMatcher(routes);
  const history = createHistory(options);
  const beforeEnter = guards(options.beforeEnter, 'beforeEnter');
  const beforeLeave = guards(options.beforeLeave, 'beforeLeave');

  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError('FuncRouter: onError must be a function.');
  }

  const subscribers = new Set();
  let running = false;
  let current = null;
  let position;
  let pending;
  let active;
  let cleanup;
  let removeLinks = () => {};

  function report(error) {
    try {
      if (options.onError) {
        options.onError(error);
      } else if (globalThis.reportError) {
        globalThis.reportError(error);
      } else {
        console.error(error);
      }
    } catch (reportingError) {
      console.error(reportingError);
    }
  }

  function dispose(callback) {
    try {
      callback?.();
    } catch (error) {
      report(error);
    }
  }

  function resolve(input, relativeTo = current?.url ?? history.read().url) {
    return match(history.toURL(input, relativeTo));
  }

  // У браузерного события нет вызывающего кода, который перехватит отказ
  // перехода. К этому моменту ошибка уже передана в onError.
  function follow(input, settings) {
    transition(input, settings).catch(() => {});
  }

  async function restore(token) {
    if (pending === token && running && position) {
      await history.restore(position);
    }

    return false;
  }

  function handleHistoryChange(target, error) {
    if (error) {
      report(error);
    } else {
      follow(target.url, {
        source: 'pop',
        target
      });
    }
  }

  function collectLeaveGuards(from) {
    if (!from) {
      return [];
    }

    const checks = [...beforeLeave];
    const leavingRoutes = [...from.matched].reverse();

    for (const record of leavingRoutes) {
      checks.push(...record.beforeLeave);
    }

    return checks;
  }

  async function checkGuards(checks, context) {
    for (const guard of checks) {
      const result = await abortable(guard(context), context.signal);

      if (context.signal.aborted || result === cancelled) {
        return cancelled;
      }

      if (result === false || typeof result === 'string' || result instanceof URL) {
        return result;
      }

      if (result !== undefined && result !== true) {
        throw new TypeError('FuncRouter: guards must return true, undefined, false, or a redirect URL.');
      }
    }

    return true;
  }

  function runHandler(to, from, controller) {
    const result = to.route.handler({
      ...to,
      from,
      signal: controller.signal
    });

    if (result !== undefined && typeof result !== 'function') {
      // Обработчик страницы синхронный. Асинхронная работа выполняется
      // в guards или в коде приложения с учётом переданного signal.
      if (typeof result?.catch === 'function') {
        result.catch(report);
      }

      throw new TypeError('FuncRouter: a route handler must return a cleanup function or undefined.');
    }

    if (active === controller && running && !controller.signal.aborted) {
      cleanup = result;
    } else {
      dispose(result);
    }
  }

  function notifySubscribers(to, controller) {
    for (const subscriber of [...subscribers]) {
      if (active !== controller || !running) {
        break;
      }

      try {
        subscriber(to);
      } catch (error) {
        report(error);
      }
    }
  }

  async function transition(input, { source = 'navigate', replace = false, target } = {}) {
    if (!running) {
      throw new Error('FuncRouter: call start() before navigate().');
    }

    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const { signal } = controller;
    let committed = false;

    try {
      await abortable(history.ready(), signal);

      if (signal.aborted) {
        return false;
      }

      const from = current;
      let to = resolve(input);
      let redirected = false;
      const visited = new Set();
      let leaveChecks = collectLeaveGuards(from);

      while (to) {
        if (to.url === current?.url && active && !active.signal.aborted) {
          if (source === 'pop') {
            if (redirected) {
              position = history.write(to.url, true);
            } else {
              position = history.accept(target);
            }
          }

          return true;
        }

        if (visited.has(to.url) || visited.size >= 16) {
          throw new Error('FuncRouter: redirect loop detected.');
        }

        visited.add(to.url);

        const context = { to, from, signal };
        const checks = [...leaveChecks, ...beforeEnter];

        for (const record of to.matched) {
          checks.push(...record.beforeEnter);
        }

        const result = await checkGuards(checks, context);

        if (signal.aborted || result === cancelled) {
          return false;
        }

        if (result === false) {
          controller.abort();

          return await restore(controller);
        }

        // Перенаправление меняет цель текущего перехода. Повторно спрашивать
        // подтверждение ухода с той же страницы не нужно.
        leaveChecks = [];

        if (typeof result === 'string' || result instanceof URL) {
          to = resolve(result, to.url);
          redirected = true;
          continue;
        }

        if (signal.aborted || !running) {
          return false;
        }

        if (source === 'pop' && !redirected) {
          position = history.accept(target);
        } else if (source === 'start' && !redirected) {
          position = history.read();
        } else {
          position = history.write(to.url, replace || redirected || source === 'pop');
        }

        const oldCleanup = cleanup;
        cleanup = undefined;
        active?.abort();
        active = controller;
        current = to;
        pending = null;
        committed = true;
        dispose(oldCleanup);

        if (signal.aborted || !running) {
          return false;
        }

        runHandler(to, from, controller);

        if (active === controller && running) {
          notifySubscribers(to, controller);
        }

        return true;
      }

      controller.abort();
      return await restore(controller);
    } catch (error) {
      if (signal.aborted) {
        return false;
      }

      controller.abort();

      if (!committed) {
        await restore(controller);
      }

      report(error);
      throw error;
    } finally {
      if (!committed) {
        controller.abort();
      }

      if (pending === controller) {
        pending = null;
      }
    }
  }

  return {
    get current() {
      return current;
    },

    resolve(input) {
      return resolve(input);
    },

    async start({ links } = {}) {
      if (running) {
        return false;
      }

      try {
        position = history.start(handleHistoryChange);
        running = true;
        removeLinks = history.listenLinks(links, follow);
      } catch (error) {
        this.stop();
        throw error;
      }

      return transition(position.url, { source: 'start' });
    },

    navigate(input, settings) {
      return transition(input, settings);
    },

    subscribe(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('FuncRouter: subscriber must be a function.');
      }

      subscribers.add(callback);

      return () => subscribers.delete(callback);
    },

    stop() {
      running = false;
      pending?.abort();
      pending = null;
      active?.abort();
      active = null;
      removeLinks();
      removeLinks = () => {};
      history.stop();
      const oldCleanup = cleanup;
      cleanup = undefined;
      current = null;
      dispose(oldCleanup);
    }
  };
}

function abortable(value, signal) {
  if (signal.aborted) {
    return Promise.resolve(cancelled);
  }

  return new Promise((resolve, reject) => {
    function abort() {
      finish(resolve, cancelled);
    }

    function finish(callback, result) {
      signal.removeEventListener('abort', abort);
      callback(result);
    }

    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then(
      result => finish(resolve, result),
      error => finish(reject, error)
    );
  });
}
