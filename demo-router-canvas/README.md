# FuncRouter — Canvas lab

Статический HTML, обычный JavaScript и Canvas 2D. Единственная runtime-зависимость —
FuncRouter. В приложении нет компонентов, FuncUI или другой UI-библиотеки.

Из корня workspace:

```sh
npm install
npm run dev:canvas
```

Примеры адресов:

```text
/shapes/circle/100?color=b6a2ff
/shapes/rectangle/260/160?color=9de6c4&rotation=15
/shapes/polygon/6/120?color=f1c28b&rotation=30
/gallery/experiments/geometry
/unknown/shape
```

Параметры пути проверяются и преобразуются в числа. Query управляет цветом и
поворотом. Флажок «Зафиксировать сцену» демонстрирует родительский guard,
отменяющий переходы к фигурам. Неверные параметры показывают ошибку и сохраняют
текущую сцену. Изменить URL можно ссылками, формой и кнопками истории браузера.

В `src/app.js` находятся маршруты и обычные DOM listeners, в `src/draw.js` —
рисование. В интеграционных тестах проверяются команды Canvas 2D и работа
переходов, без подключения UI-фреймворка.

```sh
npm test -w demo-router-canvas
npm run build -w demo-router-canvas
```
