"""
Vector Extraction Service for IdoYourQuotes
Extracts coloured line paths from CAD PDFs and measures their real-world lengths.

Reads OCG (Optional Content Group) layers where tray lines typically live,
groups paths by colour, and returns measured lengths per colour group.

Endpoints:
  POST /extract  - Extract vector lines from a PDF (multipart upload)
  GET  /health   - Health check
"""
import io
import math
import sys
from collections import defaultdict
from typing import Optional

import fitz  # PyMuPDF
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── Paper sizes in mm (landscape width) ───
PAPER_WIDTHS_MM = {
    "A0": 1189,
    "A1": 841,
    "A2": 594,
    "A3": 420,
    "A4": 297,
}

# ─── Colour helpers ───

def rgb_to_hex(r: float, g: float, b: float) -> str:
    """Convert 0-1 floats to hex string."""
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def hex_to_rgb(h: str) -> tuple:
    """Convert hex to 0-1 floats."""
    h = h.lstrip("#")
    return (int(h[0:2], 16)/255, int(h[2:4], 16)/255, int(h[4:6], 16)/255)


def colour_distance(c1: str, c2: str) -> float:
    """Euclidean distance between two hex colours."""
    r1, g1, b1 = hex_to_rgb(c1)
    r2, g2, b2 = hex_to_rgb(c2)
    return math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)


def is_coloured(r: float, g: float, b: float, sat_threshold: float = 0.15) -> bool:
    """Check if an RGB colour is meaningfully coloured (not black/grey/white)."""
    brightness = (r + g + b) / 3
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    saturation = (max_c - min_c) / max_c if max_c > 0 else 0
    return 0.08 < brightness < 0.94 and saturation > sat_threshold


def cmyk_to_rgb(c: float, m: float, y: float, k: float) -> tuple:
    """CMYK to RGB conversion."""
    r = (1 - c) * (1 - k)
    g = (1 - m) * (1 - k)
    b = (1 - y) * (1 - k)
    return (r, g, b)


# ─── Path extraction ───

def extract_coloured_paths(page: fitz.Page):
    """
    Extract all coloured (non-grey) stroked paths from a PDF page.
    Returns list of dicts: {colour, points, length_pdf_units, bbox}
    
    Uses PyMuPDF's path extraction which reads ALL content including OCG layers.
    This is the key advantage over pdfjs-dist which only reads the default layer.
    """
    paths = []
    
    try:
        # page.get_drawings() returns all vector paths including from OCG layers
        drawings = page.get_drawings()
    except Exception as e:
        print(f"[Vector] get_drawings() failed: {e}", file=sys.stderr)
        return paths

    for drawing in drawings:
        # We only care about stroked paths (not fills)
        stroke_colour = drawing.get("color")
        if stroke_colour is None:
            continue
        
        # stroke_colour is a tuple of floats, length depends on colour space
        r, g, b = 0.0, 0.0, 0.0
        if len(stroke_colour) == 3:
            r, g, b = stroke_colour
        elif len(stroke_colour) == 4:
            r, g, b = cmyk_to_rgb(*stroke_colour)
        elif len(stroke_colour) == 1:
            r = g = b = stroke_colour[0]
        else:
            continue

        if not is_coloured(r, g, b):
            continue

        hex_colour = rgb_to_hex(r, g, b)
        
        # Extract path points from items
        points = []
        for item in drawing.get("items", []):
            op = item[0]  # operation type: "l" (line), "c" (curve), "re" (rect), etc.
            if op == "l":  # line
                p1, p2 = item[1], item[2]
                if not points or (points[-1] != (p1.x, p1.y)):
                    points.append((p1.x, p1.y))
                points.append((p2.x, p2.y))
            elif op == "c":  # cubic bezier
                # Use start and end points (skip control points)
                p1, p4 = item[1], item[4]
                if not points or (points[-1] != (p1.x, p1.y)):
                    points.append((p1.x, p1.y))
                points.append((p4.x, p4.y))
            elif op == "re":  # rectangle — skip (not a tray line)
                continue
            elif op == "qu":  # quad — skip
                continue

        if len(points) < 2:
            continue

        # Calculate total path length in PDF units
        total_length = 0.0
        for i in range(len(points) - 1):
            dx = points[i+1][0] - points[i][0]
            dy = points[i+1][1] - points[i][1]
            total_length += math.sqrt(dx*dx + dy*dy)

        if total_length < 5.0:  # skip tiny fragments
            continue

        # Bounding box
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]

        paths.append({
            "colour": hex_colour,
            "points": points,
            "length_pdf_units": total_length,
            "bbox": {
                "x0": min(xs), "y0": min(ys),
                "x1": max(xs), "y1": max(ys),
            },
        })

    return paths


