import { createRouter, route } from 'funcrouter';
import { drawScene } from './draw.js';

export function createDemo(document) {
  const window = document.defaultView;
  const canvas = document.querySelector('#scene');
  const form = document.querySelector('#shape-form');
  const fields = form.elements;
  const notice = document.querySelector('#notice');
  const lock = document.querySelector('#lock');
  let scene = { kind: 'overview' };

  function message(text) {
    notice.textContent = text;
    notice.hidden = !text;
  }

  function draw() {
    drawScene(canvas, scene, window.devicePixelRatio || 1);
  }

  function show(next, title, detail, description) {
    scene = next;
    document.querySelector('#scene-title').textContent = title;
    document.querySelector('#scene-detail').textContent = detail;
    document.querySelector('#scene-description').textContent = description;
    canvas.setAttribute('aria-label', description);
    draw();
  }

  function shapePage(kind) {
    return function renderShape({ params, query }) {
      const color = query.get('color') || 'b6a2ff';
      const rotation = Number(query.get('rotation') || 0);
      const next = {
        ...params,
        kind,
        color: `#${color}`,
        rotation
      };
      const titles = {
        circle: 'Круг',
        rectangle: 'Прямоугольник',
        polygon: 'Многоугольник'
      };
      const title = titles[kind];
      const detail = shapeDetail(kind, params);
      const description = `${title}: ${detail}, цвет #${color}, поворот ${rotation}°.`;

      show(next, title, detail, description);
      updateShapeControls(kind, params, color, rotation);
    };
  }

  function updateShapeControls(kind, params, color, rotation) {
    fields.shape.value = kind;

    for (const name of ['radius', 'width', 'height', 'sides']) {
      if (params[name] !== undefined) {
        fields[name].value = params[name];
      }
    }

    fields.color.value = `#${color}`;
    fields.rotation.value = rotation;
    updateFields();
  }

  function allowShape() {
    if (!lock.checked) {
      return true;
    }

    message('Сцена зафиксирована: guard отменил переход. Снимите флажок, чтобы сменить фигуру.');

    return false;
  }

  function validateStyle({ to }) {
    const color = to.query.get('color') || 'b6a2ff';
    const rotation = Number(to.query.get('rotation') || 0);

    if (!/^[\da-f]{6}$/i.test(color)) {
      throw new TypeError('Цвет должен состоять из шести шестнадцатеричных символов.');
    }

    if (!Number.isFinite(rotation) || Math.abs(rotation) > 360) {
      throw new TypeError('Поворот должен быть числом от −360 до 360.');
    }
  }

  function showOverview() {
    show(
      { kind: 'overview' },
      'Геометрическая лаборатория',
      'URL → функция → canvas',
      'Круг, треугольник и прямоугольник на координатной сетке.'
    );
  }

  function showGallery({ params }) {
    show(
      { kind: 'overview' },
      'Вложенная галерея',
      params.path || 'Корень галереи',
      `Галерея: ${params.path || 'корень'}. Остаток пути разобран параметром *path.`
    );
  }

  function showMissing({ params }) {
    show(
      { kind: 'missing' },
      'Неизвестный маршрут',
      `/${params.path}`,
      '404: для этого пути фигура не задана.'
    );
  }

  const router = createRouter([
    route('/', showOverview),
    route('/shapes', {
      beforeEnter: [allowShape, validateStyle],
      children: [
        route('circle/:radius', {
          params: {
            radius: numberBetween(12, 180, 'Радиус')
          }
        }, shapePage('circle')),

        route('rectangle/:width/:height', {
          params: {
            width: numberBetween(24, 380, 'Ширина'),
            height: numberBetween(24, 300, 'Высота')
          }
        }, shapePage('rectangle')),

        route('polygon/:sides/:radius', {
          params: {
            sides: numberBetween(3, 12, 'Число сторон', true),
            radius: numberBetween(12, 180, 'Радиус')
          }
        }, shapePage('polygon'))
      ]
    }),
    route('/gallery/*path', showGallery),
    route('*', showMissing)
  ], {
    window,
    onError: error => message(error.message)
  });

  const unsubscribe = router.subscribe(updateAddress);

  function updateAddress(current) {
    document.querySelector('#current-url').textContent = current.url;
    window.document.title = `${current.path} · Canvas lab`;
    message('');
  }

  function updateFields() {
    for (const group of form.querySelectorAll('[data-for]')) {
      const visible = group.dataset.for.split(' ').includes(fields.shape.value);
      group.hidden = !visible;
      group.querySelector('input').disabled = !visible;
    }
  }

  function submit(event) {
    event.preventDefault();
    const shape = fields.shape.value;
    let geometry;

    if (shape === 'rectangle') {
      geometry = `${fields.width.value}/${fields.height.value}`;
    } else if (shape === 'polygon') {
      geometry = `${fields.sides.value}/${fields.radius.value}`;
    } else {
      geometry = fields.radius.value;
    }

    const query = new URLSearchParams({
      color: fields.color.value.slice(1),
      rotation: fields.rotation.value
    });

    // Сообщение об ошибке уже показывается через onError роутера.
    router.navigate(`/shapes/${shape}/${geometry}?${query}`).catch(() => {});
  }

  function unlock() {
    if (!lock.checked) {
      message('');
    }
  }

  form.addEventListener('submit', submit);
  fields.shape.addEventListener('change', updateFields);
  lock.addEventListener('change', unlock);
  window.addEventListener('resize', draw);
  updateFields();

  return {
    router,
    stop() {
      unsubscribe();
      router.stop();
      form.removeEventListener('submit', submit);
      fields.shape.removeEventListener('change', updateFields);
      lock.removeEventListener('change', unlock);
      window.removeEventListener('resize', draw);
    }
  };
}

function shapeDetail(kind, params) {
  if (kind === 'rectangle') {
    return `${params.width} × ${params.height} px`;
  }

  if (kind === 'polygon') {
    return `${params.sides} сторон · R ${params.radius} px`;
  }

  return `R ${params.radius} px`;
}

function numberBetween(min, max, label, integer = false) {
  return function parseNumber(value) {
    const number = Number(value);
    const invalidNumber = !value.trim() || !Number.isFinite(number);
    const outsideRange = number < min || number > max;
    const invalidInteger = integer && !Number.isInteger(number);

    if (invalidNumber || outsideRange || invalidInteger) {
      throw new TypeError(`${label}: введите ${integer ? 'целое ' : ''}число от ${min} до ${max}.`);
    }

    return number;
  };
}
