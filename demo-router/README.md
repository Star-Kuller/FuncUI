# FuncUI + FuncRouter

Многостраничное SPA: постоянная оболочка на FuncUI и обычные функции страниц.
FuncRouter не импортирует UI-библиотеку; связь находится в функции `page()`
в `src/app.js`, которая вызывает публичные `mount()` / `unmount()` FuncUI.

Из корня workspace:

```sh
npm install
npm run dev:router
```

Маршруты: `/`, `/users`, `/users/:id`, `/users/:id/settings`, `/workspace`,
`/login`, `/notes`, `/docs/*path` и `*` для 404.

Защищённое пространство перенаправляет на демонстрационный вход и возвращает
на целевой адрес. Заметка проверяет несохранённые изменения перед уходом.
Состояние демо хранится в памяти до перезагрузки страницы.

```sh
npm test -w demo-router
npm run build -w demo-router
```
