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
