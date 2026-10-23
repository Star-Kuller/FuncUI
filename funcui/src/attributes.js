import { createEffect, onCleanup, untrack } from './effect.js';

const booleanAttributes = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert', 'ismap',
  'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open',
  'playsinline', 'readonly', 'required', 'reversed', 'selected'
]);

const propertyNames = {
  readonly: 'readOnly',
  autofocus: 'autofocus',
  formnovalidate: 'formNoValidate',
  novalidate: 'noValidate',
  allowfullscreen: 'allowFullscreen',
  playsinline: 'playsInline',
  nomodule: 'noModule',
  ismap: 'isMap',
  itemscope: 'itemScope'
};

const attributeNames = {
  className: 'class',
  htmlFor: 'for',
  acceptCharset: 'accept-charset',
  httpEquiv: 'http-equiv'
};

const controlledValues = new WeakMap();

export function applyAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    if (/^on[a-z]/i.test(name)) {
      addEventHandler(element, name, value);
    } else if (name === 'style') {
      bindStyle(element, value);
    } else {
      bind(value, nextValue => setAttribute(element, name, nextValue));
    }
  }
}

function addEventHandler(element, name, handler) {
  if (handler == null) {
    return;
  }

  if (typeof handler !== 'function') {
    throw new TypeError(`FuncUI: ${name} must be an event handler function.`);
  }

  const eventName = name.slice(2).toLowerCase();
  const listener = event => {
    untrack(() => handler.call(element, event));
  };

  element.addEventListener(eventName, listener);
  onCleanup(() => element.removeEventListener(eventName, listener));
}

function bind(value, applyValue) {
  if (typeof value !== 'function') {
    applyValue(value);
    return;
  }

  assertSyncCallback(value);

  const effect = createEffect(() => {
    const nextValue = assertSyncValue(value());

    applyValue(nextValue);
  });

  effect.run();
}

function setAttribute(element, key, value) {
  const name = attributeNames[key] ?? key;
  const lowercaseName = name.toLowerCase();

  if (name === 'value' && 'value' in element) {
    const nextValue = value == null ? '' : String(value);

    // Повторное присваивание value сбрасывает курсор в редактируемом поле.
    if (element.value !== nextValue) {
      element.value = nextValue;
    }

    controlledValues.set(element, nextValue);

    return;
  }

  if (name === 'selectedIndex') {
    if (name in element && element.selectedIndex !== Number(value)) {
      element.selectedIndex = Number(value);
    }

    return;
  }

  if (name === 'indeterminate') {
    if (name in element && element.indeterminate !== Boolean(value)) {
      element.indeterminate = Boolean(value);
    }

    return;
  }

  if (booleanAttributes.has(lowercaseName)) {
    const enabled = Boolean(value);
    const property = propertyNames[lowercaseName] ?? lowercaseName;

    if (property in element && element[property] !== enabled) {
      element[property] = enabled;
    }

    if (enabled && !element.hasAttribute(lowercaseName)) {
      element.setAttribute(lowercaseName, '');
    } else if (!enabled && element.hasAttribute(lowercaseName)) {
      element.removeAttribute(lowercaseName);
    }

    return;
  }

  const preserveFalse = lowercaseName.startsWith('aria-') || lowercaseName.startsWith('data-');
  const removeAttribute = value == null || (value === false && !preserveFalse);

  if (removeAttribute) {
    if (element.hasAttribute(name)) {
      element.removeAttribute(name);
    }
  } else {
    if (element.getAttribute(name) !== String(value)) {
      element.setAttribute(name, String(value));
    }
  }
}

function bindStyle(element, value) {
  if (typeof value === 'function') {
    assertSyncCallback(value);
  }

  let previousString;
  let appliedCssText;

  // Отдельный effect нужен и для функций внутри style-объекта.
  const effect = createEffect(() => {
    const style = typeof value === 'function' ? value() : value;
    const nextStyle = assertSyncValue(style);

    const unchangedString = typeof nextStyle === 'string' &&
      nextStyle === previousString &&
      element.style.cssText === appliedCssText;

    if (unchangedString) {
      return;
    }

    setStyle(element, nextStyle);

    previousString = typeof nextStyle === 'string' ? nextStyle : undefined;
    appliedCssText = element.style.cssText;
  });

  effect.run();
}

function setStyle(element, value) {
  if (value == null) {
    if (element.hasAttribute('style')) {
      element.removeAttribute('style');
    }

    return;
  }

  if (typeof value === 'string') {
    if (element.style.cssText !== value) {
      element.style.cssText = value;
    }

    return;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('FuncUI: style must be a CSS string, an object, or null.');
  }

  // Сначала вычисляем свойства: при ошибке прежние стили останутся на месте.
  const properties = new Map();

  for (const [name, property] of Object.entries(value)) {
    const resolvedValue = typeof property === 'function' ? property() : property;
    const resolved = assertSyncValue(resolvedValue);

    if (resolved != null && resolved !== false) {
      properties.set(toCssName(name), String(resolved));
    }
  }

  for (const name of Array.from(element.style)) {
    if (!properties.has(name)) {
      element.style.removeProperty(name);
    }
  }

  for (const [name, property] of properties) {
    if (element.style.getPropertyValue(name) !== property || element.style.getPropertyPriority(name)) {
      element.style.setProperty(name, property);
    }
  }
}

function toCssName(name) {
  if (name.startsWith('--')) {
    return name;
  }

  const lowercaseName = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

  return lowercaseName.replace(/^ms-/, '-ms-');
}

function assertSyncCallback(callback) {
  if (callback.constructor.name === 'AsyncFunction') {
    throw new TypeError('FuncUI: reactive attribute callbacks must be synchronous.');
  }
}

function assertSyncValue(value) {
  if (value && typeof value.then === 'function') {
    throw new TypeError('FuncUI: reactive attribute callbacks must be synchronous.');
  }

  return value;
}

export function syncFormValue(element) {
  // Восстанавливаем value после пересоздания option внутри select.
  if (element.localName === 'select' && controlledValues.has(element)) {
    element.value = controlledValues.get(element);
  }
}
