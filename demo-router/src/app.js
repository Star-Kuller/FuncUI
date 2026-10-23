import {
  $, mount, div, header, nav, main, section, article, footer,
  h1, h2, h3, p, span, a, button, code, label, textarea
} from 'funcui';
import { createRouter, route } from 'funcrouter';

const users = [
  {
    id: 1,
    name: 'Ада Лавлейс',
    role: 'Алгоритмы и воображение',
    initials: 'АЛ',
    color: '#c4ed9f'
  },
  {
    id: 2,
    name: 'Грейс Хоппер',
    role: 'Языки и компиляторы',
    initials: 'ГХ',
    color: '#b3caff'
  },
  {
    id: 3,
    name: 'Маргарет Гамильтон',
    role: 'Программная инженерия',
    initials: 'МГ',
    color: '#efc198'
  }
];

export function createDemo(root, {
  window = root.ownerDocument.defaultView,
  confirmLeave = () => window.confirm('Есть несохранённые изменения. Уйти со страницы?')
} = {}) {
  const state = $({
    path: '/',
    url: '/',
    user: '',
    error: ''
  });
  const note = $({
    text: 'Хороший интерфейс начинается с простой идеи.',
    saved: 'Хороший интерфейс начинается с простой идеи.'
  });
  let outlet;
  let router;

  const shell = mount(root, renderShell);

  // Связь между двумя библиотеками находится только в этой функции приложения.
  function page(render) {
    return context => {
      const app = mount(outlet, () => render(context));

      return () => app.unmount();
    };
  }

  router = createRouter([
    route('/', page(home)),
    route('/users', {
      children: [
        route('', page(usersPage)),
        route(':id', {
          params: { id: parseId },
          children: [
            route('', page(profile)),
            route('settings', page(userSettings))
          ]
        })
      ]
    }),
    route('/workspace', {
      beforeEnter: [requireUser]
    }, page(privatePage)),
    route('/login', page(login)),
    route('/notes', {
      beforeLeave: [canLeaveNote]
    }, page(notes)),
    route('/docs/*path', page(docs)),
    route('*', page(notFound))
  ], {
    window,
    onError: showError
  });

  const unsubscribe = router.subscribe(updateNavigation);

  function showError(error) {
    state.error = error.message;
  }

  function updateNavigation(current) {
    state.path = current.path;
    state.url = current.url;
    state.error = '';
    window.document.title = `${current.path} · FuncRouter × FuncUI`;

    for (const link of root.querySelectorAll('[data-nav]')) {
      const path = link.getAttribute('href');
      const active = path === '/'
        ? current.path === '/'
        : current.path === path || current.path.startsWith(`${path}/`);

      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function go(url, options) {
    // Ошибки программных переходов уже передаются в showError через onError.
    router.navigate(url, options).catch(() => {});
  }

  async function requireUser({ to, signal }) {
    await Promise.resolve();

    if (signal.aborted) {
      return false;
    }

    return state.user ? true : `/login?next=${encodeURIComponent(to.url)}`;
  }

  function canLeaveNote() {
    return note.text === note.saved || confirmLeave();
  }

  function renderShell() {
    div({ class: 'app-shell' }, () => {
      sidebar();
      div({ class: 'workspace' }, workspace);
    });
  }

  function workspace() {
    header({ class: 'topbar' }, topbar);

    main({
      class: 'content',
      id: 'content'
    }, content);

    footer({ class: 'footer' }, footerContent);
  }

  function topbar() {
    span({ class: 'eyebrow' }, 'Демо / Многостраничное SPA');
    span({ class: 'status-dot' }, 'Без перезагрузки');
  }

  function content() {
    div({ class: 'route-bar' }, () => {
      span({ class: 'route-label' }, 'URL');
      code({ 'data-current-url': '' }, () => state.url);
    });

    p({
      class: 'error-banner',
      role: 'alert',
      hidden: () => !state.error
    }, () => state.error);

    outlet = div({
      class: 'page-outlet',
      'aria-live': 'polite'
    });
  }

  function footerContent() {
    span('Обычные функции. Настоящий DOM.');
    code('FuncUI + FuncRouter');
  }

  function sidebar() {
    div({ class: 'sidebar' }, () => {
      a({
        class: 'brand',
        href: '/',
        'aria-label': 'FuncRouter, главная'
      }, () => {
        span({
          class: 'brand-symbol',
          'aria-hidden': 'true'
        }, '↗');

        span(() => {
          span('Func');
          span({ class: 'accent' }, 'Router');
        });
      });

      p({ class: 'sidebar-caption' }, 'Routing. Just JavaScript.');
      p({ class: 'eyebrow nav-heading' }, 'Исследуйте пример');

      nav({ 'aria-label': 'Главная навигация' }, () => {
        navLink('/', '01', 'Обзор');
        navLink('/users', '02', 'Пользователи');
        navLink('/workspace', '03', 'Рабочее пространство');
        navLink('/notes', '04', 'Заметка');
        navLink('/docs/routing/nested', '05', 'Вложенные пути');
      });

      div({ class: 'sidebar-bottom' }, () => {
        span({ class: 'eyebrow' }, 'Две независимые библиотеки');
        p('FuncUI рисует интерфейс. FuncRouter выбирает, какую функцию вызвать.');
        code('Никаких специальных компонентов');
      });
    });
  }

  function navLink(path, number, text) {
    a({
      href: path,
      'data-nav': ''
    }, () => {
      span({ class: 'nav-number' }, number);
      span(text);
    });
  }

  function heading(kicker, title, description) {
    div({ class: 'page-heading' }, () => {
      p({ class: 'eyebrow' }, kicker);
      h1(title);
      p({ class: 'description' }, description);
    });
  }

  function home() {
    heading(
      'FuncUI × FuncRouter',
      'Разные страницы.\nОдин JavaScript.',
      'Перемещайтесь по ссылкам, открывайте профили и проверяйте guards. ' +
        'Адрес меняется, приложение продолжает работать.'
    );

    section({ class: 'hero-panel' }, () => {
      div(() => {
        span({ class: 'pill' }, 'Независимый роутер');
        h2('Маршрут → функция → интерфейс');
        p('Здесь функция создаёт страницу на FuncUI. В соседнем демо такая же функция рисует геометрию на canvas.');
        a({
          class: 'button primary',
          href: '/users'
        }, 'Открыть пользователей ↗');
      });

      div({
        class: 'route-illustration',
        'aria-hidden': 'true'
      }, () => {
        span({ class: 'illustration-path' }, '/users/:id');
        span({ class: 'route-line' });
        div({ class: 'illustration-card' }, () => {
          span({ class: 'avatar' }, 'АЛ');
          span('Ада Лавлейс');
          code('params.id → 1');
        });
      });
    });

    section({
      class: 'feature-grid',
      'aria-label': 'Попробуйте возможности'
    }, () => {
      feature(
        '/users/1/settings',
        '01 / Параметры',
        'Вложенный профиль',
        '/users/1/settings',
        'Числовой id наследуется дочерней страницей.'
      );

      feature(
        '/workspace',
        '02 / Guards',
        'Закрытая страница',
        'beforeEnter',
        'Проверка входа перенаправляет на форму и запоминает цель.'
      );

      feature(
        '/notes',
        '03 / Жизненный цикл',
        'Не потерять заметку',
        'beforeLeave',
        'Измените текст и попробуйте уйти без сохранения.'
      );
    });

    p({ class: 'quiet-note' }, () => {
      span('Ещё один маршрут: ');
      a({ href: '/somewhere/unknown' }, 'открыть страницу 404');
    });
  }

  function feature(href, kicker, title, snippet, description) {
    a({
      href,
      class: 'feature-card'
    }, () => {
      span({ class: 'eyebrow' }, kicker);
      h3(title);
      p(description);
      code(snippet);
      span({
        class: 'card-arrow',
        'aria-hidden': 'true'
      }, '↗');
    });
  }

  function usersPage() {
    heading(
      '02 / Параметры пути',
      'Люди за идеями',
      'Каждая карточка — обычная ссылка. FuncRouter извлекает id из адреса, ' +
        'проверяет его и передаёт функции профиля.'
    );

    section({
      class: 'user-grid',
      'aria-label': 'Пользователи'
    }, () => {
      for (const user of users) {
        a({
          class: 'user-card',
          href: `/users/${user.id}`
        }, () => {
          span({
            class: 'avatar large',
            style: { background: user.color }
          }, user.initials);

          code(`USER / 0${user.id}`);
          h2(user.name);
          p(user.role);
          span({ class: 'text-link' }, 'Открыть профиль ↗');
        });
      }
    });
  }

  function profile({ params }) {
    const user = users.find(user => user.id === params.id);

    if (!user) {
      heading(
        'Пользователь не найден',
        `Нет пользователя #${params.id}`,
        'Путь корректен, но такого пользователя нет в демо.'
      );

      a({
        href: '/users',
        class: 'button'
      }, 'К списку');

      return;
    }

    heading('02 / Пользователь', user.name, user.role);
    userTabs(user.id, false);

    article({ class: 'panel profile-panel' }, () => {
      span({
        class: 'avatar extra-large',
        style: { background: user.color }
      }, user.initials);

      div(() => {
        h2('Данные из адресной строки');
        p(`Маршрут /users/:id получил id = ${params.id}.`);
        code(`typeof params.id === '${typeof params.id}'`);
        p({ class: 'muted' }, 'Параметр преобразован обычной функцией parseId. Роутер ничего не знает о компонентах этой страницы.');
      });
    });
  }

  function userSettings({ params }) {
    heading(
      '02 / Вложенный маршрут',
      'Настройки профиля',
      `Адрес /users/${params.id}/settings объединяет родительский параметр :id ` +
        'и дочерний путь settings.'
    );

    userTabs(params.id, true);

    article({ class: 'panel' }, () => {
      h2('Параметры остаются рядом');
      p(`Дочерняя функция получила params.id = ${params.id}.`);
      code("route(':id', { params, children: [...] })");
    });
  }

  function userTabs(id, settings) {
    nav({
      class: 'tabs',
      'aria-label': 'Разделы профиля'
    }, () => {
      a({
        href: `/users/${id}`,
        'aria-current': settings ? null : 'page'
      }, 'Профиль');

      a({
        href: `/users/${id}/settings`,
        'aria-current': settings ? 'page' : null
      }, 'Настройки');

      a({ href: '/users' }, 'Все пользователи ↗');
    });
  }

  function login({ query }) {
    function signIn() {
      state.user = 'Исследователь';

      const nextPath = query.get('next') || '/workspace';

      go(nextPath, {
        replace: true
      });
    }

    heading(
      '03 / Guard входа',
      'Сначала познакомимся',
      'Асинхронный beforeEnter перенаправил вас сюда. ' +
        'После входа вы вернётесь на запрошенный маршрут.'
    );

    article({ class: 'panel narrow' }, () => {
      span({ class: 'pill' }, 'Демонстрационный вход');
      h2('Продолжить как исследователь');
      p('Это локальное состояние демо. Оно сбрасывается при перезагрузке.');
      p(() => {
        span('После входа: ');
        code(query.get('next') || '/workspace');
      });

      button({
        class: 'primary',
        onClick: signIn
      }, 'Войти и продолжить ↗');
    });
  }

  function privatePage() {
    function signOut() {
      state.user = '';
      go('/');
    }

    heading(
      '03 / Доступ разрешён',
      `Добро пожаловать, ${state.user.toLowerCase()}`,
      'Guard разрешил переход. Ни один обработчик защищённой страницы ' +
        'не выполнялся до завершения проверки.'
    );

    article({ class: 'panel' }, () => {
      span({ class: 'pill' }, 'beforeEnter → true');
      h2('Ваше рабочее пространство');
      p('Здесь мог бы находиться личный раздел приложения. FuncRouter отвечает только за порядок переходов.');
      button({ onClick: signOut }, 'Выйти из демо');
    });
  }

  function notes() {
    function editNote(event) {
      note.text = event.target.value;
    }

    function saveNote() {
      note.saved = note.text;
    }

    function noteStatus() {
      if (note.text === note.saved) {
        return 'Изменения сохранены в памяти';
      }

      return 'Есть несохранённые изменения';
    }

    heading(
      '04 / Guard выхода',
      'Мысль, которую стоит сохранить',
      'Измените текст и перейдите в другой раздел. ' +
        'Guard спросит подтверждение, пока изменения не сохранены.'
    );

    article({ class: 'panel' }, () => {
      label({ htmlFor: 'note' }, 'Ваша заметка');
      textarea({
        id: 'note',
        rows: 6,
        value: () => note.text,
        onInput: editNote
      });

      div({ class: 'note-actions' }, () => {
        button({
          class: 'primary',
          disabled: () => note.text === note.saved,
          onClick: saveNote
        }, 'Сохранить');

        span({
          class: 'muted',
          'data-note-status': ''
        }, noteStatus);
      });
    });
  }

  function docs({ params }) {
    heading(
      '05 / Обобщённый путь',
      'Сколько угодно вложенности',
      'Терминальный *path собирает весь оставшийся путь в один параметр.'
    );

    article({ class: 'panel' }, () => {
      code('/docs/*path');
      h2(params.path || 'Корень документации');
      p(`params.path = ${JSON.stringify(params.path)}`);
      a({
        class: 'button',
        href: '/docs/api/guards/before-enter'
      }, 'Открыть более глубокий путь ↗');
    });
  }

  function notFound({ params }) {
    heading(
      '404 / Неизвестный маршрут',
      'Здесь пока ничего нет',
      `Общий маршрут * поймал путь «${params.path}». Приложение продолжает работать.`
    );

    a({
      class: 'button primary',
      href: '/'
    }, 'Вернуться к обзору ↗');
  }

  return {
    router,
    stop() {
      unsubscribe();
      router.stop();
      shell.unmount();
    }
  };
}

function parseId(value) {
  const number = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) {
    throw new TypeError('ID пользователя должен быть положительным целым числом.');
  }

  return number;
}
