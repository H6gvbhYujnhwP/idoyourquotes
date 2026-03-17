#!/usr/bin/env python3
"""
extractColours.py — PDF vector colour extraction for IdoYourQuotes containment takeoff.

Used ONLY by the electrical sector containment takeoff (extractPdfLineColours in
electricalTakeoff.ts). No other sector, QDS, billing, or data flow calls this script.

Extracts coloured line/rect geometry from page 1 of a PDF using pdfminer.six, which
resolves graphics state (setGState) colour dictionaries that pdfjs-dist cannot expose.

Usage:
    python3 extractColours.py <pdf_path>

Output (stdout):
    JSON array of segment objects:
    [{"x1":f,"y1":f,"x2":f,"y2":f,"lengthPdfUnits":f,"colour":"#rrggbb","x":f,"y":f}, ...]
    Coordinates are in raw pdfminer space (bottom-left origin, y increases upward).
    The Node caller applies the y-flip (pageHeight - y) after reading results.

Exit codes:
    0 — success (even if 0 segments found, outputs "[]")
    1 — fatal error (Node caller falls back to [] gracefully)
"""

import sys
import json
import math

def to_hex(r, g, b):
    """Convert 0-1 float RGB to #rrggbb hex string."""
    return '#{:02x}{:02x}{:02x}'.format(
        max(0, min(255, int(round(r * 255)))),
        max(0, min(255, int(round(g * 255)))),
        max(0, min(255, int(round(b * 255)))),
    )

def is_coloured(r, g, b):
    """
    Return True if the colour is visibly coloured (not black, white, or grey).
    Matches the brightness/saturation logic in electricalTakeoff.ts resolveColour().
    Thresholds: brightness 0.08–0.94, saturation > 0.15.
    """
    brightness = (r + g + b) / 3.0
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    sat = (max_c - min_c) / max_c if max_c > 0 else 0
    return 0.08 < brightness < 0.94 and sat > 0.15

def resolve_colour(element):
    """
    Try stroking_color first, fall back to non_stroking_color.
    Returns (r, g, b) floats or None if neither passes the is_coloured check.
    Handles RGB tuples (3 values) and grayscale (1 value).
    """
    for attr in ('stroking_color', 'non_stroking_color'):
        colour = getattr(element, attr, None)
        if colour is None:
            continue
        # pdfminer returns tuples/lists; grayscale is a single float or 1-tuple
        if isinstance(colour, (int, float)):
            # Grayscale scalar
            r = g = b = float(colour)
        elif hasattr(colour, '__len__'):
            if len(colour) == 1:
                r = g = b = float(colour[0])
            elif len(colour) >= 3:
                r, g, b = float(colour[0]), float(colour[1]), float(colour[2])
            else:
                continue
        else:
            continue
        if is_coloured(r, g, b):
            return r, g, b
    return None

def rect_longest_segment(x0, y0, x1, y1):
    """
    For a filled rectangle (cable tray drawn as a thin rect), return the longest
    axis as a single segment rather than all 4 sides. This prevents double-counting
    opposite sides (e.g. both long sides of the same tray run).
    The bbox corners are: (x0,y0) bottom-left, (x1,y1) top-right.
    The 4 sides: bottom (x0,y0)→(x1,y0), top (x0,y1)→(x1,y1),
                 left (x0,y0)→(x0,y1), right (x1,y0)→(x1,y1)
    """
    w = abs(x1 - x0)  # horizontal extent
    h = abs(y1 - y0)  # vertical extent
    if w >= h:
        # Horizontal tray — return bottom long side (representative)
        return (x0, y0, x1, y0, w)
    else:
        # Vertical tray — return left long side (representative)
        return (x0, y0, x0, y1, h)

def main():
    if len(sys.argv) < 2:
        print('[]', flush=True)
        sys.exit(0)

    pdf_path = sys.argv[1]

    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LTLine, LTRect, LTCurve, LTLayoutContainer, LTFigure
    except ImportError as e:
        print(f'pdfminer.six not available: {e}', file=sys.stderr)
        sys.exit(1)

    segments = []

    try:
        # Only process page 1 (maxpages=1) — containment drawings are always single-page
        for page_layout in extract_pages(pdf_path, maxpages=1):
            page_height = page_layout.height  # for reference (not used here — Node does y-flip)

            def process_container(container):
                for element in container:
                    # Recurse into figures/groups (AutoCAD sometimes nests geometry)
                    if isinstance(element, (LTLayoutContainer, LTFigure)):
                        process_container(element)
                        continue

                    if isinstance(element, LTRect):
                        # Filled rectangle — take longest axis only
                        colour_rgb = resolve_colour(element)
                        if colour_rgb is None:
                            continue
                        ax1, ay1, ax2, ay2, seg_len = rect_longest_segment(
                            element.x0, element.y0, element.x1, element.y1
                        )
                        if seg_len < 0.5:
                            continue
                        r, g, b = colour_rgb
                        segments.append({
                            'x1': ax1, 'y1': ay1, 'x2': ax2, 'y2': ay2,
                            'lengthPdfUnits': seg_len,
                            'colour': to_hex(r, g, b),
                            'x': (ax1 + ax2) / 2.0,
                            'y': (ay1 + ay2) / 2.0,
                        })

                    elif isinstance(element, (LTLine, LTCurve)):
                        # Line or curve — use bbox endpoints
                        colour_rgb = resolve_colour(element)
                        if colour_rgb is None:
                            continue
                        lx1, ly1, lx2, ly2 = element.x0, element.y0, element.x1, element.y1
                        seg_len = math.sqrt((lx2 - lx1) ** 2 + (ly2 - ly1) ** 2)
                        if seg_len < 0.5:
                            continue
                        r, g, b = colour_rgb
                        segments.append({
                            'x1': lx1, 'y1': ly1, 'x2': lx2, 'y2': ly2,
                            'lengthPdfUnits': seg_len,
                            'colour': to_hex(r, g, b),
                            'x': (lx1 + lx2) / 2.0,
                            'y': (ly1 + ly2) / 2.0,
                        })

            process_container(page_layout)

    except Exception as e:
        print(f'Extraction error: {e}', file=sys.stderr)
        sys.exit(1)

    print(json.dumps(segments), flush=True)
    sys.exit(0)

if __name__ == '__main__':
    main()
