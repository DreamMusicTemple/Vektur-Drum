// Vektur Drum — native engine tests, through the public C API only (vd_engine.h).
//   D=native/Sources/VekturDrumDSP; c++ -std=c++17 -O2 -pthread -I $D/include -I $D native/Tests/dsp/test_engine.cpp
//     $D/vd_engine.cpp $D/vd_sample.cpp -o /tmp/vd_te && /tmp/vd_te
// Also run under -fsanitize=address,undefined and -fsanitize=thread (tests/run_native.sh).
#include "vd_engine.h"
#include "vd_params.generated.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <string>
#include <thread>
#include <vector>

// ---- allocation counter: every operator new while `watching` counts as a real-time violation
static std::atomic<bool> watching{false};
static std::atomic<long> allocs{0};
void *operator new(std::size_t n) { if (watching.load(std::memory_order_relaxed)) allocs.fetch_add(1); if (void *p = std::malloc(n ? n : 1)) return p; throw std::bad_alloc(); }
void *operator new[](std::size_t n) { if (watching.load(std::memory_order_relaxed)) allocs.fetch_add(1); if (void *p = std::malloc(n ? n : 1)) return p; throw std::bad_alloc(); }
void *operator new(std::size_t n, const std::nothrow_t &) noexcept { if (watching.load(std::memory_order_relaxed)) allocs.fetch_add(1); return std::malloc(n ? n : 1); }
void *operator new[](std::size_t n, const std::nothrow_t &) noexcept { if (watching.load(std::memory_order_relaxed)) allocs.fetch_add(1); return std::malloc(n ? n : 1); }
void operator delete(void *p) noexcept { std::free(p); }
void operator delete[](void *p) noexcept { std::free(p); }
void operator delete(void *p, std::size_t) noexcept { std::free(p); }
void operator delete[](void *p, std::size_t) noexcept { std::free(p); }

static int fails = 0, checks = 0;
#define CHECK(c, ...) do { ++checks; if (!(c)) { ++fails; std::printf("  FAIL %s:%d %s — ", __FILE__, __LINE__, #c); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static vd_param_id A(const char *key) { for (int i = 0; i < VDG_PARAM_COUNT; ++i) if (!std::strcmp(kVDGParams[i].key, key)) return kVDGParams[i].address; std::printf("unknown key %s\n", key); std::exit(2); }
struct Rig {
    vd_engine *e; double sr; std::vector<float> L, R; vd_render_context ctx{}; float *bl[1], *br[1];
    explicit Rig(double rate = 48000, uint32_t maxF = 512) : e(vd_engine_create(rate, maxF)), sr(rate), L(maxF), R(maxF) { bl[0] = L.data(); br[0] = R.data(); ctx.tempo = 120; cmd(VD_CMD_ENABLE, 1); }
    ~Rig() { vd_engine_destroy(e); }
    void set(const char *k, float v) { vd_engine_set_param(e, A(k), v); }
    void cmd(int type, float value = 0) { vd_command c{}; c.type = uint16_t(type); c.u.value = value; vd_engine_send(e, &c); }
    void stepOn(int p, int t, int s, float vel = 0.9f, int rat = 1, float fmr = 0, float chance = 1) {
        vd_command c{}; c.type = VD_CMD_SET_STEP; c.pattern = uint8_t(p); c.track = uint8_t(t); c.step = uint8_t(s);
        c.u.step = vd_step{1, uint8_t(rat), 0, 0, vel, 0, 0, 0, 0, chance, fmr, 0, 0, 0, 0, 220, 0}; vd_engine_send(e, &c); }
    void ringStep(int p, int t, int s, int master, int mask, float amt, float hz) {
        vd_command c{}; c.type = VD_CMD_SET_STEP; c.pattern = uint8_t(p); c.track = uint8_t(t); c.step = uint8_t(s);
        c.u.step = vd_step{1, 1, 0, 0, 0.9f, 0, 0, 0, 0, 1, 0, 1, uint8_t(master), uint16_t(mask), amt, hz, 0}; vd_engine_send(e, &c); }
    void wire(int slot, int src, const char *key, float amt) { vd_command c{}; c.type = VD_CMD_SET_WIRE; c.u.wire.slot = uint8_t(slot); c.u.wire.w.source = uint8_t(src);
        c.u.wire.w.param = key ? A(key) : VD_PARAM_NONE; c.u.wire.w.amount = amt; vd_engine_send(e, &c); }
    void slice(int slot, int act, int src) { vd_command c{}; c.type = VD_CMD_SET_SLICE; c.u.slice.slot = uint8_t(slot); c.u.slice.s = vd_slice{uint8_t(act), uint8_t(src)}; vd_engine_send(e, &c); }
    void note(int t, float v = 0.9f) { vd_command c{}; c.type = VD_CMD_NOTE; c.track = uint8_t(t); c.u.value = v; vd_engine_send(e, &c); }
    // renders `sec` seconds in `block`-frame calls, appending the left channel to `out` if given
    void run(double sec, uint32_t block = 128, std::vector<float> *out = nullptr) {
        const long n = long(sec * sr);
        for (long done = 0; done < n;) {
            const uint32_t f = uint32_t(std::min<long>(block, n - done));
            vd_engine_render(e, &ctx, bl, br, 1, f);
            if (out) out->insert(out->end(), L.begin(), L.begin() + f);
            done += f; ctx.midi = nullptr; ctx.midi_count = 0; ctx.host_beat_valid = false;
        }
        vd_engine_collect_garbage(e);
    }
    vd_telemetry tel() { vd_telemetry t{}; vd_engine_read_telemetry(e, &t); return t; }
};
static float peak(const std::vector<float> &x, size_t a = 0, size_t b = SIZE_MAX) { float p = 0; for (size_t i = a; i < std::min(b, x.size()); ++i) p = std::max(p, std::fabs(x[i])); return p; }
static bool finite(const std::vector<float> &x) { for (float v : x) if (!std::isfinite(v)) return false; return true; }
static long firstAbove(const std::vector<float> &x, float th) { for (size_t i = 0; i < x.size(); ++i) if (std::fabs(x[i]) > th) return long(i); return -1; }

