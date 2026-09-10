const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

async function loadDashboard() {
  const chart = document.querySelector("#chart");
  try {
    const response = await fetch("./data/summary.json");
    if (!response.ok) throw new Error("Summary unavailable");
    const data = await response.json();
    const values = [
      data.rows,
      data.traders,
      data.medianVolume,
      data.medianTransactions,
    ];
    document.querySelectorAll(".metrics dd").forEach((element, index) => {
      element.textContent =
        values[index] == null ? "Unavailable" : format.format(values[index]);
      element.removeAttribute("aria-label");
    });
    chart.replaceChildren();
    const maximum = Math.max(1, ...data.labels.map((row) => row.count));
    for (const row of data.labels) {
      const item = document.createElement("div");
      item.className = "bar-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const bar = document.createElement("meter");
      bar.min = 0;
      bar.max = maximum;
      bar.value = row.count;
      bar.setAttribute(
        "aria-label",
        `${row.label}: ${format.format(row.count)} records`,
      );
      const count = document.createElement("span");
      count.textContent = format.format(row.count);
      item.append(label, bar, count);
      chart.append(item);
    }
    if (!data.labels.length) chart.textContent = "No trader labels available.";
  } catch (error) {
    chart.textContent =
      "Data could not be loaded. Generate data/summary.json with prepare.py, then refresh.";
    console.error(error);
  }
}

loadDashboard();

async function loadDistributions() {
  const metric = document.querySelector("#distribution-metric");
  const view = document.querySelector("#distribution-view");
  const status = document.querySelector("#distribution-status");
  const chart = document.querySelector("#distribution-chart");
  const axis = document.querySelector("#distribution-axis");

  const number = new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 4,
  });
  const integer = new Intl.NumberFormat("en-US");

  try {
    const response = await fetch("./data/distributions.json");
    if (!response.ok) throw new Error("Distribution data unavailable");

    const data = await response.json();

    function render() {
      const selected = data[metric.value];

      const distribution = selected[view.value];
      chart.replaceChildren();
      axis.textContent = "";

      status.textContent =
        `${integer.format(distribution.included)} / ` +
        `${integer.format(selected.total)} records shown · ` +
        `${integer.format(selected.missing)} missing · ` +
        `${integer.format(selected.nonFinite)} non-finite · ` +
        `${integer.format(distribution.excluded)} outside selected range`;

      if (!distribution.bins.length) {
        chart.textContent = "No values available for this selection.";
        return;
      }

      const maximum = Math.max(1, ...distribution.bins.map((bin) => bin.count));

      const bars = document.createElement("div");
      bars.className = "histogram";
      bars.setAttribute("role", "group");
      bars.setAttribute("aria-label", `${selected.label} histogram`);

      for (const [index, bin] of distribution.bins.entries()) {
        const bar = document.createElement("button");
        const last = index === distribution.bins.length - 1;
        const range =
          bin.low === bin.high
            ? number.format(bin.low)
            : `${number.format(bin.low)} to ${number.format(bin.high)}` +
              (last ? " (upper bound included)" : " (upper bound excluded)");
        const description = `${range}: ${integer.format(bin.count)} records`;

        bar.type = "button";
        bar.className = "histogram-bin";
        bar.style.setProperty("--height", `${(bin.count / maximum) * 100}%`);
        bar.title = description;
        bar.setAttribute("aria-label", description);
        bar.addEventListener("click", () => {
          detail.textContent = description;
        });
        bars.append(bar);
      }

      const detail = document.createElement("p");
      detail.className = "histogram-detail";
      detail.setAttribute("aria-live", "polite");
      detail.textContent = "Select a bar to inspect its range and count.";

      chart.append(bars, detail);

      const first = distribution.bins[0];
      const last = distribution.bins[distribution.bins.length - 1];
      const scale = view.value === 'log' ? 'Signed log' : 'Linear';

      axis.textContent =
        `${selected.label}: ${number.format(first.low)} → ` +
        `${number.format(last.high)} · ${scale} horizontal scale · ` +
        'Bar height = record count';
    }

    metric.addEventListener("change", render);
    view.addEventListener("change", render);
    render();
  } catch (error) {
    status.textContent =
      "Unable to load distributions. Run python3 prepare.py and refresh.";
    console.error(error);
  }
}

loadDistributions();