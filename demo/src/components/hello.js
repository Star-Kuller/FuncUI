import { $, article, h2, p, div, span, code, label, input, ul, li } from 'funcui';

let nextHelloId = 0;

export function hello({ name }) {
  // Помощники ниже работают с тем же родителем; return у компонента необязателен.
  const state = $({ name });
  const id = `hello-${nextHelloId++}`;

  article({ class: 'card hello-card', 'aria-labelledby': `${id}-title` }, () => {
    cardHeading(`${id}-title`);

    greeting(state);
    nameField(state, `${id}-name`);

    featureList();
  });
}

function cardHeading(titleId) {
  div({ class: 'card-label' }, () => {
    span('01 / Composition');
    code('hello.js');
  });

  h2({ id: titleId }, 'Hello Component');
  p({ class: 'card-description' }, 'A component made of ordinary functions.');
}

function greeting(state) {
  // Чтение внутри callback подписывает только текст. Карточка и поле не пересоздаются.
  p({
    class: 'greeting',
    style: 'color: var(--accent);'
  }, () => `Hello, ${state.name.trim() || 'stranger'}!`);
}

function nameField(state, inputId) {
  div({ class: 'name-field' }, () => {
    label({ htmlFor: inputId }, 'Your name');

    input({
      id: inputId,
      type: 'text',
      maxLength: 32,
      placeholder: 'Enter your name',
      value: () => state.name,
      onInput: event => {
        state.name = event.target.value;
      }
    });
  });
}

function featureList() {
  const features = [
    'Native JavaScript',
    'Fine-grained reactivity',
    'Reusable components'
  ];

  ul({ class: 'feature-list' }, () => {
    for (const feature of features) {
      li(feature);
    }
  });
}
