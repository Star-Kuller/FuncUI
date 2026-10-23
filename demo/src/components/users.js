import { $, For, article, h2, p, div, span, code, form, input, button, ul, li } from 'funcui';

let nextListId = 0;

export function usersList() {
  const state = $({
    users: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Maya' },
      { id: 3, name: 'Sam' }
    ],
    draft: '',
    note: 'Edit a name, then try changing the order.'
  });

  let nextUserId = 4;
  const titleId = `users-${nextListId++}-title`;

  function addUser(event) {
    event.preventDefault();

    const name = state.draft.trim();

    if (!name) {
      return;
    }

    state.users.push({ id: nextUserId++, name });
    state.draft = '';

    state.note = 'One new row added.';
  }

  article({
    class: 'card list-card',
    'aria-labelledby': titleId
  }, () => {
    cardHeading(titleId, state);

    addUserForm(state, addUser);
    listActions(state);

    ul({ class: 'user-list', 'aria-label': 'Editable users' }, () => {
      // Ключ сохраняет строку при перестановке. user остаётся ссылкой на актуальный объект с этим ID.
      For(
        () => state.users,
        user => userRow(state, user),
        user => user.id
      );
    });

    p({
      class: 'empty-list',
      hidden: () => state.users.length > 0
    }, 'The list is empty. Add someone above.');

    p({ class: 'example-note', 'aria-live': 'polite' }, () => state.note);
  });
}

function cardHeading(titleId, state) {
  div({ class: 'card-label' }, () => {
    span('03 / Keyed collections');
    code('users.js');
  });

  div({ class: 'section-heading' }, () => {
    h2({ id: titleId }, 'A list that keeps its rows');
    span({ class: 'count-badge' }, () => `${state.users.length} users`);
  });

  p({ class: 'card-description' }, 'Edit, add or reorder. The same IDs keep the same DOM.');
}

function addUserForm(state, addUser) {
  form({
    class: 'add-user-form',
    onSubmit: addUser
  }, () => {
    input({
      class: 'text-input',
      'aria-label': 'New user name',
      placeholder: 'A new name…',
      maxLength: 40,
      value: () => state.draft,
      onInput: event => {
        state.draft = event.target.value;
      }
    });

    button({
      class: 'primary',
      type: 'submit',
      disabled: () => !state.draft.trim()
    }, 'Add user');
  });
}

function listActions(state) {
  function reverseUsers() {
    state.users.reverse();

    state.note = 'Existing rows moved to their new positions.';
  }

  function uppercaseNames() {
    // Все записи обычного цикла попадут в один глобальный пакет обновлений DOM.
    for (const user of state.users) {
      user.name = user.name.toUpperCase();
    }

    state.note = 'All names changed in one batch.';
  }

  function replaceUsers() {
    const replacements = state.users.map(user => ({
      id: user.id,
      name: user.name
    }));

    state.users = replacements;
    state.note = 'New objects, same IDs. Try editing a row again.';
  }

  div({
    class: 'toolbar',
    role: 'group',
    'aria-label': 'List actions'
  }, () => {
    button({
      type: 'button',
      onClick: reverseUsers
    }, 'Reverse order');

    button({
      type: 'button',
      onClick: uppercaseNames
    }, 'Uppercase all');

    button({
      type: 'button',
      onClick: replaceUsers
    }, 'Replace objects');
  });
}

function userRow(state, user) {
  function moveUp() {
    const index = state.users.findIndex(item => item.id === user.id);

    if (index <= 0) {
      return;
    }

    const [item] = state.users.splice(index, 1);

    state.users.splice(index - 1, 0, item);
  }

  function remove() {
    const index = state.users.findIndex(item => item.id === user.id);

    if (index >= 0) {
      state.users.splice(index, 1);
    }
  }

  li({ class: 'user-row', 'data-id': user.id }, () => {
    span({ class: 'user-id', title: 'Stable key' }, `#${user.id}`);

    input({
      class: 'text-input',
      'aria-label': `Name for user ${user.id}`,
      maxLength: 40,
      value: () => user.name,
      onInput: event => {
        user.name = event.target.value;
      }
    });

    div({ class: 'row-actions' }, () => {
      button({
        type: 'button',
        'aria-label': `Move user ${user.id} up`,
        disabled: () => state.users[0]?.id === user.id,
        onClick: moveUp
      }, '↑');

      button({
        class: 'remove-user',
        type: 'button',
        'aria-label': `Remove user ${user.id}`,
        onClick: remove
      }, '×');
    });
  });
}
