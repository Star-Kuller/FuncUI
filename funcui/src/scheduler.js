const pending = new Set();
const deferred = new Set();
const executed = new Set();
const cascadeRuns = new Map();
const MAX_RUNS = 100;

let scheduled = false;
let flushing = false;
let jobs = [];
let nextJob = 0;

export function schedule(effect) {
  if (!effect.active) {
    return;
  }

  if (flushing && executed.has(effect)) {
    deferred.add(effect);

    return;
  }

  if (pending.has(effect)) {
    return;
  }

  pending.add(effect);

  if (flushing) {
    insertJob(effect);
  } else {
    requestFlush();
  }
}

// Учитываем и первоначальные запуски дочерних bindings, созданных во время flush.
export function beginEffectRun(effect) {
  if (!flushing) {
    return true;
  }

  if (executed.has(effect)) {
    deferred.add(effect);

    return false;
  }

  executed.add(effect);

  const runs = (cascadeRuns.get(effect) ?? 0) + 1;
  cascadeRuns.set(effect, runs);

  if (runs > MAX_RUNS) {
    effect.dispose();
    reportError(new Error('FuncUI: reactive update cycle exceeded 100 runs; the effect was stopped.'));

    return false;
  }

  return true;
}

function requestFlush() {
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

function flush() {
  scheduled = false;
  flushing = true;
  jobs = [...pending].sort(compareEffects);
  nextJob = 0;

  try {
    while (nextJob < jobs.length) {
      const effect = jobs[nextJob++];
      pending.delete(effect);

      if (!effect.active) {
        continue;
      }

      try {
        effect.run();
      } catch (error) {
        reportError(error);
      }
    }
  } finally {
    flushing = false;
    jobs = [];
    executed.clear();

    // Повторная инвалидизация не теряется, но effect не запускается дважды за flush.
    for (const effect of deferred) {
      if (effect.active) {
        pending.add(effect);
      }
    }

    deferred.clear();

    if (pending.size > 0) {
      requestFlush();
    } else {
      cascadeRuns.clear();
    }
  }
}

function compareEffects(first, second) {
  return first.depth - second.depth || first.id - second.id;
}

function insertJob(effect) {
  let low = nextJob;
  let high = jobs.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (compareEffects(jobs[middle], effect) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  jobs.splice(low, 0, effect);
}

function reportError(error) {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
  } else {
    console.error('[FuncUI] Update failed:', error);
  }
}
