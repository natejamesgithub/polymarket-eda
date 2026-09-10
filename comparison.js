async function loadComparison() {
  const label = document.querySelector('#comparison-label');
  const minimum = document.querySelector('#comparison-min');
  const logarithmic = document.querySelector('#comparison-log');
  const status = document.querySelector('#comparison-status');
  const legend = document.querySelector('#comparison-legend');
  const canvas = document.querySelector('#comparison-canvas');
  const detail = document.querySelector('#comparison-detail');
  const rows = document.querySelector('#comparison-rows');
  const tableDisclosure = rows.closest('details');
  const context = canvas.getContext('2d');

  const number = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  });
  const compact = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const palette = ['#00dc82', '#ff637c', '#66bfff', '#ffc857', '#c69cff'];
  const hint = 'Hover over or tap a point to inspect a trader.';

  let plotted = [];
  let filtered = [];

  try {
    const response = await fetch('./data/comparison.json');
    if (!response.ok) throw new Error('Comparison data unavailable');
    const data = await response.json();

    const labels = [...new Set(data.points.map(point => point.label))].sort();
    const colors = new Map(
      labels.map((name, index) => [name, palette[index % palette.length]]),
    );

    for (const name of labels) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      label.append(option);

      const item = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.background = colors.get(name);
      item.append(dot, document.createTextNode(name));
      legend.append(item);
    }

    function renderTable() {
      if (!tableDisclosure.open) {
        rows.replaceChildren();
        return;
      }

      const fragment = document.createDocumentFragment();

      for (const point of filtered) {
        const row = document.createElement('tr');

        for (const value of [
          point.trader,
          point.label,
          number.format(point.volume),
          number.format(point.pnl),
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        fragment.append(row);
      }
      rows.replaceChildren(fragment);
    }

    function render() {
      const threshold = Math.max(0, Number(minimum.value) || 0);

      filtered = data.points.filter(point =>
        (!label.value || point.label === label.value) &&
        point.volume >= threshold
      );

      status.textContent =
        `${filtered.length.toLocaleString()} shown from a ` +
        `${data.points.length.toLocaleString()}-trader sample · ` +
        `${data.eligible.toLocaleString()} eligible records in dataset · ` +
        `${(data.total - data.eligible).toLocaleString()} excluded ` +
        '(missing/non-finite values or negative volume). Filters apply to sample.';

      detail.textContent = hint;
      renderTable();

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      plotted = [];

      if (!filtered.length || width < 160) {
        detail.textContent = 'No traders to display, or chart is too narrow.';
        return;
      }

      const transform = value => logarithmic.checked
        ? Math.sign(value) * Math.log10(1 + Math.abs(value))
        : value;

      const inverse = value => logarithmic.checked
        ? Math.sign(value) * (10 ** Math.abs(value) - 1)
        : value;

      const left = 78;
      const right = width - 24;
      const top = 24;
      const bottom = height - 65;

      const transformed = filtered.map(point => ({
        point,
        x: transform(point.volume),
        y: transform(point.pnl),
      }));

      // Include zero to retain the profit/loss reference.
      const xMax = Math.max(1, ...transformed.map(point => point.x));
      let yMin = Math.min(0, ...transformed.map(point => point.y));
      let yMax = Math.max(0, ...transformed.map(point => point.y));
      if (yMin === yMax) {
        yMin = -1;
        yMax = 1;
      }

      const xPosition = value => left + value / xMax * (right - left);
      const yPosition = value =>
        bottom - (value - yMin) / (yMax - yMin) * (bottom - top);

      context.font = '12px system-ui';
      context.lineWidth = 1;

      for (let i = 0; i <= 4; i++) {
        const xValue = xMax * i / 4;
        const yValue = yMin + (yMax - yMin) * i / 4;
        const x = xPosition(xValue);
        const y = yPosition(yValue);

        context.strokeStyle = '#292933';
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, bottom);
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();

        context.fillStyle = '#a0a0b0';
        context.textAlign = 'center';
        context.fillText(compact.format(inverse(xValue)), x, bottom + 22);
        context.textAlign = 'right';
        context.fillText(compact.format(inverse(yValue)), left - 10, y + 4);
      }

      context.strokeStyle = '#a0a0b0';
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(left, yPosition(0));
      context.lineTo(right, yPosition(0));
      context.stroke();
      context.setLineDash([]);

      context.globalAlpha = 0.65;

      for (const item of transformed) {
        const x = xPosition(item.x);
        const y = yPosition(item.y);
        context.fillStyle = colors.get(item.point.label);
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fill();
        plotted.push({ x, y, point: item.point });
      }

      context.globalAlpha = 1;
      context.fillStyle = '#e8e8ed';
      context.font = '14px system-ui';
      context.textAlign = 'center';

      const scale = logarithmic.checked ? 'signed log' : 'linear';
      context.fillText(`Trader volume (${scale})`, width / 2, height - 15);

      context.save();
      context.translate(16, (top + bottom) / 2);
      context.rotate(-Math.PI / 2);
      context.fillText(`P&L (${scale})`, 0, 0);
      context.restore();
    }

    function inspect(event) {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      let nearest = null;
      let distance = 12;

      for (const item of plotted) {
        const candidate = Math.hypot(item.x - x, item.y - y);
        if (candidate < distance) {
          distance = candidate;
          nearest = item.point;
        }
      }

      detail.textContent = nearest
        ? `${nearest.trader} · ${nearest.label} · ` +
          `Volume: ${number.format(nearest.volume)} · ` +
          `P&L: ${number.format(nearest.pnl)}`
        : hint;
    }

    label.addEventListener('change', render);
    minimum.addEventListener('input', render);
    logarithmic.addEventListener('change', render);
    tableDisclosure.addEventListener('toggle', renderTable);
    canvas.addEventListener('pointermove', inspect);
    canvas.addEventListener('click', inspect);
    canvas.addEventListener('pointerleave', () => {
      detail.textContent = hint;
    });

    new ResizeObserver(render).observe(canvas);
    render();
  } catch (error) {
    status.textContent =
      'Unable to load trader comparison. Run python3 prepare.py and refresh.';
    console.error(error);
  }
}

loadComparison();