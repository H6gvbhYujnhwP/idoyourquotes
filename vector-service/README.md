# Vector Extraction Service

Python microservice that extracts coloured tray line paths from CAD PDFs and measures their real-world lengths.

## What it does

- Uses PyMuPDF to read ALL vector paths from a PDF, including OCG (Optional Content Group) layers where CAD tray lines live
- Filters to only coloured (non-grey/black) stroked paths
- Merges connected path segments into continuous runs
- Converts PDF unit lengths to real-world metres using scale and paper size
- Returns results grouped by colour (which maps to tray type: blue=LV, yellow=ELV, red=FA)

## API

### `POST /extract`
Upload a PDF and get measured tray line data back.

**Request:** Multipart form with `pdf` file field.

**Query params (all optional):**
- `scale` — e.g. `100` for 1:100 (auto-detected from drawing text if not provided)
- `paper_size` — e.g. `A1` (auto-detected if not provided)
- `page` — page number, default `1`

**Response:**
```json
{
  "page_width": 2384.0,
  "page_height": 1684.0,
  "scale": "1:100",
  "paper_size": "A1",
  "metres_per_pdf_unit": 0.035278,
  "total_coloured_paths": 156,
  "runs": [
    {
      "colour": "#4146fd",
      "total_length_metres": 47.3,
      "total_length_pdf_units": 1341.2,
      "segment_count": 12,
      "bbox": {"x0": 100, "y0": 200, "x1": 1500, "y1": 800},
      "midpoint": {"x": 800, "y": 500},
      "segments": [...]
    }
  ],
  "colour_summary": {
    "#4146fd": {"run_count": 3, "total_length_metres": 47.3},
    "#cc1f26": {"run_count": 2, "total_length_metres": 22.1}
  }
}
```

### `GET /health`
Returns `{"status": "ok"}`.

## Deploy on Render

1. Create a new **Web Service** on Render
2. Connect your repo (or use Docker)
3. Settings:
   - **Runtime:** Docker
   - **Dockerfile path:** `vector-service/Dockerfile`
   - **Port:** 5050
   - **Instance type:** Starter (512MB RAM is enough)
   - **Health check path:** `/health`

4. Add env var to your main Node.js service:
   ```
   VECTOR_SERVICE_URL=https://your-vector-service.onrender.com
   ```

## Local development

```bash
cd vector-service
pip install -r requirements.txt
python app.py
```

Test:
```bash
curl -X POST http://localhost:5050/extract \
  -F "pdf=@drawing.pdf" \
  -G -d "scale=100" -d "paper_size=A1"
```

## How it integrates

The existing Node.js containment takeoff already has:
1. `vectorClient.ts` — HTTP client that calls this service
2. Enrichment code in `containmentTakeoff.ts` that matches vector runs to tray runs by colour and replaces estimated lengths with measured ones

If this service is down or unavailable, the containment takeoff falls back silently to annotation-based length estimates. Zero risk to existing functionality.
