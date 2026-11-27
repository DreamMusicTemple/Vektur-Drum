// Vektur Drum — the C API (vd_engine.h) around the C++ engine (DrumEngine.hpp).
// Threads: parameters are atomics (any thread); structural edits go through a wait-free command ring, applied by
// the audio thread at the start of each render call; samples change hands by pointer exchange (as Vektur Pulse's
// Drums.h does), and replaced ones are freed only by vd_engine_collect_garbage() on the main thread. Telemetry is
// published once per render through a sequence lock; recorded hits come back through a ring. The render path does
// not allocate, lock, log or block (tests/dsp/test_engine.cpp checks allocations).
#include "vd_engine.h"
#include "DrumEngine.hpp"
#include "realtime.hpp"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstring>
#include <new>

namespace {
constexpr int kAddrEnd = VD_PARAM_ID_END;
static_assert(vd::kT <= VD_TRACK_CAPACITY, "engine tracks fit the API capacity");
static_assert(vd::kT == VD_TRACKS_MAX, "the generated table has VD_TRACKS_MAX tracks");
static_assert(vd::kP == VD_PATTERNS && vd::kS == VD_STEPS && vd::kC == VD_CHAIN_MAX, "sequence sizes match the header");
static_assert(sizeof(vd_command) <= 64, "a command stays one cache line");
static_assert(vd::kSLF == VD_SLICE_FIELDS, "slice records match the header");
static_assert(vd::kNSlot == VD_SLICER_SLOTS && vd::kNWire == VD_MOD_WIRES && vd::kNSrc == VD_MOD_SOURCE_COUNT && vd::kRingOsc == VD_RING_OSCILLATOR, "slicer / mod sizes match the header");
}

struct vd_engine final : vd::RecordSink {
    vd::Engine eng;
    std::atomic<float> target[VDG_PARAM_COUNT];
    int16_t index[kAddrEnd];                                   // stable address → dense index (−1 = none)
    vd::SpscRing<vd_command, 2048> cmds;                       // main → audio
    vd::SpscRing<vd_recorded_hit, 64> recs;                    // audio → main
    vd::SeqlockSnapshot<vd_telemetry> telemetry;
    std::atomic<vd_sample *> smpIn[vd::kT], smpOld[vd::kT];
    vd_sample *smpCur[vd::kT] = {};
    vd_sample clearMark;                                       // sent through smpIn to remove a track's sample
    std::atomic<vd_sequence *> seqIn{nullptr}, seqOld{nullptr};   // whole-sequence loads (same hand-off as samples)
    uint32_t maxFrames = 0;
    bool syncing = false, hostPlaying = false, hostPlayingKnown = false;

