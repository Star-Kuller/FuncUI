import { createOwner, withOwner } from './effect.js';
import { isElement, RenderScope } from './scope.js';

const mounts = new WeakMap();

export function mount(target, callback) {
  const container = resolveContainer(target);
  if (typeof callback !== 'function' || callback.constructor.name === 'AsyncFunction') {
    throw new TypeError('FuncUI mount(): render callback must be a synchronous function.');
  }

  mounts.get(container)?.unmount();
  container.replaceChildren();
  const owner = createOwner(null);

  const app = {
    unmount() {
      if (owner.disposed) {
        return;
      }

      owner.dispose();
      container.replaceChildren();
      if (mounts.get(container) === app) {
        mounts.delete(container);
      }
    }
  };

  try {
    withOwner(owner, () => new RenderScope(container, callback));
    mounts.set(container, app);
    return app;
  } catch (error) {
    app.unmount();
    throw error;
  }
}

function resolveContainer(target) {
  let container = target;
  if (typeof target === 'string') {
    container = globalThis.document?.querySelector(target);
  }

  if (!isElement(container)) {
    throw new TypeError(
      'FuncUI mount(): container must be an existing DOM element or a matching CSS selector.'
    );
  }
  return container;
}
