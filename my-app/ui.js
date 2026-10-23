import {
    header, section, article, div, h2, p, span,
    strong, button, progress, footer
} from 'funcui';

const numbers = new Intl.NumberFormat('ru-RU');

export function pageHeader() {
    header(() => {
        div({ class: 'brand' }, () => {
            span('✦ ');
            span('REACTOR');
        });
        span({ class: 'online' }, '● Система онлайн');
    });
}

export function statistics(state, clickPower) {
    section({ class: 'metrics', 'aria-label': 'Показатели реактора' }, () => {
        metric('Энергия', () => state.energy, ' ⚡');
        metric('Сила клика', clickPower, ' / клик');
        metric('Производство', () => state.drones, ' / сек');
    });
}

function metric(label, value, unit) {
    div({ class: 'metric' }, () => {
        p({ class: 'muted' }, label);
        strong(() => `${numbers.format(value())}${unit}`);
    });
}

export function reactor({ state, goal, clickPower, onCollect }) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let gainLabel;

    function handleClick(event) {
        onCollect();
        if (reducedMotion.matches) return;

        event.currentTarget.animate([
            { scale: 1 },
            { scale: .93 },
            { scale: 1 }
        ], 200);

        gainLabel.animate([
            { opacity: 1, translate: '0 0' },
            { opacity: 0, translate: '0 -65px' }
        ], 650);
    }

    section({ class: 'panel reactor-panel' }, () => {
        div({ class: 'row' }, () => {
            span({ class: 'eyebrow' }, 'Ядро / 01');
            span({ class: 'online' }, () => state.total >= goal
                ? '✦ Звезда зажглась'
                : '● Стабильно');
        });

        div({ class: 'orbit' }, () => {
            for (let ring = 0; ring < 3; ring++) {
                const size = `${70 + ring * 14}%`;
                const requiredUpgrades = ring * 2;

                div({
                    class: 'ring',
                    'aria-hidden': 'true',
                    style: {
                        width: size,
                        height: size,
                        opacity: () => state.boosters + state.drones >= requiredUpgrades ? 1 : .12
                    }
                });
            }

            button({
                class: 'core',
                type: 'button',
                'aria-label': 'Получить энергию',
                onClick: handleClick
            }, () => {
                span({ class: 'core-star', 'aria-hidden': 'true' }, '✦');
                span({ class: 'core-label' }, () => `+${clickPower()} энергии`);
            });

            gainLabel = span({ class: 'gain', 'aria-hidden': 'true' }, () => `+${clickPower()}`);
        });

        p({ class: 'muted' }, 'Нажимай. Усиливай. Повторяй.');
    });
}

export function boosterCard(state, boosterPrice, buyBooster) {
    article({ class: 'panel' }, () => {
        div({ class: 'row' }, () => {
            span({ class: 'upgrade-icon', 'aria-hidden': 'true' }, '↗');
            span({ class: 'owned' }, () => `Куплено: ${state.boosters}`);
        });

        div(() => {
            h2('Усилитель клика');
            p({ class: 'muted' }, '+1 энергия за каждое нажатие.');
        });

        button({
            class: 'btn btn-primary',
            type: 'button',
            disabled: () => state.energy < boosterPrice(),
            onClick: buyBooster
        }, () => `Купить за ${numbers.format(boosterPrice())} ⚡`);
    });
}

export function droneCard(state, dronePrice, buyDrone) {
    article({ class: 'panel' }, () => {
        div({ class: 'row' }, () => {
            span({ class: 'upgrade-icon', 'aria-hidden': 'true' }, '⌘');
            span({ class: 'owned' }, () => `Куплено: ${state.drones}`);
        });

        div(() => {
            h2('Орбитальный дрон');
            p({ class: 'muted' }, '+1 энергия в секунду. Работает сам.');
        });

        button({
            class: 'btn btn-primary',
            type: 'button',
            disabled: () => state.energy < dronePrice(),
            onClick: buyDrone
        }, () => `Купить за ${numbers.format(dronePrice())} ⚡`);
    });
}

export function mission(state, goal) {
    section({ class: 'panel mission' }, () => {
        div({ class: 'row' }, () => {
            h2(() => state.total >= goal
                ? '✦ Сверхновая запущена!'
                : 'Следующая остановка — сверхновая');
            strong(() => `${numbers.format(Math.min(state.total, goal))} / ${numbers.format(goal)} ⚡`);
        });

        progress({
            class: 'progress progress-primary',
            max: goal,
            value: () => Math.min(state.total, goal),
            'aria-label': 'Прогресс до сверхновой'
        });

        p({ class: 'muted' }, () => state.total >= goal
            ? 'Ты создал свою звезду. Теперь сделай её ещё мощнее!'
            : 'Выработай 1000 энергии. Потраченная на улучшения тоже считается.');
    });
}

export function pageFooter() {
    footer(() => {
        span('Сделано на FuncUI · Просто JavaScript.');
        span('Эта звезда живёт до перезагрузки страницы.');
    });
}

export function supernova(state) {
    div({
        class: 'panel supernova',
        role: 'status',
        hidden: () => !state.celebrating
    }, () => {
        h2('✦ Сверхновая!');
        p('Ты зажёг новую звезду. Продолжай сиять.');
    });
}