def merge_connected_paths(paths: list, merge_distance: float = 5.0) -> list:
    """
    Merge paths of the same colour that are connected (endpoints close together).
    This handles cases where a single tray run is drawn as multiple path segments.
    """
    if not paths:
        return []
    
    # Group by colour
    colour_groups = defaultdict(list)
    for p in paths:
        colour_groups[p["colour"]].append(p)

    merged = []
    for colour, group in colour_groups.items():
        # Simple greedy merge: for each path, try to connect to existing merged paths
        runs = []
        remaining = list(group)

        while remaining:
            current = remaining.pop(0)
            current_points = list(current["points"])
            changed = True

            while changed:
                changed = False
                new_remaining = []
                for candidate in remaining:
                    # Check if candidate connects to current path
                    c_start = candidate["points"][0]
                    c_end = candidate["points"][-1]
                    cur_start = current_points[0]
                    cur_end = current_points[-1]

                    # Check all four possible connections
                    d1 = math.sqrt((cur_end[0]-c_start[0])**2 + (cur_end[1]-c_start[1])**2)
                    d2 = math.sqrt((cur_end[0]-c_end[0])**2 + (cur_end[1]-c_end[1])**2)
                    d3 = math.sqrt((cur_start[0]-c_start[0])**2 + (cur_start[1]-c_start[1])**2)
                    d4 = math.sqrt((cur_start[0]-c_end[0])**2 + (cur_start[1]-c_end[1])**2)

                    if d1 < merge_distance:
                        current_points.extend(candidate["points"][1:])
                        changed = True
                    elif d2 < merge_distance:
                        current_points.extend(reversed(candidate["points"][:-1]))
                        changed = True
                    elif d3 < merge_distance:
                        current_points = list(reversed(candidate["points"][:-1])) + current_points
                        changed = True
                    elif d4 < merge_distance:
                        current_points = list(candidate["points"]) + current_points[1:]
                        changed = True
                    else:
                        new_remaining.append(candidate)

                remaining = new_remaining

            # Calculate merged length
            total_length = 0.0
            segments = []
            for i in range(len(current_points) - 1):
                x1, y1 = current_points[i]
                x2, y2 = current_points[i+1]
                seg_len = math.sqrt((x2-x1)**2 + (y2-y1)**2)
                total_length += seg_len
                segments.append({
                    "x1": round(x1, 1), "y1": round(y1, 1),
                    "x2": round(x2, 1), "y2": round(y2, 1),
                    "length_pdf_units": round(seg_len, 2),
                })

            xs = [p[0] for p in current_points]
            ys = [p[1] for p in current_points]
            midx = sum(xs) / len(xs)
            midy = sum(ys) / len(ys)

            runs.append({
                "colour": colour,
                "points": current_points,
                "length_pdf_units": total_length,
                "segment_count": len(current_points) - 1,
                "bbox": {
                    "x0": min(xs), "y0": min(ys),
                    "x1": max(xs), "y1": max(ys),
                },
                "midpoint": {"x": round(midx, 1), "y": round(midy, 1)},
                "segments": segments,
            })

        merged.extend(runs)

    return merged


# ─── Scale & measurement ───

def get_metres_per_pdf_unit(scale: str, paper_size: str, page_width: float) -> float:
    """
    Calculate the conversion factor from PDF units to real-world metres.
    """
    # Parse scale ratio
    scale_ratio = 100  # default 1:100
    if scale:
        try:
            scale_ratio = int(scale.replace("1:", "").strip())
        except ValueError:
            pass

    paper_width_mm = PAPER_WIDTHS_MM.get(paper_size, 1189)  # default A0
    
    # PDF unit → mm on paper → real mm → metres
    return (paper_width_mm / page_width) * scale_ratio / 1000


def detect_scale_from_text(page: fitz.Page) -> tuple:
    """Try to detect scale and paper size from text on the page."""
    text = page.get_text("text").upper()
    
    scale = None
    paper_size = None

    # Scale patterns: "1:100", "SCALE 1:50", etc.
    import re
    scale_match = re.search(r'(?:SCALE\s*)?1\s*:\s*(\d+)', text)
    if scale_match:
        scale = f"1:{scale_match.group(1)}"

    # Paper size
    for size in ["A0", "A1", "A2", "A3", "A4"]:
        if size in text:
            paper_size = size
            break

    return scale, paper_size


