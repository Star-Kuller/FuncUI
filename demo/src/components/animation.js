import { $, article, h2, p, div, span, code, label, input, button } from 'funcui';

let nextAnimationId = 0;

export function springAnimation({ signal }) {
  const state = $({
    position: 0.5,
    velocity: 0,
    target: 0.8,
    stiffness: 90,
    damping: 10,
    running: false
  });

  const id = `spring-${nextAnimationId++}`;
  const motion = createMotion(state, signal);

  article({
    class: 'card animation-card',
    'aria-labelledby': `${id}-title`
  }, () => {
    cardHeading(`${id}-title`);
    springTrack(state);

    div({ class: 'spring-settings' }, () => {
      setting(state, 'stiffness', 'Stiffness', 20, 180, `${id}-stiffness`);
      setting(state, 'damping', 'Damping', 2, 30, `${id}-damping`);
    });

    motionButtons(state, motion);
    motionStatus(state);
  });
}

function cardHeading(titleId) {
  div({ class: 'card-label' }, () => {
    span('04 / JavaScript animation');
    code('animation.js');
  });

  h2({ id: titleId }, 'A little spring physics');
  p({ class: 'card-description' }, 'Less damping, more bounce. Change the settings while it moves.');
}

function springTrack(state) {
  div({ class: 'spring-stage', 'aria-hidden': 'true' }, () => {
    div({ class: 'spring-track' }, () => {
      div({
        class: 'spring-target',
        style: {
          left: () => `${state.target * 100}%`
        }
      });

      // Кадр меняет только state. Положение шара обновляет обычный реактивный style.
      div({
        class: 'spring-ball',
        style: {
          left: () => `${state.position * 100}%`
        }
      });
    });

    div({ class: 'track-labels' }, () => {
      span('0');
      span('target');
      span('1');
    });
  });
}

function setting(state, key, title, min, max, id) {
  div({ class: 'spring-setting' }, () => {
    label({ htmlFor: id }, () => {
      span(title);
      span({ class: 'setting-value' }, () => state[key]);
    });

    input({
      id,
      type: 'range',
      min,
      max,
      step: 1,
      value: () => state[key],
      onInput: event => {
        state[key] = Number(event.target.value);
      }
    });
  });
}

function motionButtons(state, motion) {
  function moveTarget() {
    if (state.target === 0.8) {
      state.target = 0.2;
    } else {
      state.target = 0.8;
    }

    motion.start();
  }

  function togglePlayback() {
    if (state.running) {
      motion.pause();
    } else {
      motion.start();
    }
  }

  div({
    class: 'toolbar motion-controls',
    role: 'group',
    'aria-label': 'Animation controls'
  }, () => {
    button({
      class: 'primary',
      type: 'button',
      onClick: moveTarget
    }, 'Move target');

    button({
      type: 'button',
      onClick: togglePlayback
    }, () => state.running ? 'Pause' : 'Play');

    button({
      type: 'button',
      onClick: motion.reset
    }, 'Reset motion');
  });
}

function motionStatus(state) {
  p({ class: 'example-note' }, () => {
    let status = 'Paused';

    if (state.running) {
      status = 'Moving';
    } else if (Math.abs(state.position - state.target) < 0.001) {
      status = 'Settled';
    }

    const position = state.position.toFixed(3);
    const velocity = state.velocity.toFixed(2);

    return `${status} · position ${position} · velocity ${velocity}`;
  });
}

function createMotion(state, signal) {
  let frameId = null;
  let previousTime = null;

  function start() {
    if (state.running || signal.aborted) {
      return;
    }

    state.running = true;
    previousTime = null;

    frameId = requestAnimationFrame(frame);
  }

  function pause() {
    state.running = false;

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }

    frameId = null;
    previousTime = null;
  }

  function reset() {
    pause();

    state.position = 0.5;
    state.velocity = 0;
    state.target = 0.8;
  }

  function frame(time) {
    frameId = null;

    if (!state.running || signal.aborted) {
      return;
    }

    if (previousTime !== null) {
      // Ограничение dt убирает скачок после фоновой вкладки; подшаги стабилизируют пружину.
      const elapsedSeconds = (time - previousTime) / 1000;
      const frameDuration = Math.min(elapsedSeconds, 1 / 30);
      const stepDuration = frameDuration / 4;

      for (let step = 0; step < 4; step++) {
        const displacement = state.target - state.position;
        const springForce = displacement * state.stiffness;
        const dampingForce = state.velocity * state.damping;
        const force = springForce - dampingForce;

        state.velocity += force * stepDuration;
        state.position += state.velocity * stepDuration;
      }

      const closeToTarget = Math.abs(state.position - state.target) < 0.001;
      const movingSlowly = Math.abs(state.velocity) < 0.001;

      if (closeToTarget && movingSlowly) {
        state.position = state.target;
        state.velocity = 0;

        pause();

        return;
      }
    }

    previousTime = time;
    frameId = requestAnimationFrame(frame);
  }

  // requestAnimationFrame живёт вне DOM. Владелец демо отменяет его через стандартный AbortSignal.
  signal.addEventListener('abort', pause, { once: true });

  return { start, pause, reset };
}
