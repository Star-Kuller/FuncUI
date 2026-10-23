import { beginEffectRun, schedule } from './scheduler.js';

const targetDependencies = new WeakMap();
const subscriptionLocations = new WeakMap();
let activeEffect = null;
let activeOwner = null;
let nextEffectId = 0;

// Владелец объединяет ресурсы элемента или scope для общей очистки.
export function createOwner(parent = activeOwner) {
  if (parent?.disposed) {
    throw new Error('FuncUI: cannot create UI inside an unmounted scope.');
  }

  const owner = {
    parent,
    children: new Set(),
    effects: new Set(),
    cleanups: new Set(),
    disposed: false,

    get depth() {
      return owner.parent ? owner.parent.depth + 1 : 0;
    },

    dispose() {
      if (owner.disposed) {
        return;
      }
      owner.disposed = true;

      for (const child of [...owner.children]) {
        child.dispose();
      }
      for (const effect of [...owner.effects]) {
        effect.dispose();
      }
      for (const cleanup of owner.cleanups) {
        cleanup();
      }

      owner.cleanups.clear();
      owner.parent?.children.delete(owner);
    }
  };

  parent?.children.add(owner);
  return owner;
}

export function adoptOwner(owner) {
  if (!owner || owner.disposed || owner.parent === activeOwner) {
    return;
  }

  owner.parent?.children.delete(owner);
  owner.parent = activeOwner;
  activeOwner?.children.add(owner);
}

export function withOwner(owner, callback) {
  const previousOwner = activeOwner;
  activeOwner = owner;

  try {
    return callback();
  } finally {
    activeOwner = previousOwner;
  }
}

export function onCleanup(callback) {
  activeOwner?.cleanups.add(callback);
}

export function untrack(callback) {
  const previousEffect = activeEffect;
  activeEffect = null;

  try {
    return callback();
  } finally {
    activeEffect = previousEffect;
  }
}

export function createEffect(callback, owner = activeOwner) {
  const effect = {
    id: nextEffectId++,
    active: true,
    subscriptions: new Set(),

    get depth() {
      return owner?.depth ?? 0;
    },

    run() {
      if (!effect.active || !beginEffectRun(effect)) {
        return;
      }

      // Новый запуск собирает зависимости заново: условная ветка могла измениться.
      unsubscribe(effect);
      const previousEffect = activeEffect;
      activeEffect = effect;

      try {
        return withOwner(owner, callback);
      } finally {
        activeEffect = previousEffect;
      }
    },

    dispose() {
      if (!effect.active) {
        return;
      }

      effect.active = false;
      unsubscribe(effect);
      owner?.effects.delete(effect);
    }
  };

  owner?.effects.add(effect);
  return effect;
}

function unsubscribe(effect) {
  for (const subscribers of effect.subscriptions) {
    subscribers.delete(effect);

    if (subscribers.size === 0) {
      const { propertyDependencies, key } = subscriptionLocations.get(subscribers);
      propertyDependencies.delete(key);
    }
  }

  effect.subscriptions.clear();
}

export function track(target, key) {
  if (!activeEffect?.active) {
    return false;
  }

  let propertyDependencies = targetDependencies.get(target);
  if (!propertyDependencies) {
    propertyDependencies = new Map();
    targetDependencies.set(target, propertyDependencies);
  }

  let subscribers = propertyDependencies.get(key);
  if (!subscribers) {
    subscribers = new Set();
    propertyDependencies.set(key, subscribers);
    subscriptionLocations.set(subscribers, { propertyDependencies, key });
  }

  subscribers.add(activeEffect);
  activeEffect.subscriptions.add(subscribers);
  return true;
}

export function trigger(target, changedKeys, matchesAdditionalKey = null) {
  const propertyDependencies = targetDependencies.get(target);
  if (!propertyDependencies) {
    return;
  }

  const effectsToUpdate = new Set();
  for (const [key, subscribers] of propertyDependencies) {
    const affected = changedKeys.has(key) || matchesAdditionalKey?.(key);
    if (!affected) {
      continue;
    }

    for (const effect of subscribers) {
      effectsToUpdate.add(effect);
    }
  }

  for (const effect of effectsToUpdate) {
    schedule(effect);
  }
}