    vd_engine() {
        std::fill(index, index + kAddrEnd, int16_t(-1));
        for (int i = 0; i < VDG_PARAM_COUNT; ++i) { target[i].store(kVDGParams[i].def, std::memory_order_relaxed); index[kVDGParams[i].address] = int16_t(i); }
        for (int t = 0; t < vd::kT; ++t) { smpIn[t].store(nullptr, std::memory_order_relaxed); smpOld[t].store(nullptr, std::memory_order_relaxed); }
        eng.recSink = this;
    }
    ~vd_engine() override {
        for (int t = 0; t < vd::kT; ++t) {
            vd_sample *a = smpIn[t].exchange(nullptr); if (a && a != &clearMark) vd_sample_release(a);
            vd_sample *b = smpOld[t].exchange(nullptr); if (b && b != &clearMark) vd_sample_release(b);
            if (smpCur[t]) vd_sample_release(smpCur[t]);
        }
        delete seqIn.exchange(nullptr); delete seqOld.exchange(nullptr);
    }
    void push(int pat, int trk, int stp, float vel, int slice) override {   // audio thread (REC)
        vd_recorded_hit h{uint8_t(pat), uint8_t(trk), uint8_t(stp), uint8_t(slice), vel};
        recs.push(h);                                             // full (64 unread): dropped, as in Vektur Pulse
    }
    void collect() {
        delete seqOld.exchange(nullptr, std::memory_order_acq_rel);
        for (int t = 0; t < vd::kT; ++t) { vd_sample *o = smpOld[t].exchange(nullptr, std::memory_order_acq_rel); if (o && o != &clearMark) vd_sample_release(o); }
    }
    void takeSamples() {   // [audio] only once the previous replaced sample has been collected
        for (int t = 0; t < vd::kT; ++t) {
            if (smpOld[t].load(std::memory_order_acquire) != nullptr) continue;
            vd_sample *n = smpIn[t].exchange(nullptr, std::memory_order_acq_rel);
            if (!n) continue;
            vd_sample *old = smpCur[t];
            smpCur[t] = n == &clearMark ? nullptr : n;
            eng.setSample(t, smpCur[t]);
            if (old) smpOld[t].store(old, std::memory_order_release);
        }
    }
    void takeSequence() {   // [audio] apply a whole sequence at this block boundary
        if (seqOld.load(std::memory_order_acquire) != nullptr) return;   // the previous one is not collected yet: next block
        vd_sequence *s = seqIn.exchange(nullptr, std::memory_order_acq_rel);
        if (!s) return;
        for (int p = 0; p < vd::kP; ++p) {
            const vd_pattern &pt = s->patterns[p];
            eng.setBars(p, pt.bars); eng.setPatternSlicer(p, pt.slicer == 1 ? 1 : pt.slicer == 2 ? 0 : -1);
            for (int t = 0; t < vd::kT; ++t) {
                const vd_track_sequence &tr = pt.tracks[t];
                eng.setTrack(p, t, tr.length, tr.division);
                for (int k = 0; k < vd::kS; ++k) {
                    const vd_step &st = tr.steps[k];
                    eng.setStep(p, t, k, st.on, st.velocity, st.pan, st.pitch, st.ratchet);
                    eng.setStepFx(p, t, k, st.crush, st.delay_send, st.reverb_send, st.chance);
                    eng.setStepFm(p, t, k, st.fm_ratio);
                    eng.setStepRing(p, t, k, st.ring_on, st.ring_master, st.ring_slaves, st.ring_amount, st.ring_hz);
                    eng.setStepFold(p, t, k, st.fold);
                    const vd_step_fx &x = tr.steps_fx[k];
                    eng.setStepShift(p, t, k, x.shift_semitones, x.shift_mix, x.spectral, x.spectral_colour, x.spectral_mix);
                    eng.setStepMetal(p, t, k, x.metal_set ? double(x.metal) : -1.0, x.slice, x.reverse_chance, x.stutter_chance);
                }
            }
        }
        for (int i = 0; i < vd::kNSlot; ++i) eng.setSlice(i, s->slicer[i].action, s->slicer[i].source);
        for (int w = 0; w < vd::kNWire; ++w) eng.setWire(w, s->wires[w].source, dense(s->wires[w].param), s->wires[w].amount);
        eng.setChain(s->chain, s->chain_length, s->chain_on);
        eng.setTracks(s->track_count ? s->track_count : vd::kT);
        if (s->stop_transport) { eng.play(false); for (auto &w : eng.v) w.active = false; }
        eng.select(s->selected_pattern);
        if (s->stop_transport) eng.jumpReq = 0;               // stopped: the selection simply applies
        seqOld.store(s, std::memory_order_release);           // freed by the main thread (vd_engine_collect_garbage)
    }
    /** A wire's destination: the dense index of a modulatable parameter, or −1 (empty, unknown or not a dial). */
    int dense(vd_param_id a) const { if (a >= vd_param_id(kAddrEnd)) return -1; const int i = index[a]; return i >= 0 && kVDGParams[i].modulatable ? i : -1; }
    void pullParams() { for (int i = 0; i < VDG_PARAM_COUNT; ++i) eng.target[i] = target[i].load(std::memory_order_relaxed); }
    void apply(const vd_command &c) {
        switch (c.type) {
            case VD_CMD_SET_STEP: {
                const vd_step &s = c.u.step;
                eng.setStep(c.pattern, c.track, c.step, s.on, s.velocity, s.pan, s.pitch, s.ratchet);
                eng.setStepFx(c.pattern, c.track, c.step, s.crush, s.delay_send, s.reverb_send, s.chance);
                eng.setStepFm(c.pattern, c.track, c.step, s.fm_ratio);
                eng.setStepRing(c.pattern, c.track, c.step, s.ring_on, s.ring_master, s.ring_slaves, s.ring_amount, s.ring_hz);
                eng.setStepFold(c.pattern, c.track, c.step, s.fold);
                break; }
            case VD_CMD_SET_STEP_FX: { const vd_step_fx &x = c.u.step_fx;
                eng.setStepShift(c.pattern, c.track, c.step, x.shift_semitones, x.shift_mix, x.spectral, x.spectral_colour, x.spectral_mix);
                eng.setStepMetal(c.pattern, c.track, c.step, x.metal_set ? double(x.metal) : -1.0, x.slice, x.reverse_chance, x.stutter_chance); break; }
            case VD_CMD_SET_PATTERN_SLICER: eng.setPatternSlicer(c.pattern, int(std::lround(c.u.value))); break;
            case VD_CMD_SET_LFO_POINTS: eng.setLfoPoints(c.u.lfo_points.lfo, c.u.lfo_points.start, c.u.lfo_points.points, std::min<int>(c.u.lfo_points.count, 8)); break;
            case VD_CMD_NOTE_SLICE: if (eng.enabledFlag && c.track < vd::kT) eng.hitSlice(c.track, c.step, double(c.u.value)); break;
            case VD_CMD_SET_WIRE: eng.setWire(c.u.wire.slot, c.u.wire.w.source, dense(c.u.wire.w.param), c.u.wire.w.amount); break;
            case VD_CMD_SET_SLICE: eng.setSlice(c.u.slice.slot, c.u.slice.s.action, c.u.slice.s.source); break;
            case VD_CMD_SET_TRACK_LAYOUT: eng.setTrack(c.pattern, c.track, c.u.layout.length, c.u.layout.division); break;
            case VD_CMD_SET_BARS: eng.setBars(c.pattern, c.u.bars); break;
            case VD_CMD_SET_CHAIN: eng.setChain(c.u.chain.pats, c.u.chain.n, c.u.chain.chain_on); break;
            case VD_CMD_SELECT_PATTERN: eng.select(c.pattern); break;
            case VD_CMD_TRANSPORT: eng.play(c.u.value > 0.5f); break;
            case VD_CMD_RECORD_ARM: eng.recOn = c.u.value > 0.5f ? 1 : 0; break;
            case VD_CMD_SET_TRACK_COUNT: eng.setTracks(int(std::lround(c.u.value))); break;
            case VD_CMD_NOTE: if (eng.enabledFlag && c.track < vd::kT) {   // a pad: same path as a MIDI note (records while REC is lit)
                const int vel = std::min(127, std::max(1, int(std::lround(c.u.value * 127.0f))));
                eng.midi(0x90, uint8_t(kVDGNotes[c.track]), uint8_t(vel)); }
                break;
            case VD_CMD_PANIC: for (auto &w : eng.v) w.active = false; eng.clearFx(); break;
            case VD_CMD_ENABLE: eng.enabledFlag = c.u.value > 0.5f ? 1 : 0; break;
            case VD_CMD_SYNC_BEGIN: syncing = true; break;
            case VD_CMD_SYNC_END: syncing = false; break;
            default: break;
        }
    }
    void publishTelemetry() {
        const float *tl = eng.tel; vd_telemetry t{};
        t.transport = tl[0] >= 1.f ? 2 : (tl[0] > 0.f ? 1 : 0);
        t.current_pattern = uint8_t(tl[1]); t.chain_position = uint8_t(tl[2]); t.track_count = uint8_t(eng.nTr);
        t.output_level = tl[3]; t.beat = eng.beat;
        for (int i = 0; i < VD_TRACK_CAPACITY; ++i) t.current_step[i] = -1;
        for (int k = 0; k < vd::kT; ++k) { t.current_step[k] = int8_t(tl[4 + k]); t.hit_count[k] = uint32_t(tl[4 + vd::kT + k]); t.envelope[k] = tl[4 + 2 * vd::kT + k]; }
        for (int i = 0; i < 3; ++i) t.lfo[i] = tl[4 + 3 * vd::kT + i];
        for (int i = 0; i < vd::kNSrc; ++i) t.mod_source[i] = tl[4 + 3 * vd::kT + 3 + i];
        t.slicer_slice = int8_t(tl[4 + 3 * vd::kT + 3 + vd::kNSrc]); t.slicer_action = uint8_t(tl[4 + 3 * vd::kT + 4 + vd::kNSrc]);
        const int mb = 4 + 3 * vd::kT + 5 + vd::kNSrc; t.mod_count = 0;
        for (int n = 0; n < vd::kNWire; ++n) { const int d = int(tl[mb + 2 * n]); if (d < 0) break; t.mod_param[n] = kVDGParams[d].address; t.mod_position[n] = tl[mb + 2 * n + 1]; ++t.mod_count; }
        telemetry.publish(t);
    }
};

