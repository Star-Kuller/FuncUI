import { createEffect, track, trigger, untrack } from './effect.js';
import { reactive } from './reactivity.js';

export function createItemReference(item, owner) {
  const reference = reactive({ current: item });
  const dependencies = {};

  const propertyWatchers = new Map();
  const presenceWatchers = new Map();
  const keysDependency = Symbol('item keys');
  let keysWatcher;

  function readProperty(key) {
    const current = reference.current;

    return Reflect.get(current, key, current);
  }

  function watch(key, read, equals = Object.is) {
    let initialized = false;
    let previous;

    const effect = createEffect(() => {
      const value = read();

      if (initialized && !equals(previous, value)) {
        trigger(dependencies, new Set([key]));
      }

      initialized = true;
      previous = value;
    }, owner);

    effect.run();

    return effect;
  }

  const proxy = new Proxy(Object.create(null), {
    get(target, key) {
      const isTracked = !owner.disposed && track(dependencies, key);

      if (isTracked && !propertyWatchers.has(key)) {
        const watcher = watch(key, () => readProperty(key));

        propertyWatchers.set(key, watcher);
      }

      // Читаем текущее значение, а не кэш watcher: записи видны ещё до flush.
      return untrack(() => readProperty(key));
    },

    set(target, key, value) {
      return untrack(() => {
        const current = reference.current;

        return Reflect.set(current, key, value, current);
      });
    },

    deleteProperty(target, key) {
      return untrack(() => Reflect.deleteProperty(reference.current, key));
    },

    has(target, key) {
      const isTracked = !owner.disposed && track(dependencies, key);

      if (isTracked && !presenceWatchers.has(key)) {
        const watcher = watch(key, () => Reflect.has(reference.current, key));

        presenceWatchers.set(key, watcher);
      }

      return untrack(() => Reflect.has(reference.current, key));
    },

    ownKeys() {
      const isTracked = !owner.disposed && track(dependencies, keysDependency);

      if (isTracked && !keysWatcher) {
        keysWatcher = watch(keysDependency, () => Reflect.ownKeys(reference.current), sameKeys);
      }

      return untrack(() => Reflect.ownKeys(reference.current));
    },

    getOwnPropertyDescriptor(target, key) {
      const descriptor = untrack(() => Reflect.getOwnPropertyDescriptor(reference.current, key));

      if (!descriptor) {
        return undefined;
      }

      return {
        ...descriptor,
        configurable: true
      };
    },

    getPrototypeOf() {
      return untrack(() => Object.getPrototypeOf(reference.current));
    },

    defineProperty() {
      throw new TypeError('FuncUI For(): defineProperty is not supported on an item reference.');
    },

    preventExtensions() {
      return false;
    },

    setPrototypeOf() {
      return false;
    }
  });

  // Посредник переносит подписку на новый объект. Равное значение не инвалидирует DOM-binding.
  return { reference, proxy };
}

function sameKeys(first, second) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((key, index) => key === second[index]);
}
