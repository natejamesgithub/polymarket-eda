"""Converts the local Parquet file into a small dashboard summary."""
import json
import math
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent
table = pq.read_table(
    ROOT / "data/data.parquet",
    columns=["trader", "trader_volume", "transaction_count", "trader_label"],
)
labels = pc.fill_null(table["trader_label"], "Unlabeled")
counts = pc.value_counts(labels).to_pylist()
summary = {
    "rows": table.num_rows,
    "traders": pc.count_distinct(table["trader"]).as_py(),
    "medianVolume": pc.approximate_median(table["trader_volume"]).as_py(),
    "medianTransactions": pc.approximate_median(table["transaction_count"]).as_py(),
    "labels": sorted(
        [{"label": row["values"], "count": row["counts"]} for row in counts],
        key=lambda row: row["count"], reverse=True,
    ),
}
(ROOT / "data/summary.json").write_text(
    json.dumps(summary, allow_nan=False), encoding="utf-8"
)

METRICS = {
    "trader_volume": "Trader volume",
    "trader_pnl": "Trader P&L",
    "transaction_count": "Transaction count",
} 

def histogram(values, logarithmic=False, bin_count=40, trim=False):
    if not values:
        return {"bins": [], "included": 0, "excluded": 0}

    ordered = sorted(values)

    def quantile(p):
        position = (len(ordered) - 1) * p
        lower = math.floor(position)
        upper = math.ceil(position)
        return (
            ordered[lower]
            + (ordered[upper] - ordered[lower]) * (position - lower)
        )

    lower = quantile(0.01) if trim else ordered[0]
    upper = quantile(0.99) if trim else ordered[-1]
    eligible = [value for value in values if lower <= value <= upper]

    # Signed log supports negative values and zero.
    def transform(value):
        return math.copysign(math.log10(1 + abs(value)), value)

    def inverse(value):
        return math.copysign(10 ** abs(value) - 1, value)

    transformed = [
        transform(value) if logarithmic else value
        for value in eligible
    ]
    low, high = min(transformed), max(transformed)

    if low == high:
        bins = [{
            "low": eligible[0],
            "high": eligible[0],
            "count": len(eligible),
        }]
    else:
        width = (high - low) / bin_count
        counts = [0] * bin_count

        for value in transformed:
            index = max(0, min(
                int((value - low) / width),
                bin_count - 1,
            ))
            counts[index] += 1

        edges = [low + i * width for i in range(bin_count + 1)]
        edges[-1] = high

        if logarithmic:
            edges = [inverse(edge) for edge in edges]

        bins = [
            {"low": edges[i], "high": edges[i + 1], "count": count}
            for i, count in enumerate(counts)
        ]

    return {
        "bins": bins,
        "included": len(eligible),
        "excluded": len(values) - len(eligible),
    }


source = pq.read_table(
    ROOT / "data/data.parquet",
    columns=list(METRICS),
)

distributions = {}

for column, label in METRICS.items():
    raw = source[column].to_pylist()
    values = [
        float(value) for value in raw
        if value is not None and math.isfinite(value)
    ]

    distributions[column] = {
        "label": label,
        "total": len(raw),
        "missing": sum(value is None for value in raw),
        "nonFinite": sum(
            value is not None and not math.isfinite(value)
            for value in raw
        ),
        "central": histogram(values, trim=True),
        "linear": histogram(values),
        "log": histogram(values, logarithmic=True),
    }

(ROOT / "data/distributions.json").write_text(
    json.dumps(distributions, allow_nan=False),
    encoding="utf-8",
)

print(f"Prepared {table.num_rows:,} records.")