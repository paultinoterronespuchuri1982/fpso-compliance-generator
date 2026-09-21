# fpso-compliance-generator

FPSO Compliance Report Generator using Claude API

A FastAPI backend that turns FPSO (Floating Production Storage Offloading) watch
logs into structured SOLAS/IMO compliance reports using Claude, with a simple
web UI for entering logs and viewing generated reports.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # then set ANTHROPIC_API_KEY
python main.py
```

The app runs at http://localhost:8000.

## API

- `GET /health` — service/health check
- `POST /api/sample-logs` — returns a sample operational log payload
- `POST /api/generate-report` — generates a compliance report from an
  `OperationalLog` (see `main.py` for the schema), with `language` set to
  `en` or `pt`