extern "C" {

vd_engine *vd_engine_create(double sample_rate, uint32_t max_frames) {
    auto *e = new (std::nothrow) vd_engine;
    if (!e) return nullptr;
    if (!vd_engine_prepare(e, sample_rate, max_frames)) { delete e; return nullptr; }
    return e;
}
void vd_engine_destroy(vd_engine *e) { delete e; }

bool vd_engine_prepare(vd_engine *e, double sample_rate, uint32_t max_frames) {
    if (!e || sample_rate < 8000.0 || sample_rate > 384000.0 || max_frames == 0) return false;
    e->pullParams();
    e->eng.prepare(sample_rate);
    e->maxFrames = max_frames;
    return true;
}

void vd_engine_render(vd_engine *e, const vd_render_context *ctx, float *const *bus_left, float *const *bus_right, uint32_t bus_count, uint32_t frames) {
    if (!e || !bus_left || !bus_right || bus_count == 0) return;
    for (uint32_t b = 0; b < bus_count; ++b) { if (bus_left[b]) std::memset(bus_left[b], 0, sizeof(float) * frames); if (bus_right[b] && bus_right[b] != bus_left[b]) std::memset(bus_right[b], 0, sizeof(float) * frames); }
    if (frames > e->maxFrames || !bus_left[0] || !bus_right[0]) return;
    vd::Engine &g = e->eng;
    e->pullParams();
    e->takeSequence();                                         // a whole song first, then edits made after it
    { vd_command c; while (e->cmds.pop(c)) e->apply(c); }
    e->takeSamples();
    if (ctx) {
        if (ctx->tempo > 0.0) g.tempo = float(std::min(std::max(ctx->tempo, 20.0), 400.0));
        if (ctx->host_beat_valid) { g.hostBeat = ctx->host_beat; ++g.beatSerial; }
        if (ctx->host_playing_valid && (!e->hostPlayingKnown || ctx->host_playing != e->hostPlaying)) { e->hostPlaying = ctx->host_playing; e->hostPlayingKnown = true; g.play(ctx->host_playing); }
    }
    if (e->syncing) return;                                   // a full resync is in flight: stay silent until it ends
    float *L = bus_left[0], *R = bus_right[0];
    const float *iL = ctx ? ctx->input_left : nullptr, *iR = ctx && ctx->input_left ? ctx->input_right : nullptr;
    auto run = [&](uint32_t at, uint32_t n) { g.render(L + at, R + at, n, iL ? iL + at : nullptr, iR ? iR + at : nullptr); };
    uint32_t pos = 0;
    if (ctx && ctx->midi) {
        for (uint32_t i = 0; i < ctx->midi_count; ++i) {
            const vd_midi_event &m = ctx->midi[i];
            const uint32_t at = std::min(m.sample_offset, frames);
            if (at > pos) { run(pos, at - pos); pos = at; }
            if (g.takes(m.status)) g.midi(m.status, m.data1, m.data2);
        }
    }
    if (frames > pos) run(pos, frames - pos);
    e->publishTelemetry();
}

// ---------------------------------------------------------------- offline export (= web/src/export.js exportRender)
static void offlineDrain(vd_engine *e) {
    e->pullParams(); e->takeSequence();
    { vd_command c; while (e->cmds.pop(c)) e->apply(c); }
    for (int k = 0; k < 4; ++k) { e->collect(); e->takeSamples(); }
    e->syncing = false;
}
uint64_t vd_engine_offline_length(vd_engine *e, double tempo) {
    if (!e || !(tempo > 0)) return 0;
    offlineDrain(e);
    const vd::Engine &g = e->eng; double beats = 0;
    if (g.chainOn && g.chainN > 0) { for (int i = 0; i < g.chainN; ++i) beats += 4.0 * g.patBars[std::min(std::max(g.chain[i], 0), vd::kP - 1)]; }
    else beats = 4.0 * g.patBars[std::min(std::max(g.want, 0), vd::kP - 1)];
    return uint64_t(std::floor(beats * 60.0 / tempo * g.sr + 0.5));
}
uint64_t vd_engine_render_offline(vd_engine *e, const vd_offline_config *cfg, float *left, float *right, uint64_t capacity) {
    if (!e || !cfg || !left || !right || !(cfg->tempo > 0)) return 0;
    const uint64_t body = vd_engine_offline_length(e, cfg->tempo);   // drains too
    vd::Engine &g = e->eng; const double sr = g.sr;
    if (cfg->solo_track >= 0 && cfg->solo_track < vd::kT)
        for (int t = 0; t < vd::kT; ++t) { g.target[vd::Engine::tp(t, 12)] = t == cfg->solo_track ? 0.f : 1.f; g.target[vd::Engine::tp(t, 13)] = 0.f; }
    g.prepare(sr);                                             // every dial starts where it is (no glide from the defaults)
    g.enabledFlag = 1; g.tempo = float(std::min(std::max(cfg->tempo, 20.0), 400.0)); g.play(true);
    const uint64_t maxTail = cfg->ring_out ? uint64_t(double(std::max(0.f, cfg->tail_max_seconds)) * sr) : 0, cap = std::min(capacity, body + maxTail);
    std::memset(left, 0, sizeof(float) * cap); std::memset(right, 0, sizeof(float) * cap);
    uint64_t n = 0, quiet = 0; bool stopped = false; const uint64_t BLK = 1024;
    while (n < cap) {
        if (!stopped && n >= body) { g.play(false); stopped = true; if (!maxTail) break; }
        const uint64_t f = std::min<uint64_t>(BLK, (stopped ? cap : std::min(body, cap)) - n);
        if (f == 0) break;
        g.render(left + n, right + n, uint32_t(f));
        if (stopped) { float pk = 0; for (uint64_t i = n; i < n + f; ++i) { pk = std::max(pk, std::max(std::fabs(left[i]), std::fabs(right[i]))); } quiet = pk < 1e-4f ? quiet + f : 0; }
        n += f;
        if (stopped && double(quiet) >= sr * 0.5) { n -= quiet - uint64_t(std::floor(sr * 0.05 + 0.5)); break; }
    }
    g.play(false);
    return n;
}

void vd_engine_set_param(vd_engine *e, vd_param_id id, float value) {
    if (!e || id >= vd_param_id(kAddrEnd)) return;
    const int i = e->index[id]; if (i < 0 || !std::isfinite(value)) return;
    e->target[i].store(std::min(std::max(value, kVDGParams[i].min), kVDGParams[i].max), std::memory_order_relaxed);
}
float vd_engine_get_param(const vd_engine *e, vd_param_id id) {
    if (!e || id >= vd_param_id(kAddrEnd)) return 0.f;
    const int i = e->index[id]; return i < 0 ? 0.f : e->target[i].load(std::memory_order_relaxed);
}
bool vd_engine_send(vd_engine *e, const vd_command *c) { return e && c && e->cmds.push(*c); }
bool vd_engine_set_sample(vd_engine *e, uint32_t track, vd_sample *s) {
    if (!e || track >= uint32_t(vd::kT)) { if (s) vd_sample_release(s); return false; }
    e->collect();
    vd_sample *prev = e->smpIn[track].exchange(s ? s : &e->clearMark, std::memory_order_acq_rel);
    if (prev && prev != &e->clearMark) vd_sample_release(prev);   // never reached the audio thread
    return true;
}
void vd_engine_collect_garbage(vd_engine *e) { if (e) e->collect(); }
bool vd_engine_load_sequence(vd_engine *e, const vd_sequence *s) {
    if (!e || !s) return false;
    auto *copy = new (std::nothrow) vd_sequence(*s);
    if (!copy) return false;
    e->collect();
    delete e->seqIn.exchange(copy, std::memory_order_acq_rel);   // a load the audio thread never took: replaced
    return true;
}
bool vd_engine_read_telemetry(const vd_engine *e, vd_telemetry *out) { return e && out && e->telemetry.read(*out); }
uint32_t vd_engine_pop_recorded(vd_engine *e, vd_recorded_hit *out, uint32_t max) {
    if (!e || !out) return 0;
    uint32_t n = 0;
    while (n < max && e->recs.pop(out[n])) ++n;
    return n;
}

}  // extern "C"
