import { createEffect, createOwner, onCleanup, untrack, withOwner } from './effect.js';
import { createItemReference } from './item-reference.js';
import { getParent, RenderScope } from './scope.js';
import { DOMRange } from './range.js';

export function For(readItems, renderItem, getKey) {
  for (const callback of [readItems, renderItem, getKey]) {
    if (
      typeof callback !== 'function' ||
      callback.constructor.name === 'AsyncFunction'
    ) {
      throw new TypeError('FuncUI For(): expected three synchronous functions.');
    }
  }

  const parent = getParent();

  if (!parent) {
    throw new Error('FuncUI For(): call For inside a mount or HTML render callback.');
  }

  new KeyedList(parent, readItems, renderItem, getKey);
}

class KeyedList {
  constructor(parent, readItems, renderItem, getKey) {
    this.readItems = readItems;
    this.renderItem = renderItem;
    this.getKey = getKey;

    this.rows = new Map();
    this.owner = createOwner();
    this.range = new DOMRange(parent, 'For');

    try {
      withOwner(this.owner, () => {
        onCleanup(() => this.range.remove());

        this.effect = createEffect(() => this.update());
        this.effect.run();
      });
    } catch (error) {
      this.owner.dispose();

      throw error;
    }
  }

  readEntries() {
    const items = this.readItems();

    if (!Array.isArray(items)) {
      throw new TypeError('FuncUI For(): the collection must be an array.');
    }

    const keys = new Set();
    const entries = [];

    for (const item of items) {
      if (item === null || typeof item !== 'object') {
        throw new TypeError('FuncUI For(): each item must be a plain object.');
      }

      const prototype = Object.getPrototypeOf(item);

      if (prototype !== null && prototype !== Object.prototype) {
        throw new TypeError('FuncUI For(): each item must be a plain object.');
      }

      const key = this.getKey(item);

      if (typeof key !== 'string' && typeof key !== 'number') {
        throw new TypeError('FuncUI For(): keys must be strings or numbers.');
      }

      if (keys.has(key)) {
        throw new Error(`FuncUI For(): duplicate key ${String(key)}.`);
      }

      keys.add(key);
      entries.push({ item, key });
    }

    return entries;
  }

  update() {
    const entries = this.readEntries();
    const nextRows = new Map();
    const createdRows = [];
    const previousIndices = [];

    // Подготовка новых строк не затрагивает прежний DOM: ошибка renderer откатит её целиком.
    try {
      for (const { item, key } of entries) {
        let row = this.rows.get(key);

        previousIndices.push(row ? row.index : -1);

        if (!row) {
          row = this.createRow(item);
          createdRows.push(row);
        }

        if (this.owner.disposed) {
          return;
        }

        nextRows.set(key, row);
      }
    } catch (error) {
      for (const row of createdRows) {
        row.owner.dispose();
      }

      throw error;
    }

    if (this.owner.disposed) {
      return;
    }

    for (const [key, row] of this.rows) {
      if (!nextRows.has(key)) {
        row.owner.dispose();
      }
    }

    const rowsInOrder = [...nextRows.values()];

    for (let index = 0; index < entries.length; index++) {
      const row = rowsInOrder[index];

      row.index = index;

      // Замена объекта инвалидирует bindings строки, но не вызывает renderer заново.
      untrack(() => {
        row.reference.current = entries[index].item;
      });
    }

    const stableIndices = longestIncreasingSubsequence(previousIndices);
    let anchor = this.range.end;

    for (let index = rowsInOrder.length - 1; index >= 0; index--) {
      const row = rowsInOrder[index];

      if (previousIndices[index] === -1 || !stableIndices.has(index)) {
        row.range.moveBefore(anchor);
      }

      anchor = row.range.start;
    }

    this.rows = nextRows;
  }

  createRow(item) {
    const owner = createOwner(this.owner);
    const fragment = this.range.ownerDocument.createDocumentFragment();
    const range = new DOMRange(fragment, 'item');
    const { reference, proxy } = createItemReference(item, owner);

    try {
      withOwner(owner, () => {
        onCleanup(() => range.remove());

        new RenderScope(range, () => this.renderItem(proxy));
      });

      return {
        owner,
        range,
        reference,
        index: -1
      };
    } catch (error) {
      owner.dispose();

      throw error;
    }
  }
}

function longestIncreasingSubsequence(indices) {
  const previous = new Array(indices.length).fill(-1);
  const tails = [];

  for (let index = 0; index < indices.length; index++) {
    if (indices[index] < 0) {
      continue;
    }

    let low = 0;
    let high = tails.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);

      if (indices[tails[middle]] < indices[index]) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    if (low > 0) {
      previous[index] = tails[low - 1];
    }

    tails[low] = index;
  }

  const stable = new Set();
  let index = tails[tails.length - 1];

  while (index !== undefined && index >= 0) {
    stable.add(index);
    index = previous[index];
  }

  return stable;
}
