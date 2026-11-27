// Renders events.txt through the C++ engine, only through the public C API (vd_engine.h) → out_cpp.f32.
#include "vd_engine.h"
#include "vd_params.generated.h"
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
static vd_param_id addr(const char *key) { for (int i = 0; i < VDG_PARAM_COUNT; ++i) if (!std::strcmp(kVDGParams[i].key, key)) return kVDGParams[i].address; std::fprintf(stderr, "unknown %s\n", key); return 0xFFFFFFFF; }
int main(int argc, char **argv) {
    FILE *f = std::fopen(argc > 1 ? argv[1] : "events.txt", "r"); if (!f) return 1;
    const char *outName = argc > 2 ? argv[2] : "out_cpp.f32";
    vd_engine *e = vd_engine_create(48000, 4096);
    std::vector<float> out, L(4096), R(4096), IL(4096), IR(4096); long pos = 0; char op[8]; long fr; bool inOn = false;
    auto inSig = [](long n, int c) { return float(0.3 * std::sin(2.0 * 3.141592653589793 * (c ? 330.0 : 220.0) * double(n) / 48000.0) + 0.1 * std::sin(2.0 * 3.141592653589793 * 3110.0 * double(n) / 48000.0) * double((n >> 11) & 1)); };
    vd_render_context ctx{}; ctx.tempo = 120; std::vector<vd_midi_event> midi;
    float *bl[1] = {L.data()}, *br[1] = {R.data()};
    auto renderTo = [&](long target) { while (pos < target) { const int n = int(std::min<long>(128 - pos % 128, target - pos));
        ctx.midi = midi.data(); ctx.midi_count = uint32_t(midi.size());
        if (inOn) { for (int i = 0; i < n; ++i) { IL[size_t(i)] = inSig(pos + i, 0); IR[size_t(i)] = inSig(pos + i, 1); } ctx.input_left = IL.data(); ctx.input_right = IR.data(); } else ctx.input_left = ctx.input_right = nullptr;
        vd_engine_render(e, &ctx, bl, br, 1, uint32_t(n)); midi.clear(); ctx.host_beat_valid = false;
        vd_engine_collect_garbage(e);
        for (int i = 0; i < n; ++i) { out.push_back(L[i]); out.push_back(R[i]); } pos += n; } };
    auto cmd = [&](vd_command c) { if (!vd_engine_send(e, &c)) std::fprintf(stderr, "queue full\n"); };
    char line[4096];
    while (std::fgets(line, sizeof line, f)) {
        if (!std::strncmp(line, "END", 3)) { renderTo(std::atol(line + 4)); break; }
        char key[64]; int off = 0; if (std::sscanf(line, "%ld %7s%n", &fr, op, &off) < 2) continue; const char *a = line + off;
        renderTo(fr);
        vd_command c{}; std::string o = op;
        if (o == "P") { double v; std::sscanf(a, "%63s %lf", key, &v); vd_engine_set_param(e, addr(key), float(v)); }
        else if (o == "S") { int p, t, s, on, rat, ron = 0, rm = 0, rk = 0, sli = 0; double vel, pan, pitch, cr, dl, rv, pr, fm, ra = 0, rh = 220, fo = 0, sh = 0, shm = 1, sp = 0, co = 0, spm = 1, mtl = -1, rvc = 0, stc = 0;
            std::sscanf(a, "%d %d %d %d %lf %lf %lf %d %lf %lf %lf %lf %lf %d %d %d %lf %lf %lf %lf %lf %lf %lf %lf %lf %d %lf %lf", &p, &t, &s, &on, &vel, &pan, &pitch, &rat, &cr, &dl, &rv, &pr, &fm, &ron, &rm, &rk, &ra, &rh, &fo, &sh, &shm, &sp, &co, &spm, &mtl, &sli, &rvc, &stc);
            c.type = VD_CMD_SET_STEP; c.pattern = uint8_t(p); c.track = uint8_t(t); c.step = uint8_t(s);
            c.u.step = vd_step{uint8_t(on), uint8_t(rat), int8_t(pitch), 0, float(vel), float(pan), float(cr), float(dl), float(rv), float(pr), float(fm),
                               uint8_t(ron), uint8_t(rm), uint16_t(rk), float(ra), float(rh), float(fo)}; cmd(c);
            c.type = VD_CMD_SET_STEP_FX; c.u.step_fx = vd_step_fx{float(sh), float(shm), float(sp), float(co), float(spm), uint8_t(sli), uint8_t(mtl >= 0 ? 1 : 0), {0, 0}, float(mtl >= 0 ? mtl : 0), float(rvc), float(stc)}; cmd(c); }
        else if (o == "D") { int l; float v[16] = {}; std::sscanf(a, "%d %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f", &l, &v[0], &v[1], &v[2], &v[3], &v[4], &v[5], &v[6], &v[7], &v[8], &v[9], &v[10], &v[11], &v[12], &v[13], &v[14], &v[15]);
            for (int h = 0; h < 2; ++h) { c.type = VD_CMD_SET_LFO_POINTS; c.u.lfo_points.lfo = uint8_t(l); c.u.lfo_points.start = uint8_t(h * 8); c.u.lfo_points.count = 8; for (int j = 0; j < 8; ++j) c.u.lfo_points.points[j] = v[h * 8 + j]; cmd(c); } }
        else if (o == "G") { int p, v; std::sscanf(a, "%d %d", &p, &v); c.type = VD_CMD_SET_PATTERN_SLICER; c.pattern = uint8_t(p); c.u.value = float(v); cmd(c); }
        else if (o == "Q") { int t, sl; double vel; std::sscanf(a, "%d %d %lf", &t, &sl, &vel); c.type = VD_CMD_NOTE_SLICE; c.track = uint8_t(t); c.step = uint8_t(sl); c.u.value = float(vel); cmd(c); }
        else if (o == "V") { int t, n, ns; double hz, dec, rate; std::sscanf(a, "%d %d %lf %lf %lf %d", &t, &n, &hz, &dec, &rate, &ns);
            vd_sample *smp = nullptr;
            if (n > 0) { std::vector<float> d(static_cast<size_t>(n)); for (int i = 0; i < n; ++i) d[size_t(i)] = float(std::sin(2.0 * 3.141592653589793 * hz * i / rate * (1 + double(i % 9000) / 9000)) * std::exp(-double(i % 7500) / (dec * rate)) * (1.0 - double(i) / n));
                const float *ch[1] = {d.data()}; smp = vd_sample_create(ch, 1, uint32_t(n), rate);
                std::vector<float> tb(size_t(ns) * 11); const int L = n / ns;
                for (int i = 0; i < ns; ++i) { float *q = &tb[size_t(i) * 11]; q[0] = float(i * L); q[1] = float(L); q[2] = float((i % 5) - 2); q[3] = float(0.6 + 0.1 * (i % 4)); q[4] = float(((i % 3) - 1) * 0.3);
                    q[5] = float((i % 2) * 0.002); q[6] = float(1 - 0.15 * (i % 4)); q[7] = i % 3 == 1 ? 1.f : 0.f; q[8] = i % 4 == 2 ? 2.f : 0.f; q[9] = 0.01f; q[10] = i % 5 == 3 ? 0.6f : -1.f; }
                vd_sample_set_slices(smp, tb.data(), uint32_t(ns)); }
            vd_engine_set_sample(e, uint32_t(t), smp); }
        else if (o == "I") { int on; std::sscanf(a, "%d", &on); inOn = on != 0; }
        else if (o == "X") { int slot, src; double amt; std::sscanf(a, "%d %d %63s %lf", &slot, &src, key, &amt);
            c.type = VD_CMD_SET_WIRE; c.u.wire.slot = uint8_t(slot); c.u.wire.w.source = uint8_t(src); c.u.wire.w.param = key[0] == '-' ? VD_PARAM_NONE : addr(key); c.u.wire.w.amount = float(amt); cmd(c); }
        else if (o == "L") { int slot, ac, src; std::sscanf(a, "%d %d %d", &slot, &ac, &src); c.type = VD_CMD_SET_SLICE; c.u.slice.slot = uint8_t(slot); c.u.slice.s = vd_slice{uint8_t(ac), uint8_t(src)}; cmd(c); }
        else if (o == "K") { int p, t, l, d; std::sscanf(a, "%d %d %d %d", &p, &t, &l, &d); c.type = VD_CMD_SET_TRACK_LAYOUT; c.pattern = uint8_t(p); c.track = uint8_t(t); c.u.layout = {uint8_t(l), uint8_t(d)}; cmd(c); }
        else if (o == "B") { int p, b; std::sscanf(a, "%d %d", &p, &b); c.type = VD_CMD_SET_BARS; c.pattern = uint8_t(p); c.u.bars = uint8_t(b); cmd(c); }
        else if (o == "C") { int on, n, k = 0; std::sscanf(a, "%d %d%n", &on, &n, &k); a += k; c.type = VD_CMD_SET_CHAIN; c.u.chain.chain_on = uint8_t(on); c.u.chain.n = uint8_t(n);
            for (int i = 0; i < n; ++i) { int x; std::sscanf(a, "%d%n", &x, &k); a += k; c.u.chain.pats[i] = uint8_t(x); } cmd(c); }
        else if (o == "Y") { int p; std::sscanf(a, "%d", &p); c.type = VD_CMD_SELECT_PATTERN; c.pattern = uint8_t(p); cmd(c); }
        else if (o == "Z" || o == "R" || o == "N" || o == "E") { double v; std::sscanf(a, "%lf", &v);
            c.type = o == "Z" ? VD_CMD_TRANSPORT : o == "R" ? VD_CMD_RECORD_ARM : o == "N" ? VD_CMD_SET_TRACK_COUNT : VD_CMD_ENABLE; c.u.value = float(v); cmd(c); }
        else if (o == "T") { double b; std::sscanf(a, "%lf", &b); ctx.tempo = double(float(b)); }
        else if (o == "H") { double b; std::sscanf(a, "%lf", &b); ctx.host_beat = b; ctx.host_beat_valid = true; }
        else if (o == "M") { int s1, d1, d2; std::sscanf(a, "%d %d %d", &s1, &d1, &d2); midi.push_back(vd_midi_event{0, uint8_t(s1), uint8_t(d1), uint8_t(d2), 0}); }
        else if (o == "W") { int t, n; double hz, dec, rate; std::sscanf(a, "%d %d %lf %lf %lf", &t, &n, &hz, &dec, &rate);
            vd_sample *s = nullptr;
            if (n > 0) { std::vector<float> d(static_cast<size_t>(n)); for (int i = 0; i < n; ++i) d[size_t(i)] = float(std::sin(2.0 * 3.141592653589793 * hz * i / rate) * std::exp(-i / (dec * rate)) * (1.0 - double(i) / n));
                const float *ch[1] = {d.data()}; s = vd_sample_create(ch, 1, uint32_t(n), rate); }
            vd_engine_set_sample(e, uint32_t(t), s); }
    }
    vd_engine_destroy(e);
    FILE *o = std::fopen(outName, "wb"); std::fwrite(out.data(), 4, out.size(), o); std::fclose(o);
    std::printf("C++: %zu frames → %s\n", out.size() / 2, outName);
}
