# Polymarket EDA

A lightweight dashboard for exploring Polymarket trader metrics and label distributions.

[Live GitHub Page](https://natejamesgithub.github.io/polymarket-eda/)

## Requirements

- Python 3 with pip
- A web browser
- Git for publishing
- npm (optional)

## Dataset

Download [data.parquet](https://drive.google.com/file/d/1wEvzJe5wpAbR4YxQTr3ses-RUnC_lfgw/view?pli=1) and save it as `data/data.parquet`.

The dataset contains trader summaries, not daily transaction history. Displayed medians are approximate.

## Project Structure

    data/
    ├── data.parquet     # Local source; excluded from Git
    └── summary.json     # Generated data; committed for deployment
    index.html          # Page structure
    style.css           # Styling
    app.js              # Metrics and charts
    prepare.py          # Generates summary.json
    requirements.txt    # Python dependencies
    package.json        # Optional npm shortcuts
    .gitignore
    README.md

## Run Locally

From the project folder:

    python3 -m pip install -r requirements.txt
    python3 prepare.py
    python3 -m http.server 8000 --bind 127.0.0.1

Open http://localhost:8000. Stop the server with `Ctrl+C`.

Optional npm shortcuts: `npm run prepare:data` and `npm start`.

## Update the Data

Replace `data/data.parquet`, then regenerate:

    python3 prepare.py

Refresh your browser. To publish the update:

    git add data/summary.json
    git commit -m "Update dashboard data"
    git push origin main
