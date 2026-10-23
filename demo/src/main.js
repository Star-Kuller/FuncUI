import { mount, main, header, h1, p, span, section } from 'funcui';
import './styles.css';
import { hello } from './components/hello.js';
import { counter } from './components/counter.js';
import { usersList } from './components/users.js';
import { springAnimation } from './components/animation.js';

const lifetime = new AbortController();

const app = mount('#app', () => {
  main({ class: 'demo' }, () => {
    pageHeading();
    examples();
  });
});

function pageHeading() {
  header({ class: 'page-heading' }, () => {
    p({ class: 'stage-label' }, 'Stage 01 · HTML DSL + Reactivity');

    h1(() => {
      span('Func');
      span({ class: 'title-accent' }, 'UI');
    });

    p({ class: 'page-description' }, 'Reactive interfaces. Just JavaScript.');
  });
}

function examples() {
  section({ class: 'examples', 'aria-label': 'Interactive examples' }, () => {
    hello({ name: 'World' });
    counter();
    usersList();
    springAnimation({ signal: lifetime.signal });
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    lifetime.abort();
    app.unmount();
  });
}