static void test_contract() {
    Rig r;
    CHECK(vd_engine_get_param(r.e, A("t1.decay")) > 0.5f, "default decay");
    vd_engine_set_param(r.e, A("t9.fmindex"), 999.f); CHECK(vd_engine_get_param(r.e, A("t9.fmindex")) == 20.f, "clamped to max");
    vd_engine_set_param(r.e, A("t1.tune"), NAN); CHECK(vd_engine_get_param(r.e, A("t1.tune")) == 0.f, "NaN ignored");
    vd_engine_set_param(r.e, 999, 1.f); CHECK(vd_engine_get_param(r.e, 999) == 0.f, "unknown address ignored");
    vd_engine_set_param(r.e, VD_PARAM_ID_END + 5, 1.f);   // out of range: no crash
    vd_telemetry t{}; CHECK(!vd_engine_read_telemetry(r.e, &t), "no telemetry before the first render");
    r.run(0.01); CHECK(r.tel().track_count == VD_TRACKS_MAX, "9 tracks by default");
    CHECK(kVDGParams[0].address == vd_param_id(VD_PARAM_TRACK_BASE), "t1.model at the track base");
}
static void test_timing_and_drift() {
    Rig r; r.ctx.tempo = 133;
    for (int k = 0; k < 16; k += 4) r.stepOn(0, 0, k);
    r.cmd(VD_CMD_TRANSPORT, 1);
    // trigger times, to the sample, from the engine's own hit counter (1-frame render calls)
    std::vector<long> on; uint32_t h = 0;
    for (long i = 0; i < 4 * 48000; ++i) { vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 1); const uint32_t c = r.tel().hit_count[0]; if (c != h) { h = c; on.push_back(i); } }
    const double beat = 48000.0 * 60.0 / 133.0; bool grid = on.size() >= 8;
    for (size_t i = 1; i < on.size(); ++i) grid = grid && std::fabs((on[i] - on[0]) - beat * double(i)) <= 1.0;   // cumulative: no drift either
    CHECK(grid, "each kick lands on its beat to within 1 sample (%zu kicks)", on.size());
    r.run(300.0, 512); CHECK(std::fabs(r.tel().beat - 304.0 * 133.0 / 60.0) < 1e-6, "no drift over 5 minutes: beat %.9f", r.tel().beat);
}
static void test_midi_sample_accurate() {
    Rig r; r.set("t1.snap", 0); r.run(0.05);
    vd_midi_event ev{300, 0x99, 36, 127, 0}; r.ctx.midi = &ev; r.ctx.midi_count = 1;
    std::vector<float> out; r.run(512.0 / 48000.0, 512, &out);
    const long at = firstAbove(out, 1e-6f); CHECK(at >= 300 && at <= 302, "note at offset 300 sounds at %ld", at);
    vd_midi_event off{10, 0x90, 36, 127, 0}; r.ctx.midi = &off; r.ctx.midi_count = 1; vd_telemetry t0 = r.tel(); r.run(0.01, 512);
    CHECK(r.tel().hit_count[0] == t0.hit_count[0], "channel 1 is not the drum channel");
}
static void test_tracks_engines_choke() {
    Rig r; for (int t = 6; t < 9; ++t) r.stepOn(0, t, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.6);
    vd_telemetry t = r.tel(); CHECK(t.hit_count[6] && t.hit_count[7] && t.hit_count[8], "tracks 7–9 play");
    Rig s; s.cmd(VD_CMD_SET_TRACK_COUNT, 6); for (int k = 6; k < 9; ++k) s.stepOn(0, k, 0); s.cmd(VD_CMD_TRANSPORT, 1); s.run(0.6);
    t = s.tel(); CHECK(t.hit_count[6] + t.hit_count[7] + t.hit_count[8] == 0 && t.track_count == 6, "hidden tracks silent");
    Rig q; for (int k = 1; k <= 9; ++k) q.set((std::string("t") + char('0' + k) + ".level").c_str(), 0); q.set("t1.level", 1); q.set("t1.engine", 1); q.run(0.05);
    std::vector<float> o; q.note(0); q.run(0.2, 128, &o); CHECK(peak(o) < 1e-6f, "sample engine without a sample is silent");
    Rig c; c.set("t1.choke", 2); c.set("t2.choke", 2); c.set("t5.choke", 3); for (const char *k : {"t1.decay", "t2.decay", "t5.decay"}) c.set(k, 3); for (const char *k : {"t1.model", "t2.model", "t5.model"}) c.set(k, 7);
    c.run(0.2); c.note(0); c.note(4); c.run(0.05); const float a = c.tel().envelope[0], e5 = c.tel().envelope[4]; c.note(1); c.run(0.05);
    CHECK(c.tel().envelope[0] < a * 0.01f, "group B: track 2 chokes track 1 (%g → %g)", a, c.tel().envelope[0]);
    CHECK(c.tel().envelope[4] > e5 * 0.5f, "group C keeps ringing");
}
static void test_record_and_telemetry() {
    Rig r; r.cmd(VD_CMD_RECORD_ARM, 1); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.03); r.note(1, 0.7f); r.run(0.01);
    vd_recorded_hit h[8]; const uint32_t n = vd_engine_pop_recorded(r.e, h, 8);
    CHECK(n == 1 && h[0].track == 1 && std::fabs(h[0].velocity - std::round(0.7f * 127) / 127.f) < 1e-6f, "REC hit returned (n=%u)", n);
    vd_telemetry t = r.tel(); CHECK(t.transport == 2 && t.current_step[0] >= 0, "running, playhead set");
    r.cmd(VD_CMD_TRANSPORT, 0); r.run(0.01); CHECK(r.tel().transport == 0, "stopped");
}
static void test_host_clock() {
    Rig r; r.ctx.host_playing_valid = true; r.ctx.host_playing = false; r.stepOn(0, 0, 0); r.run(0.1);
    CHECK(r.tel().transport == 0, "host stopped → stopped");
    r.ctx.host_playing = true; r.ctx.host_beat = 7.98; r.ctx.host_beat_valid = true; r.run(0.1);
    CHECK(r.tel().transport == 2, "host playing → running");
    r.ctx.host_beat_valid = true; r.ctx.host_beat = 100.0; r.run(0.01, 128);
    CHECK(std::fabs(r.tel().beat - (100.0 + 0.01 * 2.0)) < 0.02, "relocation followed: beat %.3f", r.tel().beat);
}
static void test_samples_handoff() {
    Rig r; r.set("t1.engine", 1); r.set("t1.decay", 3);
    for (int round = 0; round < 50; ++round) {   // replace the sample many times while playing: no leaks (ASan), no use-after-free
        std::vector<float> d(4800); for (size_t i = 0; i < d.size(); ++i) d[i] = 0.5f * std::sin(i * 0.05f * (1 + round % 5));
        const float *ch[1] = {d.data()}; vd_engine_set_sample(r.e, 0, vd_sample_create(ch, 1, uint32_t(d.size()), 48000));
        r.note(0); r.run(0.02);
    }
    std::vector<float> o; r.note(0); r.run(0.05, 128, &o); CHECK(peak(o) > 0.1f, "last sample plays");
    vd_engine_set_sample(r.e, 0, nullptr); r.run(0.5); std::vector<float> s;   // (the cut voice leaves a DC-blocker tail first) r.note(0); r.run(0.05, 128, &s); CHECK(peak(s) < 1e-6f, "removed: silent");
    std::vector<float> st(9600), st2(9600); for (size_t i = 0; i < st.size(); ++i) { st[i] = 0.6f; st2[i] = -0.6f; }
    const float *ch2[2] = {st.data(), st2.data()}; vd_engine_set_sample(r.e, 0, vd_sample_create(ch2, 2, 9600, 48000)); r.run(0.01);
    std::vector<float> m; r.note(0); r.run(0.05, 128, &m); CHECK(peak(m) < 1e-3f, "stereo sample plays mono (channels averaged)");
    CHECK(vd_sample_create(nullptr, 1, 100, 48000) == nullptr && vd_engine_set_sample(r.e, 99, nullptr) == false, "bad input refused");
}
static void test_96k_rate_fix() {
    Rig r(96000); r.set("t3.decay", 1); r.run(0.01); std::vector<float> o; r.note(2); r.run(0.05, 128, &o);
    long same = 0; for (size_t i = 1; i < o.size(); ++i) if (o[i] == o[i - 1] && o[i] != 0.f) ++same;
    CHECK(same < 50, "96 kHz, Rate at top: no sample-and-hold (%ld repeats)", same);
}
static void test_realtime_safety_and_cpu() {
    Rig r(48000, 512);
    for (int t = 0; t < 9; ++t) for (int k = 0; k < 16; ++k) if ((k + t) % 2 == 0) r.stepOn(0, t, k, 0.8f, 1 + (k % 4 == 3), k % 3 ? 0 : 2.5f, k % 5 ? 1 : 0.5f);
    for (int t = 6; t <= 9; ++t) { char k[24]; std::snprintf(k, 24, "t%d.engine", t); r.set(k, 2); std::snprintf(k, 24, "t%d.fmfb", t); r.set(k, 0.7f); std::snprintf(k, 24, "t%d.sweep", t); r.set(k, 12); }
    r.set("t1.dly", 0.5f); r.set("t2.rev", 0.6f); r.set("gl.on", 1); r.set("gl.mode", 2); r.set("gl.mix", 0.6f);
    for (int i = 1; i <= 3; ++i) { char k[24]; std::snprintf(k, 24, "lfo%d.depth", i); r.set(k, 0.4f); std::snprintf(k, 24, "lfo%d.shape", i); r.set(k, float(i)); std::snprintf(k, 24, "lfo%d.dest", i); r.set(k, float(i - 1)); }
    std::vector<float> d(48000, 0.3f); const float *ch[1] = {d.data()}; vd_engine_set_sample(r.e, 0, vd_sample_create(ch, 1, 48000, 44100)); r.set("t1.engine", 1);
    // NEW: Slicer, ring steps, every source wired
    r.set("sl.on", 1); r.set("sl.density", 0.8f); r.set("sl.evolve", 0.4f); for (int i = 0; i < 32; ++i) r.slice(i, (i * 5) % 12, (i * 3) % 16);
    r.ringStep(0, 0, 2, VD_RING_OSCILLATOR, 0xFFE, 1, 900); r.ringStep(0, 1, 6, 2, 0x3, 0.7f, 220);
    static const char *dst[] = {"t1.tune", "t2.decay", "t9.fmindex", "dr.dlyfb", "sl.density", "gl.mix", "lfo1.rate", "t5.pan"};
    for (int w = 0; w < 32; ++w) r.wire(w, w % 5, dst[w % 8], (w % 2 ? 0.4f : -0.3f));
    for (int t = 1; t <= 9; ++t) { char k[24]; std::snprintf(k, 24, "t%d.eq2g", t); r.set(k, 6); std::snprintf(k, 24, "t%d.eq4g", t); r.set(k, -8); }
    r.set("tp.wow", .4f); r.set("tp.flutter", .4f); r.set("tp.dust", .5f);
    r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.5);
    watching = true; const long before = allocs.load();
    vd_midi_event ev{17, 0x99, 38, 99, 0}; r.ctx.midi = &ev; r.ctx.midi_count = 1;
    const auto t0 = std::chrono::steady_clock::now();
    std::vector<float> o; r.run(30.0, 256);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    vd_telemetry tl{}; vd_engine_read_telemetry(r.e, &tl); vd_recorded_hit h[4]; vd_engine_pop_recorded(r.e, h, 4);
    watching = false;
    CHECK(allocs.load() == before, "render, MIDI, telemetry and recording allocate nothing (%ld allocations)", allocs.load() - before);
    std::printf("      30 s, 9 tracks, FM feedback, sample, delay, reverb, metal-stretch glitch, Slicer, ring steps, 32 wires, EQ ×9, tape: %.0f ms → %.0f× real time (≈%.2f%% of one core)\n", ms, 30000.0 / ms, ms / 300.0);
    std::vector<float> chk; r.run(1.0, 256, &chk); CHECK(finite(chk) && peak(chk) <= 1.0f, "bounded, finite");
}
static void test_threads() {   // main thread edits while the audio thread renders (run under -fsanitize=thread)
    Rig r(48000, 256); r.cmd(VD_CMD_TRANSPORT, 1);
    std::atomic<bool> stop{false};
    std::thread audio([&] { while (!stop.load()) { vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 256); } });
    vd_telemetry t{}; vd_recorded_hit h[16]; uint32_t sent = 0;
    for (int i = 0; i < 20000; ++i) {
        r.set((i & 1) ? "t1.tune" : "gl.mix", float(i % 24) - 12.f);
        if (i % 5 == 0) r.stepOn(i % 8, i % 9, i % 16, 0.5f);
        if (i % 7 == 0) r.note(i % 9);
        if (i % 1000 == 0) { std::vector<float> d(2400, 0.1f); const float *ch[1] = {d.data()}; vd_engine_set_sample(r.e, uint32_t(i % 9), vd_sample_create(ch, 1, 2400, 48000)); }
        vd_engine_read_telemetry(r.e, &t); vd_engine_pop_recorded(r.e, h, 16); vd_engine_collect_garbage(r.e); ++sent;
    }
    stop = true; audio.join();
    CHECK(sent == 20000, "main thread ran");
}
// ---- whole-sequence load (state restore)
static vd_sequence *makeSeq(unsigned seed, int tracks = 9) {
    auto *s = new vd_sequence(); unsigned x = seed * 2654435761u + 1;
    auto rnd = [&] { x ^= x << 13; x ^= x >> 17; x ^= x << 5; return x; };
    for (int p = 0; p < VD_PATTERNS; ++p) { s->patterns[p].bars = uint8_t(1 << (rnd() % 3));
        for (int t = 0; t < VD_TRACK_CAPACITY; ++t) { vd_track_sequence &tr = s->patterns[p].tracks[t]; tr.length = uint8_t(1 + rnd() % 16); tr.division = uint8_t(rnd() % 10);
            for (int k = 0; k < VD_STEPS; ++k) { vd_step &st = tr.steps[k]; st.on = rnd() % 3 == 0; st.ratchet = uint8_t(1 + rnd() % 4); st.pitch = int8_t(int(rnd() % 25) - 12);
                st.velocity = float(rnd() % 100) / 100.f; st.pan = float(int(rnd() % 200) - 100) / 100.f; st.crush = rnd() % 4 ? 0.f : 0.5f; st.delay_send = float(rnd() % 3) / 3.f;
                st.reverb_send = float(rnd() % 4) / 4.f; st.chance = rnd() % 3 ? 1.f : 0.5f; st.fm_ratio = rnd() % 2 ? 0.f : 0.25f + float(rnd() % 60) / 4.f;
                st.ring_on = rnd() % 7 == 0; st.ring_master = uint8_t(rnd() % 10); st.ring_slaves = uint16_t(rnd() % 512); st.ring_amount = float(rnd() % 100) / 100.f; st.ring_hz = 20.f + float(rnd() % 2000); st.fold = rnd() % 5 == 0 ? float(rnd() % 100) / 100.f : 0.f; } } }
    for (int i = 0; i < VD_SLICER_SLOTS; ++i) s->slicer[i] = vd_slice{uint8_t(rnd() % 12), uint8_t(rnd() % 32)};
    static const char *dst[] = {"t1.tune", "t3.decay", "dr.dlyfb", "sl.density", "lfo2.rate", "t9.fmindex"};
    for (int w = 0; w < VD_MOD_WIRES; ++w) { s->wires[w].param = VD_PARAM_NONE; if (w < 6) { s->wires[w].source = uint8_t(rnd() % 5); s->wires[w].param = A(dst[w]); s->wires[w].amount = float(int(rnd() % 200) - 100) / 100.f; } }
    s->chain_length = 3; s->chain[0] = 0; s->chain[1] = 2; s->chain[2] = 1; s->chain_on = 1; s->selected_pattern = 0; s->track_count = uint8_t(tracks); s->stop_transport = 1;
    return s;
}
static void sendSeqAsCommands(Rig &r, const vd_sequence &s) {
    for (int i = 0; i < VD_SLICER_SLOTS; ++i) { vd_command x{}; x.type = VD_CMD_SET_SLICE; x.u.slice.slot = uint8_t(i); x.u.slice.s = s.slicer[i]; vd_engine_send(r.e, &x); }   // first, as a load applies them
    for (int w = 0; w < VD_MOD_WIRES; ++w) { vd_command x{}; x.type = VD_CMD_SET_WIRE; x.u.wire.slot = uint8_t(w); x.u.wire.w = s.wires[w]; vd_engine_send(r.e, &x); }
    for (int p = 0; p < VD_PATTERNS; ++p) { vd_command c{}; c.type = VD_CMD_SET_BARS; c.pattern = uint8_t(p); c.u.bars = s.patterns[p].bars; vd_engine_send(r.e, &c);
        for (int t = 0; t < VD_TRACKS_MAX; ++t) { const vd_track_sequence &tr = s.patterns[p].tracks[t];
            vd_command l{}; l.type = VD_CMD_SET_TRACK_LAYOUT; l.pattern = uint8_t(p); l.track = uint8_t(t); l.u.layout = {tr.length, tr.division}; vd_engine_send(r.e, &l);
            for (int k = 0; k < VD_STEPS; ++k) { vd_command st{}; st.type = VD_CMD_SET_STEP; st.pattern = uint8_t(p); st.track = uint8_t(t); st.step = uint8_t(k); st.u.step = tr.steps[k]; vd_engine_send(r.e, &st); } }
        r.run(0.001, 48); }   // let the audio thread drain the queue between patterns
    vd_command c{}; c.type = VD_CMD_SET_CHAIN; c.u.chain.chain_on = s.chain_on; c.u.chain.n = s.chain_length; std::memcpy(c.u.chain.pats, s.chain, sizeof s.chain); vd_engine_send(r.e, &c);
    r.cmd(VD_CMD_SET_TRACK_COUNT, float(s.track_count)); vd_command y{}; y.type = VD_CMD_SELECT_PATTERN; y.pattern = s.selected_pattern; vd_engine_send(r.e, &y);
}
static void test_state_load() {
    vd_sequence *s = makeSeq(7);
    Rig a, b;
    for (Rig *r : {&a, &b}) { r->set("t8.engine", 2); r->set("t9.engine", 2); r->set("dr.swing", 0.2f); r->set("sl.on", 1); r->set("sl.density", 0.7f); r->set("sl.evolve", 0.3f); r->set("lfo1.rate", 4); }
    vd_engine_load_sequence(a.e, s);
    for (int i = 0; i < 2 * VD_PATTERNS; ++i) a.run(0.001, 48);   // 16 render calls, as b below
    sendSeqAsCommands(b, *s); for (int i = 0; i < VD_PATTERNS; ++i) b.run(0.001, 48);
    a.cmd(VD_CMD_TRANSPORT, 1); b.cmd(VD_CMD_TRANSPORT, 1);
    std::vector<float> oa, ob; a.run(12.0, 128, &oa); b.run(12.0, 128, &ob);
    float d = 0; for (size_t i = 0; i < oa.size(); ++i) d = std::max(d, std::fabs(oa[i] - ob[i]));
    CHECK(d == 0.f && peak(oa) > 0.05f, "a whole-sequence load sounds exactly like the same song sent step by step (max diff %g)", d);
    // 1000 loads before the audio thread runs: latest wins, nothing piles up (ASan checks the frees)
    Rig c; for (unsigned i = 0; i < 1000; ++i) { vd_sequence *x = makeSeq(100 + i); vd_engine_load_sequence(c.e, x); delete x; }
    vd_engine_load_sequence(c.e, s); c.run(0.001, 48); c.cmd(VD_CMD_TRANSPORT, 1);
    std::vector<float> oc; c.run(2.0, 128, &oc);
    Rig e2; vd_engine_load_sequence(e2.e, s); e2.run(0.001, 48); e2.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> oe; e2.run(2.0, 128, &oe);
    bool same = oc.size() == oe.size(); for (size_t i = 0; same && i < oc.size(); ++i) same = oc[i] == oe[i];
    CHECK(same, "after 1000 queued loads, the last one is what plays");
    // restoring a song while playing stops the transport (stop_transport = 1); a kit change (0) keeps playing
    a.run(0.5); CHECK(a.tel().transport == 2, "playing before the restore");
    vd_engine_load_sequence(a.e, s); a.run(0.05); CHECK(a.tel().transport == 0, "song restore stops the transport");
    a.cmd(VD_CMD_TRANSPORT, 1); a.run(1.2); s->stop_transport = 0; vd_engine_load_sequence(a.e, s); a.run(0.05);
    CHECK(a.tel().transport == 2, "kit change keeps playing");
    CHECK(!vd_engine_load_sequence(a.e, nullptr) && !vd_engine_load_sequence(nullptr, s), "NULL refused");
    delete s;
}
static void test_state_load_threads() {   // the host restores state while audio runs (ThreadSanitizer)
    Rig r(48000, 256); r.cmd(VD_CMD_TRANSPORT, 1);
    std::atomic<bool> stop{false};
    std::thread audio([&] { while (!stop.load()) vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 256); });
    for (unsigned i = 0; i < 400; ++i) { vd_sequence *s = makeSeq(i, 6 + int(i % 4)); s->stop_transport = uint8_t(i % 2); vd_engine_load_sequence(r.e, s); delete s;
        r.set("t1.tune", float(i % 24) - 12.f); vd_engine_collect_garbage(r.e); }
    stop = true; audio.join(); r.run(0.01);
    CHECK(r.tel().track_count >= 6, "engine consistent after 400 restores during playback");
}
static void test_concurrent_handoffs() {   // samples decoded on several threads while the host restores state and audio runs
    Rig r(48000, 256); r.cmd(VD_CMD_TRANSPORT, 1); r.set("t1.engine", 1); r.set("t2.engine", 1);
    std::atomic<bool> stop{false};
    std::thread audio([&] { while (!stop.load()) vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 256); });
    std::vector<std::thread> workers;
    for (int w = 0; w < 4; ++w) workers.emplace_back([&, w] {
        for (int i = 0; i < 300; ++i) {
            if (w == 3) { vd_sequence *s = makeSeq(unsigned(i)); s->stop_transport = 0; vd_engine_load_sequence(r.e, s); delete s; }
            else { std::vector<float> d(1200, 0.2f * float(w + 1)); const float *ch[1] = {d.data()}; vd_engine_set_sample(r.e, uint32_t((i + w) % 9), vd_sample_create(ch, 1, 1200, 48000)); }
            if (i % 7 == 0) vd_engine_collect_garbage(r.e);
            vd_engine_set_param(r.e, A("t1.tune"), float(i % 24) - 12.f);
        } });
    for (auto &w : workers) w.join();
    stop = true; audio.join(); r.run(0.01);
    CHECK(true, "concurrent hand-offs (samples, sequences, garbage collection) from several threads");
}
static void test_slicer_ring_mod() {   // NEW
    auto groove = [](Rig &r) { for (int k = 0; k < 16; ++k) r.stepOn(0, k % 4 == 0 ? 0 : 2, k); r.stepOn(0, 1, 4); r.stepOn(0, 1, 12); r.cmd(VD_CMD_TRANSPORT, 1); };
    std::vector<float> a, b, c;
    { Rig r; groove(r); r.run(4.0, 128, &a); }
    { Rig r; groove(r); for (int i = 0; i < 32; ++i) r.slice(i, 2, i); r.run(4.0, 128, &b); }
    float d = 0; for (size_t i = 0; i < a.size(); ++i) d = std::max(d, std::fabs(a[i] - b[i]));
    CHECK(d == 0.f, "a slicer program with the Slicer off changes nothing (%g)", d);
    for (int act = 1; act < 12; ++act) {
        Rig r; groove(r); r.set("sl.on", 1); for (int i = 0; i < 32; ++i) r.slice(i, act, (i + 5) % 16); std::vector<float> o; r.run(4.5, 128, &o);
        float df = 0; for (size_t i = 96000; i < a.size(); ++i) df = std::max(df, std::fabs(a[i] - o[i]));
        CHECK(finite(o) && peak(o) <= 1.f && df > 1e-3f, "slicer action %d: finite, bounded, audible (%g)", act, df);
        const vd_telemetry t = r.tel(); CHECK(t.slicer_slice >= 0 && t.slicer_slice < 16, "telemetry: slice %d", t.slicer_slice);
    }
    { Rig r; groove(r); r.set("sl.on", 1); r.set("sl.hold", 5); r.run(3.0, 128, &c); CHECK(peak(c, 48000 * 2) < 0.05f, "hold GATE silences (%g)", peak(c, 48000 * 2)); }
    { Rig r; groove(r); r.wire(0, 0, "dr.level", 0); std::vector<float> o; r.run(4.0, 128, &o); float x = 0; for (size_t i = 0; i < a.size(); ++i) x = std::max(x, std::fabs(a[i] - o[i]));
      CHECK(x == 0.f, "a depth-0 wire changes nothing (%g)", x); }
    { Rig r; groove(r); r.set("lfo1.rate", 4); r.wire(0, 0, "dr.level", -1); std::vector<float> o; r.run(4.0, 128, &o); float x = 0; for (size_t i = 0; i < a.size(); ++i) x = std::max(x, std::fabs(a[i] - o[i]));
      CHECK(x > 1e-3f, "LFO 1 → level is audible (%g)", x);
      r.wire(0, 0, "dr.ch", 1); r.run(0.1); r.wire(1, 0, "gl.mode", 1);   // not dials: refused by the C API (no crash)
      const vd_telemetry t = r.tel(); bool rng = true; for (int s = 0; s < 5; ++s) rng = rng && t.mod_source[s] >= -1.f && t.mod_source[s] <= 1.f;
      CHECK(rng, "mod sources in telemetry, in range"); }
    { Rig r; for (int t = 1; t <= 9; ++t) { char k[24]; std::snprintf(k, 24, "t%d.level", t); r.set(k, t <= 2 ? 1.f : 0.f); }
      r.run(0.1); r.ringStep(0, 0, 0, VD_RING_OSCILLATOR, 0x2, 1, 1000); r.stepOn(0, 1, 0); r.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> o; r.run(1.2, 128, &o);
      Rig q; for (int t = 1; t <= 9; ++t) { char k[24]; std::snprintf(k, 24, "t%d.level", t); q.set(k, t <= 2 ? 1.f : 0.f); }
      q.run(0.1); q.stepOn(0, 0, 0); q.stepOn(0, 1, 0); q.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> z; q.run(1.2, 128, &z);
      float x = 0; for (size_t i = 0; i < o.size(); ++i) x = std::max(x, std::fabs(o[i] - z[i])); CHECK(finite(o) && x > 1e-3f, "a ring step changes its slave (%g)", x); }
}
static void test_fold_eq_tape() {   // NEW (0.7)
    std::vector<float> a, b;
    { Rig r; r.set("tp.dust", .8f); std::vector<float> s; r.run(1.0, 128, &s); float x = 0; for (float v : s) x = std::max(x, std::fabs(v)); CHECK(finite(s) && x > 1e-3f && x < .9f, "vinyl dust crackles in silence (peak %g)", x); }
    { Rig r; r.stepOn(0, 0, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.0, 128, &a); }
    { Rig r; r.set("t1.eq1f", 120); r.set("t1.eq3f", 3000); r.stepOn(0, 0, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.0, 128, &b); }
    float d = 0; for (size_t i = 0; i < a.size(); ++i) d = std::max(d, std::fabs(a[i] - b[i])); CHECK(d == 0.f, "EQ frequencies with 0 dB gains change nothing (%g)", d);
    { Rig r; r.set("t1.eq1g", 12); r.stepOn(0, 0, 0); r.cmd(VD_CMD_TRANSPORT, 1); b.clear(); r.run(1.0, 128, &b); float e = 0; for (size_t i = 0; i < a.size(); ++i) e = std::max(e, std::fabs(a[i] - b[i])); CHECK(finite(b) && e > 1e-2f, "a +12 dB low shelf changes the kick (%g)", e); }
    { Rig r; vd_command c{}; c.type = VD_CMD_SET_STEP; c.u.step = vd_step{1, 2, 0, 0, 0.9f, 0, 0, 0, 0, 1, 0, 0, VD_RING_OSCILLATOR, 0, 1, 220, 0.8f}; vd_engine_send(r.e, &c);
      r.cmd(VD_CMD_TRANSPORT, 1); b.clear(); r.run(1.0, 128, &b); float e = 0; for (size_t i = 0; i < a.size(); ++i) e = std::max(e, std::fabs(a[i] - b[i])); CHECK(finite(b) && e > 1e-2f, "a folded step sounds different (%g)", e); }
    { Rig r; r.set("lfo1.rate", 5); r.wire(0, 0, "t1.eq2f", 1); r.wire(1, 4, "tp.wow", .5); r.stepOn(0, 0, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.5);
      const vd_telemetry t = r.tel(); CHECK(t.mod_count == 2 && t.mod_param[0] == A("t1.eq2f") && t.mod_position[0] >= 0 && t.mod_position[0] <= 1, "telemetry: modulated dials and where they are (%d)", int(t.mod_count)); }
}
static void shiftStep(Rig &r, int p, int t, int s, float st, float mix, float spec, float col, float smix, int rat = 1) {
    vd_command c{}; c.type = VD_CMD_SET_STEP; c.pattern = uint8_t(p); c.track = uint8_t(t); c.step = uint8_t(s);
    c.u.step = vd_step{1, uint8_t(rat), 0, 0, 0.9f, 0, 0, 0, 0, 1, 0, 0, VD_RING_OSCILLATOR, 0, 1, 220, 0}; vd_engine_send(r.e, &c);
    c.type = VD_CMD_SET_STEP_FX; c.u.step_fx = vd_step_fx{st, mix, spec, col, smix, 0, 0, {0, 0}, 0, 0, 0}; vd_engine_send(r.e, &c); }
