import { afterEach, beforeEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { mount } from 'funcui';

export function domTests() {
  let dom;
  let apps;
  let errors;
  let previousDocument;
  let previousReport;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
    apps = [];
    errors = [];
    previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    previousReport = Object.getOwnPropertyDescriptor(globalThis, 'reportError');
    globalThis.document = dom.window.document;
    globalThis.reportError = error => errors.push(error);
  });

  afterEach(async () => {
    for (const app of apps) app.unmount();
    await settle();
    dom.window.close();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousReport) Object.defineProperty(globalThis, 'reportError', previousReport);
    else delete globalThis.reportError;
  });

  return {
    get window() { return dom.window; },
    get document() { return dom.window.document; },
    get root() { return dom.window.document.querySelector('#app'); },
    get errors() { return errors; },
    mount(callback, target = '#app') {
      const app = mount(target, callback);
      apps.push(app);
      return app;
    }
  };
}

export async function flush() {
  await new Promise(resolve => queueMicrotask(resolve));
}

export async function settle() {
  await new Promise(resolve => setImmediate(resolve));
}
