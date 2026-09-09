"""Converts the local Parquet file into a small dashboard summary."""
import json
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
print(f"Prepared {table.num_rows:,} records.")