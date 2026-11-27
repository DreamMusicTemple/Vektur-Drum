// Vektur Drum — tests for the C API contract and the real-time plumbing.
//   g++ -std=c++17 -O2 -pthread -Wall -Wextra -I native/Sources/VekturDrumDSP/include -I native/Sources/VekturDrumDSP
//       native/Tests/dsp/test_realtime.cpp -o /tmp/vd_rt && /tmp/vd_rt
// Also built with -fsanitize=thread in CI to catch data races.
#include "vd_engine.h"
#include "realtime.hpp"

#include <cstdio>
#include <thread>
#include <type_traits>

static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { ++fails; std::printf("  FAIL %s\n", msg); } } while (0)

// ---- the contract: layout facts the Swift side and saved automation depend on
static_assert(std::is_trivially_copyable_v<vd_command>, "commands are POD");
static_assert(std::is_trivially_copyable_v<vd_telemetry>, "telemetry is POD");
static_assert(sizeof(vd_command) <= 64, "a command fits a cache line");
static_assert(VD_TRACKS_MAX <= VD_TRACK_CAPACITY, "playable tracks fit the storage");
static_assert(VD_TP_BEND_RATE == 14, "Vektur Pulse's 15 per-track params keep their order");
static_assert(VD_MP_REVERB_DAMPING == 10, "Vektur Pulse's master block keeps its order");
static_assert((int)VD_TP_ENGINE >= 32 && (int)VD_TP_MIDI_NOTE < (int)VD_PARAM_TRACK_FM_BASE, "new track params stay in their block");
static_assert(VD_PARAM_TRACK_BASE >= 256, "master block cannot run into track 0");

int main() {
    // parameter addresses are stable and never overlap
    CHECK(vd_track_param_id(0, VD_TP_MODEL) == 1024, "track 0 model address");
    CHECK(vd_track_param_id(8, VD_TP_LEVEL) == 1024 + 8 * 256 + 5, "track 9 level address");
    CHECK(vd_track_param_id(VD_TRACK_CAPACITY - 1, 255) < VD_PARAM_ID_END, "last address in range");

    // ring: order, full, empty
    {
        vd::SpscRing<vd_command, 8> q; vd_command c{}, o{};
        for (int i = 0; i < 8; ++i) { c.step = (uint8_t)i; CHECK(q.push(c), "push while not full"); }
        CHECK(!q.push(c), "push when full fails");
        for (int i = 0; i < 8; ++i) { CHECK(q.pop(o) && o.step == i, "FIFO order"); }
        CHECK(!q.pop(o), "pop when empty fails");
    }
    // ring: 2 threads, 5 million items, nothing lost, nothing reordered
    {
        static vd::SpscRing<uint64_t, 1024> q; const uint64_t N = 5000000; bool ordered = true; uint64_t got = 0;
        std::thread prod([&] { for (uint64_t i = 0; i < N;) if (q.push(i)) ++i; });
        std::thread cons([&] { uint64_t v, expect = 0; while (expect < N) if (q.pop(v)) { if (v != expect) ordered = false; ++expect; } got = expect; });
        prod.join(); cons.join();
        CHECK(ordered && got == N, "threaded ring: in order, complete");
    }
    // seqlock: a reader never sees a torn snapshot while the writer hammers it
    {
        static vd::SeqlockSnapshot<vd_telemetry> s; vd_telemetry t{};
        CHECK(!s.read(t), "nothing published yet");
        std::atomic<bool> stop{false}; uint64_t reads = 0, torn = 0;
        std::thread w([&] { vd_telemetry x{}; for (uint32_t n = 1; !stop.load(); ++n) {
            x.beat = n; x.output_level = (float)n; for (int k = 0; k < VD_TRACK_CAPACITY; ++k) x.hit_count[k] = n; s.publish(x); std::this_thread::yield(); } });   // the audio thread publishes once per block, not in a tight loop
        for (int spin = 0; spin < 100000000 && !s.read(t); ++spin) std::this_thread::yield();   // let the writer start first (else a busy machine can finish all reads before it publishes once: a flaky 0)
        for (int i = 0; i < 2000000; ++i) if (s.read(t)) { ++reads;
            for (int k = 0; k < VD_TRACK_CAPACITY; ++k) if (t.hit_count[k] != (uint32_t)t.beat || t.output_level != (float)(uint32_t)t.beat) { ++torn; break; } }
        stop = true; w.join();
        std::printf("      seqlock: %llu consistent reads, %llu torn\n", (unsigned long long)reads, (unsigned long long)torn);
        CHECK(reads > 0 && torn == 0, "no torn telemetry");
    }
    std::printf("%s\n", fails ? "FAILED" : "all realtime checks passed");
    return fails ? 1 : 0;
}
