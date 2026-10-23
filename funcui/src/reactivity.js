import { track, trigger, untrack } from './effect.js';

const proxiesByTarget = new WeakMap();
const targetsByProxy = new WeakMap();
const ITERATE = Symbol('iterate');

function toRaw(value) {
  return targetsByProxy.get(value) ?? value;
}

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isReactiveTarget(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return Array.isArray(value) || prototype === null || prototype === Object.prototype;
}

function isArrayIndex(key) {
  if (typeof key !== 'string' || key === '') {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key;
}

const handlers = {
  get(target, key, receiver) {
    track(target, key);
    const value = Reflect.get(target, key, receiver);
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);

    // Для неизменяемого свойства Proxy обязан вернуть исходное значение.
    const immutableProperty = descriptor &&
      !descriptor.configurable &&
      'value' in descriptor &&
      !descriptor.writable;

    if (immutableProperty || !isReactiveTarget(value)) {
      return value;
    }
    return reactive(value);
  },

  set(target, key, value, receiver) {
    const isArray = Array.isArray(target);
    const previousLength = isArray ? target.length : 0;
    const propertyExisted = hasOwnProperty(target, key);
    const previousValue = untrack(() => Reflect.get(target, key, receiver));

    const success = Reflect.set(target, key, toRaw(value), receiver);
    if (!success || target !== toRaw(receiver)) {
      return success;
    }

    const currentValue = untrack(() => Reflect.get(target, key, receiver));
    const propertyAdded = !propertyExisted && hasOwnProperty(target, key);
    const valueUnchanged = Object.is(toRaw(previousValue), toRaw(currentValue));
    if (!propertyAdded && valueUnchanged) {
      return true;
    }

    const changedKeys = new Set([key]);
    if (propertyAdded) {
      changedKeys.add(ITERATE);
    }

    // Добавление индекса за концом массива меняет и его длину.
    const arrayGrew = isArray && isArrayIndex(key) && Number(key) >= previousLength;
    if (arrayGrew) {
      changedKeys.add('length');
    }

    // Уменьшение length удаляет индексы, на которые могли быть подписки.
    const arrayShrank = isArray && key === 'length' && target.length < previousLength;
    if (arrayShrank) {
      changedKeys.add(ITERATE);
      const removedIndex = property => isArrayIndex(property) && Number(property) >= target.length;
      trigger(target, changedKeys, removedIndex);
    } else {
      trigger(target, changedKeys);
    }
    return true;
  },

  deleteProperty(target, key) {
    const propertyExisted = hasOwnProperty(target, key);
    const success = Reflect.deleteProperty(target, key);

    if (success && propertyExisted) {
      trigger(target, new Set([key, ITERATE]));
    }
    return success;
  },

  has(target, key) {
    track(target, key);
    return Reflect.has(target, key);
  },

  ownKeys(target) {
    track(target, ITERATE);
    return Reflect.ownKeys(target);
  }
};

export function reactive(value) {
  if (targetsByProxy.has(value)) {
    return value;
  }
  if (!isReactiveTarget(value)) {
    throw new TypeError('FuncUI $(): expected a plain object or an array.');
  }

  const cachedProxy = proxiesByTarget.get(value);
  if (cachedProxy) {
    return cachedProxy;
  }

  const proxy = new Proxy(value, handlers);
  proxiesByTarget.set(value, proxy);
  targetsByProxy.set(proxy, value);
  return proxy;
}

export { reactive as $ };
