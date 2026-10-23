import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { $, For, div, insertHTML, li, p, table, tbody, template, ul } from 'funcui';
import { domTests, flush } from './support/dom.js';

const env = domTests();

test('insertHTML inserts several roots between DSL siblings without a wrapper', () => {
  env.mount(() => {
    div(() => {
      p('Before');

      insertHTML(`
        <p>HTML with <strong>emphasis</strong>.</p>
        <p>Another paragraph.</p>
      `);

      p('After');
    });
  });

  const container = env.root.firstElementChild;
  const paragraphs = [...container.children];

  assert.equal(container.localName, 'div');
  assert.equal(paragraphs.length, 4);
  assert.deepEqual(paragraphs.map(element => element.localName), ['p', 'p', 'p', 'p']);
  assert.equal(paragraphs[0].textContent, 'Before');
  assert.equal(paragraphs[1].querySelector('strong').textContent, 'emphasis');
  assert.equal(paragraphs[3].textContent, 'After');
});

test('insertHTML supports concise callbacks without inserting content twice', () => {
  env.mount(() => div(() => insertHTML('<strong>Once</strong>')));

  assert.equal(env.root.querySelectorAll('strong').length, 1);
  assert.equal(env.root.textContent, 'Once');
});

test('insertHTML preserves text, entities and comments, and accepts an empty string', () => {
  env.mount(() => {
    insertHTML('Before &amp; <!-- preserved -->');
    insertHTML('');
    insertHTML('<em>after</em>');
  });

  const nodes = [...env.root.childNodes];
  const comment = nodes.find(node => node.nodeType === env.window.Node.COMMENT_NODE);

  assert.equal(env.root.textContent, 'Before & after');
  assert.equal(comment.data, ' preserved ');
  assert.equal(env.root.children.length, 1);
});

test('insertHTML keeps table rows and cells as roots of the inserted fragment', () => {
  env.mount(() => {
    table(() => {
      tbody(() => {
        insertHTML('<tr><td>First</td><td>Second</td></tr>');
      });
    });
  });

  const cells = [...env.root.querySelectorAll('table > tbody > tr > td')];

  assert.deepEqual(cells.map(cell => cell.textContent), ['First', 'Second']);
});

test('insertHTML can populate the content of a template element', () => {
  env.mount(() => {
    template(() => {
      insertHTML('<strong>Template content</strong>');
    });
  });

  const element = env.root.firstElementChild;

  assert.equal(element.childNodes.length, 0);
  assert.equal(element.content.querySelector('strong').textContent, 'Template content');
});

test('insertHTML does not sanitize markup or change ordinary text rendering', () => {
  const markup = '<button onclick="void 0" data-source="html">Raw HTML</button>';

  env.mount(() => {
    insertHTML(markup);

    p(markup);
  });

  const button = env.root.querySelector('button');
  const paragraph = env.root.querySelector('p');

  assert.equal(button.getAttribute('onclick'), 'void 0');
  assert.equal(button.dataset.source, 'html');
  assert.equal(paragraph.textContent, markup);
  assert.equal(paragraph.children.length, 0);
});

test('insertHTML follows structural reactivity and batches synchronous changes', async () => {
  const state = $({ markup: '<strong>Initial</strong>' });
  let renders = 0;

  env.mount(() => {
    p('Outside');

    div(() => {
      renders++;

      insertHTML(state.markup);
    });
  });

  const outside = env.root.querySelector('p');
  const container = env.root.querySelector('div');
  const previousContent = container.firstChild;

  state.markup = '<em>Intermediate</em>';
  state.markup = '<span>Final</span>';

  assert.equal(container.textContent, 'Initial');

  await flush();

  assert.equal(renders, 2);
  assert.equal(env.root.querySelector('p'), outside);
  assert.equal(env.root.querySelector('div'), container);
  assert.equal(container.children.length, 1);
  assert.equal(container.firstElementChild.localName, 'span');
  assert.equal(container.textContent, 'Final');
  assert.equal(previousContent.isConnected, false);
});

test('an invalid HTML update preserves the previous DOM and can recover', async () => {
  const state = $({ markup: '<strong>Valid</strong>' });

  env.mount(() => div(() => insertHTML(state.markup)));

  const previousContent = env.root.querySelector('strong');

  state.markup = null;
  await flush();

  assert.equal(env.root.querySelector('strong'), previousContent);
  assert.match(env.errors[0].message, /HTML string/);

  state.markup = '<em>Recovered</em>';
  await flush();

  assert.equal(env.root.textContent, 'Recovered');
  assert.equal(previousContent.isConnected, false);
});

test('a later render error discards the prepared HTML without changing the valid DOM', async () => {
  const state = $({ fail: false });

  env.mount(() => {
    div(() => {
      insertHTML('<strong>Content</strong>');

      if (state.fail) {
        insertHTML('<em>Discarded</em>');

        throw new Error('Render failed after HTML insertion');
      }
    });
  });

  const previousContent = env.root.querySelector('strong');

  state.fail = true;
  await flush();

  assert.equal(env.root.querySelector('strong'), previousContent);
  assert.equal(env.root.querySelector('em'), null);
  assert.match(env.errors[0].message, /Render failed/);
});

test('inserted HTML moves with keyed rows and is removed with its row', async () => {
  const state = $({
    items: [
      { id: 1, markup: '<strong>First</strong>' },
      { id: 2, markup: '<em>Second</em>' }
    ]
  });

  env.mount(() => {
    ul(() => {
      For(
        () => state.items,
        item => li(() => insertHTML(item.markup)),
        item => item.id
      );
    });
  });

  const firstRow = env.root.querySelector('li');
  const firstContent = firstRow.querySelector('strong');

  state.items.reverse();
  await flush();

  assert.equal(env.root.querySelector('li:last-of-type'), firstRow);
  assert.equal(firstRow.querySelector('strong'), firstContent);

  state.items.pop();
  await flush();

  assert.equal(firstRow.isConnected, false);
  assert.equal(env.root.querySelectorAll('li').length, 1);
});

test('unmount removes inserted HTML and cancels a pending structural update', async () => {
  const state = $({ markup: '<strong>Mounted</strong>' });
  const app = env.mount(() => insertHTML(state.markup));
  const content = env.root.querySelector('strong');

  state.markup = '<em>Pending</em>';
  app.unmount();

  await flush();

  assert.equal(env.root.childNodes.length, 0);
  assert.equal(content.isConnected, false);
});

test('insertHTML keeps native template parsing behavior without activating script elements', () => {
  const isolated = new JSDOM('<div id="target"></div>', {
    runScripts: 'dangerously'
  });

  const target = isolated.window.document.querySelector('#target');
  let app;

  try {
    app = env.mount(() => {
      insertHTML('<script>window.insertedScriptRan = true;</script>');
    }, target);

    assert.equal(target.querySelectorAll('script').length, 1);
    assert.equal(isolated.window.insertedScriptRan, undefined);
    assert.equal(target.firstElementChild.ownerDocument, isolated.window.document);
  } finally {
    app?.unmount();
    isolated.window.close();
  }
});

test('insertHTML rejects non-string values and calls without a render parent', () => {
  const invalidValues = [undefined, null, false, 42, {}, [], () => '<p>Callback</p>'];

  for (const value of invalidValues) {
    assert.throws(() => {
      env.mount(() => insertHTML(value));
    }, /HTML string/);
  }

  assert.throws(() => insertHTML('<p>Outside</p>'), /inside a mount or HTML render callback/);
});
