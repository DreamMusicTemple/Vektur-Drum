#!/bin/sh
# C++ engine (through the C API) ↔ web engine parity. Needs a C++17 compiler and Node. Build the web app first.
set -e
cd "$(dirname "$0")"
D=../../native/Sources/VekturDrumDSP
node scenario.js
c++ -std=c++17 -O2 -I $D/include -I $D run_cpp.cpp $D/vd_engine.cpp $D/vd_sample.cpp -o /tmp/vd_parity && /tmp/vd_parity events.txt out_cpp.f32
c++ -std=c++17 -O2 -ffast-math -I $D/include -I $D run_cpp.cpp $D/vd_engine.cpp $D/vd_sample.cpp -o /tmp/vd_parity_fm && /tmp/vd_parity_fm events.txt out_cpp_fm.f32 >/dev/null
c++ -std=c++17 -O2 -DVD_ALT_LIBM=1 -I $D/include -I $D run_cpp.cpp $D/vd_engine.cpp $D/vd_sample.cpp -o /tmp/vd_parity_lm && /tmp/vd_parity_lm events.txt out_cpp_lm.f32 >/dev/null
c++ -std=c++17 -O2 -DVD_ALT_LIBM=2 -I $D/include -I $D run_cpp.cpp $D/vd_engine.cpp $D/vd_sample.cpp -o /tmp/vd_parity_lm2 && /tmp/vd_parity_lm2 events.txt out_cpp_lm2.f32 >/dev/null
node run_js.js
# strict pass: the same performance without FM feedback must match sample for sample
node scenario.js --strict && /tmp/vd_parity events.txt out_cpp.f32 >/dev/null && /tmp/vd_parity_fm events.txt out_cpp_fm.f32 >/dev/null && /tmp/vd_parity_lm events.txt out_cpp_lm.f32 >/dev/null && /tmp/vd_parity_lm2 events.txt out_cpp_lm2.f32 >/dev/null
node run_js.js --strict
rm -f out_cpp.f32 out_cpp_fm.f32 out_cpp_lm.f32 out_cpp_lm2.f32 out_js.f32
