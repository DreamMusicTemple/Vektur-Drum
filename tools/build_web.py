#!/usr/bin/env python3
"""
Vektur Drum — builds the single-file web test app from web/src.

    python3 -I tools/build_web.py            → web/dist/index.html

web/src is Vektur Drum's own source: it started as the Vektur VJ extraction (reference/web, which stays frozen as the
baseline for parity tests) and now carries Vektur Drum's features. One HTML file, so it works from file://, as a hosted
page, and saved to the iPad home screen.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "web" / "src", ROOT / "web" / "dist" / "index.html"
# order matters: helpers → parameter table → engine → state/panel → kits → presets → samples → host (boots)
MAIN = ["helpers", "logo", "params", "engine", "panel", "factory", "factory-extra", "factory-genres", "factory-more", "presets", "slices", "samples", "glitch-panel", "mod-panel", "pads-window", "breaklab", "songgen", "slicer-panel", "manual", "settings", "appearance", "dials", "state", "undo", "encoders", "export", "host"]


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


def main():
    body = "\n".join(f"/* ==== {n}.js ==== */\n{read(n + '.js')}" for n in MAIN)
    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Vektur Drum">
<meta name="theme-color" content="#0c0d0e">
<title>Vektur Drum</title>
<!-- Built by tools/build_web.py from web/src — edit the sources, not this file. -->
<style>
{read('style.css')}
</style>
</head><body>
<div class="toast" id="toast"></div>
<script>
{read('shim.js')}
</script>
<script id="vd-worklet">
{read('worklet.js')}
</script>
<script>
'use strict';
{body}
</script>
</body></html>
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"built {OUT.relative_to(ROOT)} ({len(page):,} bytes)")


if __name__ == "__main__":
    main()