# ─── API endpoints ───

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "vector-extraction", "version": "1.0.0"})


@app.route("/extract", methods=["POST"])
def extract():
    """
    Extract coloured vector paths from a PDF and return measured lengths.

    Expects multipart form with 'pdf' file.
    Query params:
      - scale: e.g. "100" (for 1:100). Auto-detected if not provided.
      - paper_size: e.g. "A1". Auto-detected if not provided.
      - page: page number (default 1)
    """
    if "pdf" not in request.files:
        return jsonify({"error": "No PDF file uploaded. Send as multipart form with field name 'pdf'"}), 400

    pdf_file = request.files["pdf"]
    pdf_bytes = pdf_file.read()

    if len(pdf_bytes) < 100:
        return jsonify({"error": "PDF file appears to be empty or too small"}), 400

    # Query params
    scale_param = request.args.get("scale", "")
    paper_param = request.args.get("paper_size", "")
    page_num = int(request.args.get("page", "1"))

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        return jsonify({"error": f"Failed to open PDF: {str(e)}"}), 400

    if page_num < 1 or page_num > len(doc):
        return jsonify({"error": f"Page {page_num} out of range (document has {len(doc)} pages)"}), 400

    page = doc[page_num - 1]
    rect = page.rect
    page_width = rect.width
    page_height = rect.height

    # Detect scale from text if not provided
    detected_scale, detected_paper = detect_scale_from_text(page)
    scale = f"1:{scale_param}" if scale_param else (detected_scale or "1:100")
    paper_size = paper_param or detected_paper or "A0"

    metres_per_unit = get_metres_per_pdf_unit(scale, paper_size, page_width)

    print(f"[Vector] Page {page_num}: {page_width:.0f}x{page_height:.0f}, "
          f"scale={scale}, paper={paper_size}, m/unit={metres_per_unit:.6f}")

    # Extract coloured paths
    raw_paths = extract_coloured_paths(page)
    print(f"[Vector] Found {len(raw_paths)} coloured path segments")

    if len(raw_paths) == 0:
        doc.close()
        return jsonify({
            "page_width": round(page_width, 1),
            "page_height": round(page_height, 1),
            "scale": scale,
            "paper_size": paper_size,
            "metres_per_pdf_unit": metres_per_unit,
            "total_coloured_paths": 0,
            "runs": [],
            "colour_summary": {},
        })

    # Merge connected paths into runs
    runs = merge_connected_paths(raw_paths)
    print(f"[Vector] Merged into {len(runs)} connected runs")

    # Convert to real-world lengths and build response
    response_runs = []
    colour_summary = defaultdict(lambda: {"run_count": 0, "total_length_metres": 0.0})

    for run in runs:
        length_metres = round(run["length_pdf_units"] * metres_per_unit, 2)
        
        # Skip very short runs (likely drawing artifacts)
        if length_metres < 0.5:
            continue

        # Convert segments to metres
        segments_metres = []
        for seg in run.get("segments", []):
            segments_metres.append({
                "x1": seg["x1"],
                "y1": seg["y1"],
                "x2": seg["x2"],
                "y2": seg["y2"],
                "length_metres": round(seg["length_pdf_units"] * metres_per_unit, 2),
            })

        response_runs.append({
            "colour": run["colour"],
            "total_length_metres": length_metres,
            "total_length_pdf_units": round(run["length_pdf_units"], 2),
            "segment_count": run["segment_count"],
            "bbox": run["bbox"],
            "midpoint": run["midpoint"],
            "segments": segments_metres,
        })

        colour_summary[run["colour"]]["run_count"] += 1
        colour_summary[run["colour"]]["total_length_metres"] += length_metres

    # Round summary totals
    for colour in colour_summary:
        colour_summary[colour]["total_length_metres"] = round(
            colour_summary[colour]["total_length_metres"], 2
        )

    # Sort runs by length (longest first)
    response_runs.sort(key=lambda r: r["total_length_metres"], reverse=True)

    doc.close()

    print(f"[Vector] Returning {len(response_runs)} runs:")
    for colour, summary in colour_summary.items():
        print(f"[Vector]   {colour}: {summary['run_count']} runs, "
              f"{summary['total_length_metres']}m total")

    return jsonify({
        "page_width": round(page_width, 1),
        "page_height": round(page_height, 1),
        "scale": scale,
        "paper_size": paper_size,
        "metres_per_pdf_unit": metres_per_unit,
        "total_coloured_paths": len(raw_paths),
        "runs": response_runs,
        "colour_summary": dict(colour_summary),
    })


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    print(f"[Vector Service] Starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
