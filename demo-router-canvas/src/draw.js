export function drawScene(canvas, scene, pixelRatio = 1) {
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Браузер не поддерживает Canvas 2D.');
  }

  const width = canvas.getBoundingClientRect().width || 900;
  const height = width * 560 / 900;

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#141b26';
  context.fillRect(0, 0, width, height);

  const scale = width / 900;
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(scale, scale);
  grid(context);

  if (scene.kind === 'missing') {
    missing(context);
  } else if (scene.kind === 'overview') {
    overview(context);
  } else {
    shape(context, scene);
  }

  context.restore();
}

function missing(context) {
  context.textAlign = 'center';
  context.fillStyle = '#b6a2ff';
  context.font = '500 100px Segoe UI, sans-serif';
  context.fillText('404', 0, 15);

  context.fillStyle = '#8792a7';
  context.font = '14px Segoe UI, sans-serif';
  context.fillText('Для этого маршрута нет фигуры', 0, 55);
}

function overview(context) {
  context.save();
  context.translate(-210, 0);

  shape(context, {
    kind: 'circle',
    radius: 82,
    color: '#b6a2ff',
    rotation: 0
  });

  context.restore();

  shape(context, {
    kind: 'polygon',
    sides: 3,
    radius: 100,
    color: '#f1c28b',
    rotation: 0
  });

  context.save();
  context.translate(210, 0);

  shape(context, {
    kind: 'rectangle',
    width: 140,
    height: 140,
    color: '#9de6c4',
    rotation: 12
  });

  context.restore();
}

function grid(context) {
  context.strokeStyle = '#a2b5d309';
  context.lineWidth = 1;
  context.beginPath();

  for (let x = -450; x <= 450; x += 30) {
    context.moveTo(x, -280);
    context.lineTo(x, 280);
  }

  for (let y = -270; y <= 280; y += 30) {
    context.moveTo(-450, y);
    context.lineTo(450, y);
  }

  context.stroke();

  context.strokeStyle = '#a2b5d320';
  context.beginPath();
  context.moveTo(-450, 0);
  context.lineTo(450, 0);
  context.moveTo(0, -280);
  context.lineTo(0, 280);
  context.stroke();

  context.fillStyle = '#647089';
  context.font = '10px Consolas, monospace';
  context.fillText('x', 427, -10);
  context.fillText('y', 10, -257);
  context.fillText('0', 9, 16);
}

function shape(context, scene) {
  context.save();
  context.rotate(scene.rotation * Math.PI / 180);
  context.beginPath();

  if (scene.kind === 'circle') {
    context.arc(0, 0, scene.radius, 0, Math.PI * 2);
  } else if (scene.kind === 'rectangle') {
    context.rect(-scene.width / 2, -scene.height / 2, scene.width, scene.height);
  } else {
    polygon(context, scene.sides, scene.radius);
  }

  context.fillStyle = `${scene.color}20`;
  context.strokeStyle = scene.color;
  context.lineWidth = 2;
  context.shadowColor = `${scene.color}40`;
  context.shadowBlur = 30;
  context.fill();
  context.stroke();
  context.shadowBlur = 0;

  // Для круга показываем радиус, а у каждой фигуры отмечаем центр.
  if (scene.kind === 'circle') {
    context.setLineDash([4, 5]);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(scene.radius, 0);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = scene.color;
    context.font = '11px Consolas, monospace';
    context.fillText(`r = ${scene.radius}`, scene.radius / 2 - 20, -12);
  }

  context.fillStyle = scene.color;
  context.beginPath();
  context.arc(0, 0, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function polygon(context, sides, radius) {
  for (let index = 0; index < sides; index++) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
}
