import { getParent } from './scope.js';

export function insertHTML(markup) {
  if (typeof markup !== 'string') {
    throw new TypeError('FuncUI insertHTML(): expected an HTML string.');
  }

  const parent = getParent();

  if (!parent) {
    throw new Error('FuncUI insertHTML(): call insertHTML inside a mount or HTML render callback.');
  }

  const template = parent.ownerDocument.createElement('template');

  template.innerHTML = markup;

  parent.appendChild(template.content);
}
