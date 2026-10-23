import { createDemo } from './app.js';
import './styles.css';

const app = createDemo(document.querySelector('#app'));

// Начальная ошибка уже показана через onError. Оставляем роутер активным,
// чтобы пользователь мог перейти на корректный адрес.
await app.router.start({ links: document }).catch(() => {});

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.stop());
}