static void groove(Rig &r) { for (int k = 0; k < 16; k += 4) r.stepOn(0, 0, k); r.stepOn(0, 1, 4); r.stepOn(0, 1, 12); for (int k = 0; k < 16; k += 2) r.stepOn(0, 2, k, 0.6f, k == 14 ? 3 : 1); }
static float maxDiff(const std::vector<float> &a, const std::vector<float> &b) { float d = 0; for (size_t i = 0; i < std::min(a.size(), b.size()); ++i) d = std::max(d, std::fabs(a[i] - b[i])); return d; }
static void test_08_temper_humanise() {   // NEW (0.8)
    std::vector<float> a, b, c, w, k;
    { Rig r; groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(3.0, 128, &a); }
    { Rig r; r.set("dr.temper", 0); r.set("dr.human", 0); groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(3.0, 128, &b); }
    CHECK(maxDiff(a, b) == 0.f, "TEMPER 0 and HUMANISE 0: identical to never touching them (%g)", maxDiff(a, b));
    { Rig r; r.set("dr.temper", -1); groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(3.0, 128, &w); }
    { Rig r; r.set("dr.temper", 1); groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(3.0, 128, &k); }
    CHECK(finite(w) && finite(k) && peak(w) <= 1.f && peak(k) <= 1.f && maxDiff(a, w) > 1e-3f && maxDiff(a, k) > 1e-3f && maxDiff(w, k) > 1e-3f, "TEMPER warm / cold: finite, bounded, each its own sound");
    { Rig r; r.set("dr.temper", 1); groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.0); r.set("dr.temper", 0); r.run(1.0); c.clear(); r.run(1.0, 128, &c);
      Rig q; groove(q); q.cmd(VD_CMD_TRANSPORT, 1); q.run(2.0); std::vector<float> d; q.run(1.0, 128, &d);
      CHECK(maxDiff(c, d) < 1e-6f, "TEMPER back at 0: bypassed again (%g)", maxDiff(c, d)); }
    for (float h : {0.5f, 1.0f}) {
        Rig r; r.set("dr.human", h); groove(r); r.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> o; r.run(8.0, 128, &o);
        const vd_telemetry t = r.tel(); const uint32_t hits = t.hit_count[0] + t.hit_count[1] + t.hit_count[2];
        Rig q; groove(q); q.cmd(VD_CMD_TRANSPORT, 1); q.run(8.0); const vd_telemetry u = q.tel(); const uint32_t written = u.hit_count[0] + u.hit_count[1] + u.hit_count[2];
        CHECK(finite(o) && peak(o) <= 1.f && hits >= written && hits < written * 2.2, "HUMANISE %.0f %%: every written hit plays, ghosts bounded (%u vs %u written)", h * 100, hits, written);
        if (h > 0.9f) CHECK(hits > written, "HUMANISE 100 %%: ghost notes (%u extra)", hits - written);
        else CHECK(hits == written, "HUMANISE 50 %%: timing only, no ghosts (%u vs %u)", hits, written);
    }
}
static void test_08_shift_spectral_reverbs_input() {   // NEW (0.8)
    std::vector<float> a, b;
    { Rig r; r.stepOn(0, 0, 0); r.stepOn(0, 1, 8); r.cmd(VD_CMD_TRANSPORT, 1); r.run(2.0, 128, &a); }
    for (int z = 0; z < 6; ++z) { Rig r; shiftStep(r, 0, 0, 0, z % 2 ? 12.f : -7.f, 0.7f, 0.9f, (z + 0.5f) / 6.f, 1.f); shiftStep(r, 0, 1, 8, 5.f, 1.f, 0.6f, (z + 0.8f) / 6.f, 0.8f, 2);
        r.cmd(VD_CMD_TRANSPORT, 1); b.clear(); r.run(2.0, 128, &b);
        CHECK(finite(b) && peak(b) <= 1.f && maxDiff(a, b) > 1e-3f, "step shift + spectral colour zone %d: finite, bounded, changes the sound", z); }
    { Rig r; shiftStep(r, 0, 0, 0, 0.f, 1.f, 0.f, 0.f, 1.f); r.stepOn(0, 1, 8); r.cmd(VD_CMD_TRANSPORT, 1); b.clear(); r.run(2.0, 128, &b);
      CHECK(maxDiff(a, b) == 0.f, "shift 0 st, spectral 0: identical (%g)", maxDiff(a, b)); }
    std::vector<float> rv[4];
    for (int ty = 0; ty < 4; ++ty) { Rig r; r.set("t2.rev", 1); r.set("dr.revtype", float(ty)); r.set("dr.revsize", .6f); r.stepOn(0, 1, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.4, 128, &rv[ty]); r.cmd(VD_CMD_TRANSPORT, 0); r.run(2.0, 128, &rv[ty]);
        CHECK(finite(rv[ty]) && peak(rv[ty]) <= 1.f, "reverb type %d: finite, bounded", ty); }
    CHECK(maxDiff(rv[0], rv[1]) > 1e-4f && maxDiff(rv[0], rv[2]) > 1e-4f && maxDiff(rv[0], rv[3]) > 1e-4f, "Spring, Gate, Expanse: each its own sound");
    { Rig r; r.set("t2.rev", 1); r.set("dr.revtype", 3); r.set("dr.revsize", .93f); r.stepOn(0, 1, 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.6); r.cmd(VD_CMD_TRANSPORT, 0); r.set("dr.revsize", 1); r.run(1.0);
      std::vector<float> x; r.run(1.0, 128, &x); std::vector<float> y; r.run(4.0); r.run(1.0, 128, &y);
      double ex = 0, ey = 0; for (float v : x) ex += double(v) * v; for (float v : y) ey += double(v) * v;
      CHECK(ex > 1e-6 && ey > ex * 0.5 && finite(y) && peak(y) < 1.f, "Expanse 100 %%: freezes (energy %.2e → %.2e after 5 s)", ex, ey); }
    // insert input: the AUv3 effect path
    { Rig r; r.set("in.drums", 0); r.set("dr.level", 1); std::vector<float> in(48000); for (size_t i = 0; i < in.size(); ++i) in[i] = 0.3f * float(std::sin(2.0 * 3.141592653589793 * 220.0 * double(i) / 48000.0));
      std::vector<float> o; for (size_t i = 0; i < in.size(); i += 128) { r.ctx.input_left = in.data() + i; r.ctx.input_right = nullptr; vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 128); o.insert(o.end(), r.L.begin(), r.L.begin() + 128); }
      double e = 0; for (size_t i = 4800; i < o.size(); ++i) e += double(o[i]) * o[i]; e = std::sqrt(e / double(o.size() - 4800));
      CHECK(finite(o) && e > 0.15 && e < 0.3, "insert input passes through, drums off (rms %.3f)", e);
      r.set("sl.on", 1); r.set("dr.revtype", 1); r.set("in.rev", .6f); std::vector<float> o2; for (size_t i = 0; i < in.size(); i += 128) { r.ctx.input_left = in.data() + i; vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 128); o2.insert(o2.end(), r.L.begin(), r.L.begin() + 128); }
      CHECK(finite(o2) && peak(o2) <= 1.f, "insert input through Spring + Slicer: finite, bounded"); }
    { Rig r; groove(r); r.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> z(128, 0.f), o; for (int i = 0; i < 375; ++i) { r.ctx.input_left = z.data(); r.ctx.input_right = z.data(); vd_engine_render(r.e, &r.ctx, r.bl, r.br, 1, 128); o.insert(o.end(), r.L.begin(), r.L.begin() + 128); }
      Rig q; groove(q); q.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> p; q.run(1.0, 128, &p);
      CHECK(maxDiff(o, p) == 0.f, "a silent input changes nothing (%g)", maxDiff(o, p)); }
}
static void test_08_realtime() {   // NEW (0.8): everything new at once — no allocations, CPU
    Rig r(48000, 512);
    for (int t = 0; t < 9; ++t) for (int k = 0; k < 16; k += 2) shiftStep(r, 0, t, k, float((t % 3) * 5 - 5), 0.6f, 0.7f, float(t) / 9.f, 1.f, 1 + (k % 6 == 4));
    r.set("dr.temper", -0.6f); r.set("dr.human", 1); r.set("dr.revtype", 3); r.set("dr.revsize", .93f); r.set("sl.on", 1); r.set("tp.wow", .3f); r.set("gl.on", 1);
    for (int t = 1; t <= 9; ++t) { char k[24]; std::snprintf(k, 24, "t%d.rev", t); r.set(k, .5f); }
    std::vector<float> in(512); for (size_t i = 0; i < in.size(); ++i) in[i] = 0.2f * float(std::sin(double(i) * 0.05));
    r.ctx.input_left = in.data(); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.5, 256);
    std::vector<float> o; o.reserve(48000 * 21);
    watching = true; const long before = allocs.load();
    const auto t0 = std::chrono::steady_clock::now(); r.run(20.0, 256, &o);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    watching = false;
    CHECK(allocs.load() == before, "0.8 features allocate nothing while rendering (%ld allocations)", allocs.load() - before);
    CHECK(finite(o) && peak(o) <= 1.f, "finite, bounded");
    std::printf("      20 s, 9 tracks × (pitch shift + spectral) per step, Expanse wash, HUMANISE 100 %%, TEMPER, insert input, Slicer, glitch, tape: %.0f ms → ≈%.2f%% of one core\n", ms, ms / 200.0);
    Rig n(48000, 512); groove(n); n.cmd(VD_CMD_TRANSPORT, 1); n.run(0.5, 256);
    const auto t1 = std::chrono::steady_clock::now(); n.run(20.0, 256); const double m0 = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count();
    n.set("dr.temper", 0.5f); n.set("dr.human", .5f); n.run(0.2, 256);
    const auto t2 = std::chrono::steady_clock::now(); n.run(20.0, 256); const double m1 = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t2).count();
    std::printf("      TEMPER + HUMANISE cost on a groove: %.0f ms → %.0f ms per 20 s (+%.3f%% of one core)\n", m0, m1, (m1 - m0) / 200.0);
}
static void test_08_offline_export() {   // NEW (0.8): EXPORT — chain or pattern, ring out, stems
    auto song = [](Rig &r) { groove(r); vd_command c{}; c.type = VD_CMD_SET_BARS; c.pattern = 1; c.u.bars = 2; vd_engine_send(r.e, &c); r.stepOn(1, 0, 0); r.stepOn(1, 1, 8);
        r.set("t2.rev", .7f); r.set("dr.temper", 0); };
    auto chain = [](Rig &r, bool on) { vd_command c{}; c.type = VD_CMD_SET_CHAIN; c.u.chain.chain_on = on; c.u.chain.n = 3; c.u.chain.pats[0] = 0; c.u.chain.pats[1] = 1; c.u.chain.pats[2] = 0; vd_engine_send(r.e, &c); };
    { Rig r; song(r); chain(r, true); CHECK(vd_engine_offline_length(r.e, 120) == 8 * 48000, "CHAIN on: the whole chain (1+2+1 bars = 8 s at 120 BPM = %llu frames)", (unsigned long long)vd_engine_offline_length(r.e, 120)); }
    { Rig r; song(r); chain(r, false); CHECK(vd_engine_offline_length(r.e, 120) == 2 * 48000, "CHAIN off: the selected pattern (1 bar)"); }
    const uint64_t cap = 8 * 48000 + 30 * 48000; std::vector<float> mL(cap), mR(cap), sL(cap), sR(cap), sum(cap, 0.f);
    uint64_t nm = 0;
    { Rig r; song(r); chain(r, true); vd_offline_config c{120, -1, 1, {}, 30}; watching = true; const long before = allocs.load(); nm = vd_engine_render_offline(r.e, &c, mL.data(), mR.data(), cap); watching = false;
      CHECK(nm > 8 * 48000 && nm < 8 * 48000 + 30 * 48000, "RING OUT: the reverb rings on, then stops at silence (%.2f s of tail)", double(nm - 8 * 48000) / 48000);
      CHECK(allocs.load() == before, "offline render allocates nothing (%ld)", allocs.load() - before);
      std::vector<float> v(mL.begin(), mL.begin() + long(nm)); CHECK(finite(v) && peak(v) > 0.05f && peak(v) <= 1.f, "master: finite, bounded, audible"); }
    { Rig r; song(r); chain(r, true); vd_offline_config c{120, -1, 0, {}, 30}; const uint64_t k = vd_engine_render_offline(r.e, &c, sL.data(), sR.data(), cap);
      CHECK(k == 8 * 48000, "CUT: exactly the music (%llu)", (unsigned long long)k);
      float d = 0; for (uint64_t i = 0; i < k; ++i) d = std::max(d, std::fabs(sL[i] - mL[i])); CHECK(d == 0.f, "CUT and RING OUT are the same up to the end (%g)", d); }
    int stems = 0;
    for (int t = 0; t < 4; ++t) { Rig r; song(r); chain(r, true); vd_offline_config c{120, t, 1, {}, 30}; std::fill(sL.begin(), sL.end(), 0.f); const uint64_t k = vd_engine_render_offline(r.e, &c, sL.data(), sR.data(), cap);
        for (uint64_t i = 0; i < std::min(k, nm); ++i) { sum[i] += sL[i]; }
        ++stems; }
    double e = 0, s = 0;
    for (uint64_t i = 0; i < nm; ++i) { e += double(sum[i] - mL[i]) * (sum[i] - mL[i]); s += double(mL[i]) * mL[i]; }
    CHECK(10 * std::log10(s / std::max(e, 1e-30)) > 60, "%d stems add up to the master (%.1f dB below it)", stems, 10 * std::log10(s / std::max(e, 1e-30)));
}
static void stepX(Rig &r, int p, int t, int s, int slice, float metal, float rev, float stut) {   // NEW (0.9): a step with its slice, Metalise and chances
    r.stepOn(p, t, s); vd_command c{}; c.type = VD_CMD_SET_STEP_FX; c.pattern = uint8_t(p); c.track = uint8_t(t); c.step = uint8_t(s);
    c.u.step_fx = vd_step_fx{0, 1, 0, 0, 1, uint8_t(slice), uint8_t(metal >= 0 ? 1 : 0), {0, 0}, metal >= 0 ? metal : 0, rev, stut}; vd_engine_send(r.e, &c); }
