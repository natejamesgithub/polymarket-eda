async function loadSpecialization() {
  const minimum = document.querySelector('#specialization-min');
  const status = document.querySelector('#specialization-status');
  const body = document.querySelector('#specialization-rows');

  const number = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  try {
    const response = await fetch('./data/specialization.json');
    if (!response.ok) throw new Error('Specialization data unavailable');
    const data = await response.json();

    function render() {
      const groups = data.cohorts[minimum.value];
      const included = groups.reduce((sum, group) => sum + group.count, 0);
      const belowThreshold = data.total - data.excluded - included;

      status.textContent =
        `${included.toLocaleString()} traders included · ` +
        `${belowThreshold.toLocaleString()} below activity threshold · ` +
        `${data.excluded.toLocaleString()} excluded for invalid or missing ` +
        `data · ${data.topicCount} topic columns`;

      body.replaceChildren();

      for (const group of groups) {
        const row = document.createElement('tr');

        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = group.group;
        row.append(heading);

        function cell(value) {
          const element = document.createElement('td');
          element.textContent = value === null ? '—' : number.format(value);
          row.append(element);
          return element;
        }

        cell(group.count);

        const pnl = cell(group.medianPnl);
        if (group.medianPnl !== null) {
          pnl.className = group.medianPnl > 0
            ? 'pnl-positive'
            : group.medianPnl < 0 ? 'pnl-negative' : '';
        }

        const share = document.createElement('td');

        if (group.positivePnlShare === null) {
          share.textContent = '—';
        } else {
          const meter = document.createElement('meter');
          meter.min = 0;
          meter.max = 1;
          meter.value = group.positivePnlShare;
          meter.setAttribute(
            'aria-label',
            `${group.group}: ${percent.format(group.positivePnlShare)} ` +
            'of traders have positive P&L',
          );

          const label = document.createElement('span');
          label.textContent = percent.format(group.positivePnlShare);
          share.append(meter, label);
        }

        row.append(share);
        cell(group.medianVolume);
        cell(group.medianTransactions);
        body.append(row);
      }
    }

    minimum.addEventListener('change', render);
    render();
  } catch (error) {
    status.textContent =
      'Unable to load topic specialization. Run python3 prepare.py and refresh.';
    console.error(error);
  }
}

loadSpecialization();