// Vektur Drum 0.9 — runs vd_slice.h over the signals run.js wrote (in.f32 + cases.txt) → out.txt / out.f32.
#include "vd_slice.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
int main() {
    FILE *f = std::fopen("in.f32", "rb"); if (!f) return 1;
    std::fseek(f, 0, SEEK_END); const long bytes = std::ftell(f); std::fseek(f, 0, SEEK_SET);
    std::vector<float> all(size_t(bytes / 4)); if (std::fread(all.data(), 4, all.size(), f) != all.size()) return 1; std::fclose(f);
    FILE *c = std::fopen("cases.txt", "r"), *o = std::fopen("out.txt", "w"), *ob = std::fopen("out.f32", "wb");
    long off, n; double rate, sens, gap, hint, fct;
    while (std::fscanf(c, "%ld %ld %lf %lf %lf %lf %lf", &off, &n, &rate, &sens, &gap, &hint, &fct) == 7) {
        const float *d = all.data() + off;
        std::vector<uint32_t> m(256); const uint32_t k = vd_slice_detect(d, uint32_t(n), rate, sens, gap, m.data(), 256);
        double loud = 0; for (uint32_t i = 0; i < k; ++i) loud = std::max(loud, vd_slice_peak(d, uint32_t(n), m[i], uint32_t(0.06 * rate + 0.5)));
        std::fprintf(o, "D"); for (uint32_t i = 0; i < k; ++i) std::fprintf(o, " %u", m[i]); std::fprintf(o, "\nC");
        { std::vector<int> cl(k ? k : 1); vd_slice_classify_all(d, uint32_t(n), rate, m.data(), k, cl.data()); for (uint32_t i = 0; i < k; ++i) std::fprintf(o, " %d", cl[i]); (void)loud; }
        std::fprintf(o, "\nB %.2f\n", vd_slice_bpm(d, uint32_t(n), rate, hint));
        const uint32_t sn = std::min<uint32_t>(uint32_t(n), uint32_t(rate * 0.4));
        std::vector<float> st(size_t(sn * fct + 16)); const uint32_t sk = vd_slice_stretch(d, sn, fct, rate, st.data(), uint32_t(st.size()));
        std::fprintf(o, "S %u\n", sk); std::fwrite(st.data(), 4, sk, ob);
        // prepare: slices at the detected marks, varied settings; tempo lock at 0.8 × the detected tempo
        std::vector<vd_slice_def> sl; for (uint32_t i = 0; i < k && i < 32; ++i) { vd_slice_def v{}; v.start = m[i]; v.end = i + 1 < k ? m[i + 1] : uint32_t(n); v.pitch = double(int(i % 5) - 2); v.gain = 1; v.gate = 1; v.stretch = i % 3 == 1 ? 1.37 : 1; v.stutter_beats = 0.125; v.metalise = -1; v.reverse = i % 4 == 3; sl.push_back(v); }
        const double bpm = vd_slice_bpm(d, uint32_t(n), rate, hint); vd_prepare_opts po{int32_t(fct > 1 ? 2 : 1), 1.1, 3, bpm > 0 ? bpm * 0.8 : 120, bpm};
        vd_sample *s = vd_slice_prepare(d, uint32_t(n), rate, sl.data(), uint32_t(sl.size()), &po);
        extern const float *vdt_data(const vd_sample *); extern uint32_t vdt_frames(const vd_sample *); extern const double *vdt_slices(const vd_sample *);
        std::fprintf(o, "P %u", s ? vdt_frames(s) : 0); if (s) for (size_t i = 0; i < sl.size() * VD_SLICE_FIELDS; ++i) std::fprintf(o, " %.9g", vdt_slices(s)[i]); std::fprintf(o, "\n");
        if (s) { std::fwrite(vdt_data(s), 4, vdt_frames(s), ob); vd_sample_release(s); }
    }
    std::fclose(o); std::fclose(ob); std::fclose(c); return 0;
}
#include "vd_sample_impl.hpp"
const float *vdt_data(const vd_sample *s) { return s->data; }
uint32_t vdt_frames(const vd_sample *s) { return s->frames; }
const double *vdt_slices(const vd_sample *s) { return s->slices; }
