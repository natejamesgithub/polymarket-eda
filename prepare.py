"""Converts the local Parquet file into a small dashboard summary."""
import json
import math
import random
from pathlib import Path
from statistics import median

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

comparison_source = pq.read_table(
    ROOT / "data/data.parquet",
    columns=["trader", "trader_volume", "trader_pnl", "trader_label"],
)

valid_indices = []

for index, (volume, pnl) in enumerate(zip(
    comparison_source["trader_volume"].to_pylist(),
    comparison_source["trader_pnl"].to_pylist(),
)):
    if (
        volume is not None
        and pnl is not None
        and math.isfinite(volume)
        and math.isfinite(pnl)
        and volume >= 0
    ):
        valid_indices.append(index)

sample_indices = random.Random(42).sample(
    valid_indices, min(5000, len(valid_indices))
)

points = [
    {
        "trader": row["trader"] or "Unknown",
        "volume": row["trader_volume"],
        "pnl": row["trader_pnl"],
        "label": row["trader_label"] or "Unlabeled",
    }
    for row in comparison_source.take(sample_indices).to_pylist()
]

(ROOT / "data/comparison.json").write_text(
    json.dumps({
        "total": comparison_source.num_rows,
        "eligible": len(valid_indices),
        "points": points,
    }, allow_nan=False),
    encoding="utf-8",
)

parquet = pq.ParquetFile(ROOT / "data/data.parquet")
topic_columns = [
    name for name in parquet.schema_arrow.names
    if name.startswith("topic_")
]

if not topic_columns:
    raise ValueError("No topic-share columns found.")

thresholds = [0, 10, 100]
group_names = [
    "Diversified (<50%)",
    "Focused (50–75%)",
    "Specialist (≥75%)",
]

groups = {
    threshold: [[] for _ in group_names]
    for threshold in thresholds
}
excluded = 0

columns = topic_columns + [
    "trader_pnl", "trader_volume", "transaction_count"
]

for batch in parquet.iter_batches(batch_size=10000, columns=columns):
    for row in batch.to_pylist():
        shares = [row[name] for name in topic_columns]
        metrics = [
            row["trader_pnl"],
            row["trader_volume"],
            row["transaction_count"],
        ]

        if (
            any(v is None or not math.isfinite(v) for v in shares + metrics)
            or any(v < 0 for v in shares)
            or row["trader_volume"] < 0
            or row["transaction_count"] < 0
        ):
            excluded += 1
            continue

        total_share = sum(shares)
        if not math.isfinite(total_share) or total_share <= 0:
            excluded += 1
            continue

        concentration = max(shares) / total_share
        group = 0 if concentration < 0.5 else (
            1 if concentration < 0.75 else 2
        )

        for threshold in thresholds:
            if row["transaction_count"] >= threshold:
                groups[threshold][group].append(metrics)


def summarize_group(name, records):
    return {
        "group": name,
        "count": len(records),
        "medianPnl": median(r[0] for r in records) if records else None,
        "positivePnlShare": (
            sum(r[0] > 0 for r in records) / len(records)
            if records else None
        ),
        "medianVolume": median(r[1] for r in records) if records else None,
        "medianTransactions": (
            median(r[2] for r in records) if records else None
        ),
    }


specialization = {
    "total": parquet.metadata.num_rows,
    "excluded": excluded,
    "topicCount": len(topic_columns),
    "cohorts": {
        str(threshold): [
            summarize_group(name, records)
            for name, records in zip(group_names, groups[threshold])
        ]
        for threshold in thresholds
    },
}

(ROOT / "data/specialization.json").write_text(
    json.dumps(specialization, allow_nan=False),
    encoding="utf-8",
)

print(f"Prepared {table.num_rows:,} records.")