static vd_sample *breakSample(int ns) {   // 2 s of decaying tones, cut into ns slices with their own settings
    const int n = 96000; std::vector<float> d(n); for (int i = 0; i < n; ++i) d[size_t(i)] = float(std::sin(i * 0.031 * (1 + (i % 12000) / 12000.0)) * std::exp(-(i % 12000) / 2400.0));
    const float *ch[1] = {d.data()}; vd_sample *s = vd_sample_create(ch, 1, n, 48000);
    std::vector<float> tb(size_t(ns) * VD_SLICE_FIELDS);
    for (int i = 0; i < ns; ++i) { float *q = &tb[size_t(i) * VD_SLICE_FIELDS]; q[0] = float(i * (n / ns)); q[1] = float(n / ns); q[2] = float(i % 3); q[3] = 1; q[4] = 0; q[5] = 0; q[6] = 1;
        q[7] = i == 2 ? 1.f : 0.f; q[8] = i == 3 ? 3.f : 0.f; q[9] = 0.01f; q[10] = i == 4 ? 0.8f : -1.f; }
    CHECK(vd_sample_set_slices(s, tb.data(), uint32_t(ns)), "slices accepted");
    CHECK(!vd_sample_set_slices(nullptr, tb.data(), 1) && !vd_sample_set_slices(s, nullptr, 2), "bad arguments refused");
    vd_sample_set_slices(s, tb.data(), uint32_t(ns));
    return s;
}
static void test_09_sampler() {   // NEW (0.9): 12 tracks, METALISE, RESAMPLE, slices, slice pads + REC, per-pattern Slicer
    CHECK(VD_TRACKS_MAX == 12 && VDG_TRACKS == 12 && VD_RING_OSCILLATOR == 12 && sizeof(vd_command) <= 64, "12 tracks, ring oscillator 12, commands ≤ 64 bytes (%zu)", sizeof(vd_command));
    std::vector<float> dry, m0, m1, r0, r1;
    { Rig r; groove(r); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.5, 128, &dry); }
    { Rig r; groove(r); r.set("t1.metal", 0); r.set("t1.rsmp", 0); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.5, 128, &m0); }
    CHECK(maxDiff(dry, m0) == 0.f, "METALISE 0 and RESAMPLE 0: the original signal path, sample for sample");
    double prev = 0; bool prog = true;
    for (float a : {.25f, .5f, .75f, 1.f}) { std::vector<float> o; Rig r; groove(r); r.set("t2.metal", a); r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.5, 128, &o);
        double e = 0, s2 = 0; for (size_t i = 0; i < o.size(); ++i) { e += double(o[i] - dry[i]) * (o[i] - dry[i]); s2 += double(dry[i]) * dry[i]; } const double rr = std::sqrt(e / s2);
        CHECK(finite(o) && peak(o) < 1.2f, "METALISE %.2f: finite, bounded", a); if (rr <= prev) prog = false; prev = rr; }
    CHECK(prog, "METALISE is progressive");
    for (int m = 0; m < VDG_SMODELS; ++m) for (int mode = 0; mode < 4; ++mode) { std::vector<float> o; Rig r; groove(r); r.set("t1.rsmp", .8f); r.set("t1.smodel", float(m)); r.set("t1.rsmode", float(mode)); r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.6, 128, &o);
        CHECK(finite(o) && peak(o) < 1.5f && maxDiff(o, dry) > 1e-3f, "RESAMPLE model %d, transient mode %d: finite, bounded, audible", m, mode); }
    // slices: a step plays its slice; reverse and stutter by chance; pads with REC record the slice
    { Rig r; r.set("t5.engine", 1); r.set("t5.decay", 3); vd_engine_set_sample(r.e, 4, breakSample(8));
      for (int k = 0; k < 16; ++k) stepX(r, 0, 4, k, k % 8 + 1, k == 5 ? .7f : -1.f, k % 3 == 0 ? .5f : 0.f, k % 4 == 1 ? .6f : 0.f);
      r.cmd(VD_CMD_TRANSPORT, 1); std::vector<float> o; r.run(3, 128, &o); CHECK(finite(o) && peak(o) > .01f && peak(o) <= 1.f, "a sliced lane with chances: finite, audible");
      vd_command c{}; c.type = VD_CMD_RECORD_ARM; c.u.value = 1; vd_engine_send(r.e, &c);
      c = vd_command{}; c.type = VD_CMD_NOTE_SLICE; c.track = 4; c.step = 6; c.u.value = .9f; vd_engine_send(r.e, &c); r.run(0.05);
      vd_recorded_hit h[8]; const uint32_t n = vd_engine_pop_recorded(r.e, h, 8); CHECK(n == 1 && h[0].track == 4 && h[0].slice == 6, "a slice pad with REC: recorded with its slice (%u, slice %d)", n, n ? int(h[0].slice) : -1); }
    { std::vector<float> a, b; for (int pass = 0; pass < 2; ++pass) { Rig r; groove(r); for (int i = 0; i < 32; ++i) r.slice(i, 8, i); r.set("sl.on", 1);
        if (pass) { vd_command c{}; c.type = VD_CMD_SET_PATTERN_SLICER; c.pattern = 0; c.u.value = 0; vd_engine_send(r.e, &c); }
        r.cmd(VD_CMD_TRANSPORT, 1); r.run(1.5, 128, pass ? &b : &a); }
      CHECK(maxDiff(b, dry) < 1e-6f && maxDiff(a, dry) > 1e-3f, "a pattern's Slicer OFF keeps it dry while SLICER is on"); }
    { Rig r; for (int t = 0; t < 12; ++t) { char k[16]; std::snprintf(k, 16, "t%d.metal", t + 1); r.set(k, .5f); std::snprintf(k, 16, "t%d.rsmp", t + 1); r.set(k, .5f); r.stepOn(0, t, t); }
      r.set("t5.engine", 1); vd_engine_set_sample(r.e, 4, breakSample(8)); stepX(r, 0, 4, 3, 2, .6f, .5f, .5f); r.set("gl.on", 1); r.set("gl.mode", 2); r.set("gl.metal", .7f);
      r.cmd(VD_CMD_TRANSPORT, 1); r.run(0.5);
      watching = true; const long before = allocs.load(); const auto t0 = std::chrono::steady_clock::now(); r.run(10); const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count(); watching = false;
      CHECK(allocs.load() == before, "12 tracks with METALISE + RESAMPLE, slices, the master character: no allocations (%ld)", allocs.load() - before);
      std::printf("      10 s, 12 tracks × (METALISE + RESAMPLE), sliced sample, metal stretch + character: %.0f ms → ≈%.2f%% of one core\n", ms, ms / 100.0); }
}
static void test_10_091() {   // NEW (0.9.1): LONG, drawn LFO shapes, the Metalise switch on an LFO, Metalise chance
    std::vector<float> a, b;
    for (int lng = 0; lng < 2; ++lng) { Rig r; r.set("t1.decay", 3); r.set("t1.long", float(lng)); r.run(0.05); vd_command c{}; c.type = VD_CMD_NOTE; c.track = 0; c.u.value = 1; vd_engine_send(r.e, &c); r.run(8, 128, lng ? &b : &a); }
    auto rmsAt = [](const std::vector<float> &x, double s0, double s1) { const double k = double(x.size()) / 8.0; double s = 0; size_t n = 0; for (size_t i = size_t(s0 * k); i < size_t(s1 * k) && i < x.size(); ++i, ++n) s += double(x[i]) * x[i]; return n ? std::sqrt(s / double(n)) : 0.0; };
    CHECK(rmsAt(a, 6, 8) < 1e-5 && rmsAt(b, 6, 8) > 1e-3, "LONG: a 3 s decay becomes 60 s (%.1e → %.1e at 6–8 s)", rmsAt(a, 6, 8), rmsAt(b, 6, 8));
    { Rig r; vd_command c{}; c.type = VD_CMD_SET_LFO_POINTS; c.u.lfo_points.lfo = 0; c.u.lfo_points.count = 8; for (int h = 0; h < 2; ++h) { c.u.lfo_points.start = uint8_t(h * 8); for (int j = 0; j < 8; ++j) c.u.lfo_points.points[j] = h ? -1.f : 1.f; vd_engine_send(r.e, &c); }
      r.set("lfo1.shape", 5); r.set("lfo1.rate", 2); r.set("lfo1.depth", 1); r.set("lfo1.dest", 0); r.set("gl.on", 1); r.set("gl.mode", 2); r.run(0.1);
      float lo = 1, hi = -1; for (int k = 0; k < 200; ++k) { r.run(0.005); vd_telemetry tm; vd_engine_read_telemetry(r.e, &tm); lo = std::min(lo, tm.lfo[0]); hi = std::max(hi, tm.lfo[0]); }
      CHECK(hi > 0.99f && lo < -0.99f, "LFO DRAW: a drawn square plays as drawn (%.2f … %.2f)", lo, hi); }
    { std::vector<float> off, on; for (int w = 0; w < 2; ++w) { Rig r; groove(r); r.set("gl.mode", 2); r.set("gl.mix", .8f); if (w) { vd_command c{}; c.type = VD_CMD_SET_WIRE; c.u.wire.slot = 0; c.u.wire.w.source = 1; c.u.wire.w.param = A("gl.on"); c.u.wire.w.amount = 1; vd_engine_send(r.e, &c); r.set("lfo2.rate", 2); }
        r.cmd(VD_CMD_TRANSPORT, 1); r.run(2, 128, w ? &on : &off); }
      CHECK(maxDiff(on, off) > 1e-3, "an LFO wired to the Metalise switch turns it on"); }
    { std::vector<float> x, y; for (int k = 0; k < 2; ++k) { Rig r; groove(r); r.set("gl.mode", 2); r.set("gl.on", 1); r.set("gl.mix", .8f); r.set("gl.chance", k ? .4f : 0.f); r.cmd(VD_CMD_TRANSPORT, 1); r.run(2, 128, k ? &y : &x); }
      CHECK(maxDiff(x, y) > 1e-3 && finite(y), "Metalise CHANCE gates it per division"); }
}
int main() {
    test_contract(); test_timing_and_drift(); test_midi_sample_accurate(); test_tracks_engines_choke(); test_record_and_telemetry();
    test_host_clock(); test_samples_handoff(); test_96k_rate_fix(); test_realtime_safety_and_cpu(); test_threads(); test_state_load(); test_state_load_threads(); test_concurrent_handoffs(); test_slicer_ring_mod(); test_fold_eq_tape();
    test_08_temper_humanise(); test_08_shift_spectral_reverbs_input(); test_08_realtime(); test_08_offline_export(); test_09_sampler(); test_10_091();
    std::printf("%d checks, %d failed\n", checks, fails);
    return fails ? 1 : 0;
}
