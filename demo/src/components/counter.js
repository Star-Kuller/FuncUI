import { $, article, h2, p, div, span, code, button } from 'funcui';

let nextCounterId = 0;

export function counter() {
  const state = $({ count: 0 });
  const titleId = `counter-${nextCounterId++}-title`;

  article({ class: 'card counter-card', 'aria-labelledby': titleId }, () => {
    cardHeading(titleId);

    counterValue(state);
    counterButtons(state);

    p({ class: 'hint' }, 'Buttons change state. FuncUI updates the text.');
  });
}

function cardHeading(titleId) {
  div({ class: 'card-label' }, () => {
    span('02 / Reactivity');
    code('counter.js');
  });

  h2({ id: titleId }, 'Counter Component');
  p({ class: 'card-description' }, 'State changes. The view follows.');
}

function counterValue(state) {
  p({
    class: 'counter-value',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    // Стиль и текст отслеживаются отдельно от разметки карточки.
    style: {
      color: () => {
        if (state.count > 0) {
          return 'var(--accent)';
        }

        if (state.count < 0) {
          return 'var(--negative)';
        }

        return 'gray';
      }
    }
  }, () => state.count);
}

function counterButtons(state) {
  div({ class: 'counter-controls', role: 'group', 'aria-label': 'Counter controls' }, () => {
    button({
      type: 'button',
      'aria-label': 'Decrease count',
      onClick: () => {
        state.count--;
      }
    }, '−');

    button({
      class: 'primary',
      type: 'button',
      'aria-label': 'Increase count',
      onClick: () => {
        state.count++;
      }
    }, '+');

    button({
      class: 'reset',
      type: 'button',
      'aria-label': 'Reset count',
      disabled: () => state.count === 0,
      onClick: () => {
        state.count = 0;
      }
    }, 'Reset');
  });
}
