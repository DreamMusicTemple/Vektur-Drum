#!/usr/bin/env python3
"""Vektur Drum — native vs web pixel comparison.

For each size: <web>/<size>.png (tools/ui_parity_web.mjs) against <native>/<size>.png (the app's -renderReference
renders). Compares the part of the panel the native app has built so far: from the top down to the bottom of the
web's SEQUENCER section (from <web>/<size>.json). Writes, per size, a side-by-side, a 50 % overlay and a difference
heatmap into <out>/, and <out>/REPORT.md with the scores:
  mean |Δ|   average per-channel difference, 0–255 (0 = identical)
  ≥24 px     share of pixels whose largest channel difference is 24 or more (visible differences)
  rows off   the vertical offset (pt) that best aligns the two (0 = layouts line up)
usage: ui_parity_diff.py <webDir> <nativeDir> <outDir>
"""
import json, os, sys
import numpy as np
from PIL import Image

web_dir, nat_dir, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
sizes = ["ipad13-landscape", "ipad11-landscape", "ipad11-portrait", "iphone-landscape", "iphone-portrait"]
rows = []
for s in sizes:
    wp, np_ = os.path.join(web_dir, s + ".png"), os.path.join(nat_dir, s + ".png")
    if not (os.path.exists(wp) and os.path.exists(np_)):
        rows.append((s, None)); continue
    W = np.asarray(Image.open(wp).convert("RGB")).astype(np.int16)
    N = np.asarray(Image.open(np_).convert("RGB")).astype(np.int16)
    bottom = None
    try:
        els = json.load(open(os.path.join(web_dir, s + ".json")))
        seq = [e for e in els if (e.get("cls") or "").startswith("dmsec") and any(
            h.get("text") == "SEQUENCER" and h["y"] >= e["y"] and h["y"] < e["y"] + 30 for h in els if h["tag"] == "h5")]
        if seq: bottom = int((seq[0]["y"] + seq[0]["h"]) * 2) + 4
    except Exception:
        pass
    h = min(W.shape[0], N.shape[0], bottom or 10**9); w = min(W.shape[1], N.shape[1])
    Wc, Nc = W[:h, :w], N[:h, :w]
    # best vertical alignment within ±40 px (2×) — tells whether the layout drifts
    best, off = None, 0
    for d in range(-40, 41, 2):
        a = Wc[max(0, d):h + min(0, d)]; b = Nc[max(0, -d):h - max(0, d)]
        m = np.abs(a - b).mean()
        if best is None or m < best: best, off = m, d
    D = np.abs(Wc - Nc)
    mean = float(D.mean()); vis = float((D.max(axis=2) >= 24).mean() * 100)
    heat = (np.clip(D.max(axis=2) * 3, 0, 255)).astype(np.uint8)
    Image.fromarray(np.stack([heat, heat // 4, heat // 4], 2)).save(os.path.join(out, f"{s}-diff.png"))
    Image.fromarray(((Wc + Nc) // 2).astype(np.uint8)).save(os.path.join(out, f"{s}-overlay.png"))
    side = np.concatenate([Wc, np.full((h, 8, 3), [255, 0, 0], np.int16), Nc], axis=1).astype(np.uint8)
    Image.fromarray(side).save(os.path.join(out, f"{s}-side.png"))
    rows.append((s, (mean, vis, off / 2, h // 2)))

with open(os.path.join(out, "REPORT.md"), "w") as f:
    f.write("| size | mean abs diff (0-255) | pixels >= 24 | best vertical offset (pt) | compared height (pt) |\n|---|---|---|---|---|\n")
    for s, r in rows:
        f.write(f"| {s} | " + (" | ".join([f"{r[0]:.2f}", f"{r[1]:.1f} %", f"{r[2]:+.0f}", str(r[3])]) if r else "missing | | |") + " |\n")
print(open(os.path.join(out, "REPORT.md")).read())
