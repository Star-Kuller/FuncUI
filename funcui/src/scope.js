import { adoptOwner, createEffect, createOwner, withOwner } from './effect.js';
import { syncFormValue } from './attributes.js';
import { DOMRange } from './range.js';

let currentParent = null;
const elementOwners = new WeakMap();

export function registerElementOwner(element, owner) {
  elementOwners.set(element, owner);
}

export function getParent() {
  return currentParent;
}

export function withParent(parent, callback) {
  const previousParent = currentParent;
  currentParent = parent;

  try {
    return callback();
  } finally {
    currentParent = previousParent;
  }
}

export function isElement(value) {
  return value?.nodeType === 1 && typeof value.appendChild === 'function';
}

function isTextContent(value) {
  return value == null || typeof value === 'string' || typeof value === 'number';
}

export function appendContent(parent, content) {
  if (content == null) {
    return;
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      appendContent(parent, item);
    }
    return;
  }

  if (isTextContent(content)) {
    const textNode = parent.ownerDocument.createTextNode(String(content));
    parent.appendChild(textNode);
    return;
  }

  if (isElement(content)) {
    if (!content.parentNode) {
      adoptOwner(elementOwners.get(content));
      parent.appendChild(content);
    }
    return;
  }

  throw new TypeError(
    'FuncUI: content must be a string, number, DOM element, an array of these, null, undefined, or a synchronous callback.'
  );
}

export class RenderScope {
  constructor(parent, callback) {
    if (typeof callback !== 'function' || callback.constructor.name === 'AsyncFunction') {
      throw new TypeError('FuncUI: render callbacks must be synchronous functions.');
    }

    this.parent = parent;
    this.callback = callback;
    this.owner = createOwner();
    this.contentOwner = null;
    this.textNode = null;
    this.effect = createEffect(() => this.render(), this.owner);

    try {
      this.effect.run();
    } catch (error) {
      this.owner.dispose();
      throw error;
    }
  }

  render() {
    const nextContent = this.createContent();

    // Callback может размонтировать приложение во время своего выполнения.
    if (this.owner.disposed) {
      nextContent.owner.dispose();
      return;
    }

    this.contentOwner?.dispose();
    this.contentOwner = nextContent.owner;

    if (nextContent.textOnly) {
      this.updateText(nextContent.value);
    } else {
      this.textNode = null;
      this.parent.replaceChildren(nextContent.fragment);
    }

    if (!(this.parent instanceof DOMRange)) {
      syncFormValue(this.parent);
    }
  }

  createContent() {
    const fragment = this.parent.ownerDocument.createDocumentFragment();
    const owner = createOwner(this.owner);
    let value;
    let textOnly;

    // Строим отдельно, чтобы исключение не разрушило последний успешный DOM.
    try {
      withOwner(owner, () => {
        withParent(fragment, () => {
          value = this.callback();
          textOnly = fragment.childNodes.length === 0 && isTextContent(value);
          appendContent(fragment, value);
        });
      });
    } catch (error) {
      owner.dispose();
      throw error;
    }

    return { owner, fragment, value, textOnly };
  }

  updateText(value) {
    const text = value == null ? '' : String(value);

    const textAttached = this.parent instanceof DOMRange
      ? this.parent.contains(this.textNode)
      : this.textNode?.parentNode === this.parent;

    if (!textAttached) {
      this.textNode = this.parent.ownerDocument.createTextNode(text);
      this.parent.replaceChildren(this.textNode);
      return;
    }

    if (this.textNode.data !== text) {
      this.textNode.data = text;
    }
  }
}
