#!/bin/sh
# Vektur Drum — every native (C/C++) check. Needs a C++17 compiler (g++ or clang++) and Node.
#   sh tests/run_native.sh
set -e
cd "$(dirname "$0")/.."
D=native/Sources/VekturDrumDSP
CXX=${CXX:-c++}
SRC="$D/vd_engine.cpp $D/vd_sample.cpp $D/vd_encode.cpp $D/vd_slice.cpp"
INC="-I $D/include -I $D"
W="-Wall -Wextra -Wno-mismatched-new-delete"

echo "== generated tables and manual (from web/src/params.js and web/src/manual.js)"
node tools/gen_native_params.js && node tools/gen_manual.js
echo "== C11 header"
${CC:-cc} -std=c11 -Wall -Wextra -Wpedantic -fsyntax-only -x c $D/include/vd_engine.h
${CC:-cc} -std=c11 -Wall -Wextra -Wpedantic -fsyntax-only -x c $D/include/vd_encode.h
${CC:-cc} -std=c11 -Wall -Wextra -Wpedantic -fsyntax-only -x c -I $D/include $D/include/vd_slice.h
echo "== engine compiles with warnings as errors"
$CXX -std=c++17 -O2 -Wall -Wextra -Werror $INC -c $D/vd_engine.cpp -o /tmp/vd_engine_check.o
# every step must stop the script on failure (a failed compile inside "a && b" or a test behind "| tail" used to pass silently)
ok() { out=$("$@") || { echo "$out"; echo "FAILED: $*"; exit 1; }; echo "$out" | tail -"${TAILN:-1}"; }
echo "== real-time plumbing (ring, snapshot)"
$CXX -std=c++17 -O2 -pthread $W $INC native/Tests/dsp/test_realtime.cpp -o /tmp/vd_rt
ok /tmp/vd_rt
echo "== engine tests"
$CXX -std=c++17 -O2 -pthread $W $INC native/Tests/dsp/test_engine.cpp $SRC -o /tmp/vd_te
TAILN=4 ok /tmp/vd_te
echo "== engine tests under AddressSanitizer + UndefinedBehaviorSanitizer (memory errors, leaks, UB)"
$CXX -std=c++17 -O1 -g -pthread $W -fsanitize=address,undefined -fno-sanitize-recover=undefined $INC native/Tests/dsp/test_engine.cpp $SRC -o /tmp/vd_te_asan
ASAN_OPTIONS=detect_leaks=1 ok /tmp/vd_te_asan
echo "== engine tests under ThreadSanitizer (data races between the main and audio threads)"
$CXX -std=c++17 -O1 -g -pthread $W -fsanitize=thread $INC native/Tests/dsp/test_engine.cpp $SRC -o /tmp/vd_te_tsan 2>/dev/null
TSAN_OPTIONS=halt_on_error=1 ok /tmp/vd_te_tsan
echo "== encoders: C++ ↔ web (WAV, FLAC byte-identical; MP3 decoded with ffmpeg)"
$CXX -std=c++17 -O2 -Wall -Wextra -Werror $INC -c $D/vd_encode.cpp -o /tmp/vd_encode_check.o
$CXX -std=c++17 -O2 $INC tests/native_encode/encode_cpp.cpp $D/vd_encode.cpp -o /tmp/vd_encode_cpp
if command -v ffmpeg >/dev/null; then TAILN=14 ok node tests/native_encode/run.js; else echo "(ffmpeg not found: skipped)"; fi
echo "== sample editor (0.9): vd_slice.cpp ↔ web/src/slices.js — transients, classes, tempo, stretch, prepared buffers"
$CXX -std=c++17 -O2 -Wall -Wextra -Werror $INC -c $D/vd_slice.cpp -o /tmp/vd_slice_check.o
$CXX -std=c++17 -O1 -g $INC -fsanitize=address,undefined -fno-sanitize-recover=undefined tests/native_slice/slice_cpp.cpp $D/vd_slice.cpp $D/vd_sample.cpp -o /tmp/vd_slice_cpp
ok node tests/native_slice/run.js
echo "== C++ engine ↔ web engine parity"
python3 -I tools/build_web.py >/dev/null
sh tests/native_parity/run.sh
