// Vektur Drum 0.9 — the sample editor's analysis and preparation (vd_slice.h). Line for line with web/src/slices.js
// (sxFFT, sxOnsetCurve, sxDetect, sxClassify, sxBpm, sxStretch, sxPrepare): JavaScript Number arithmetic is IEEE
// double, Float32Array stores round to float — both kept here, so tests/native_slice can compare the results exactly.
#include "vd_slice.h"
#include "vd_sample_impl.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

namespace {
constexpr double kPi = 3.141592653589793;   // Math.PI
inline double jsRound(double x) { return std::floor(x + 0.5); }

void fft(std::vector<double> &re, std::vector<double> &im) {   // = sxFFT
    const int n = int(re.size());
    for (int i = 1, j = 0; i < n; ++i) { int b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { std::swap(re[size_t(i)], re[size_t(j)]); std::swap(im[size_t(i)], im[size_t(j)]); } }
    for (int len = 2; len <= n; len <<= 1) {
        const double a = -2 * kPi / len, wr = std::cos(a), wi = std::sin(a);
        for (int i = 0; i < n; i += len) {
            double cr = 1, ci = 0;
            for (int k = 0; k < len / 2; ++k) {
                const size_t p = size_t(i + k), q = p + size_t(len / 2);
                const double xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
                re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
                const double t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
            }
        }
    }
}
constexpr int kN = 1024, kH = 256;
std::vector<double> onsetCurve(const float *d, uint32_t len) {   // = sxOnsetCurve
    const long nf = std::max(1L, long(std::floor(double(long(len) - kN) / kH)) + 1);
    const size_t nfz = static_cast<size_t>(nf);
    std::vector<double> win(kN), re(kN), im(kN), prev(kN / 2, 0.0), cur(kN / 2), flux(nfz), en(nfz);
    for (int i = 0; i < kN; ++i) win[size_t(i)] = 0.5 - 0.5 * std::cos(2 * kPi * i / kN);
    double pe = 0;
    for (long f = 0; f < nf; ++f) {
        const long o = f * kH; double e = 0;
        for (int i = 0; i < kN; ++i) { const double x = o + i < long(len) ? double(d[o + i]) : 0.0; re[size_t(i)] = x * win[size_t(i)]; im[size_t(i)] = 0; e += x * x; }
        fft(re, im);
        double fl = 0; std::fill(cur.begin(), cur.end(), 0.0);
        for (int k = 1; k < kN / 2; ++k) { const double m = std::log(1 + 100 * std::sqrt(re[size_t(k)] * re[size_t(k)] + im[size_t(k)] * im[size_t(k)])); cur[size_t(k)] = m; const double df = m - prev[size_t(k)]; if (df > 0) fl += df * (k < 12 ? 1.5 : 1); }
        prev.swap(cur); flux[size_t(f)] = fl; const double le = std::log(1e-9 + e / kN); en[size_t(f)] = std::max(0.0, le - pe); pe = le;
    }
    auto nz = [](std::vector<double> &a) { double m = 0; for (double v : a) m = std::max(m, v); if (m > 0) for (double &v : a) v = v / m; };
    nz(flux); nz(en);
    std::vector<double> c(nfz); for (long f = 0; f < nf; ++f) c[size_t(f)] = 0.7 * flux[size_t(f)] + 0.3 * en[size_t(f)];
    return c;
}
double acfAt(const std::vector<double> &c, double fr, double bpm) {
    const long n = long(c.size()); const double lag = fr * 60 / bpm; const long L = long(std::floor(lag)); const double fl = lag - double(L);
    if (L + 1 >= n) return -1;   // (a "continue" in the scan)
    double s = 0; for (long i = 0; i + L + 1 < n; ++i) s += c[size_t(i)] * (c[size_t(i + L)] * (1 - fl) + c[size_t(i + L + 1)] * fl);
    return s / double(n - L);
}
}   // namespace

extern "C" uint32_t vd_slice_detect(const float *d, uint32_t len, double rate, double sens, double gapMs, uint32_t *out, uint32_t max) {   // = sxDetect
    if (!d || !out || !max) return 0;
    if (len < 2048) { if (len) { out[0] = 0; return 1; } return 0; }
    const std::vector<double> c = onsetCurve(d, len); const long nf = long(c.size());
    const long gap = std::max(1L, long(jsRound((gapMs / 1000) * rate / kH)));
    const double delta = 0.02 + 0.2 * (1 - sens) * (1 - sens), mult = 1 + (1 - sens);
    std::vector<long> peaks; long last = -1000000000L; double lastV = 0; std::vector<double> w;
    for (long f = 1; f < nf - 1; ++f) {
        const long lo = std::max(0L, f - 8), hi = std::min(nf, f + 9);
        w.assign(c.begin() + lo, c.begin() + hi); std::sort(w.begin(), w.end()); const double med = w[w.size() >> 1];
        const double cf = c[size_t(f)];
        if (!(cf > med * mult + delta && cf >= c[size_t(f - 1)] && cf >= c[size_t(f + 1)])) continue;
        const long p = f * kH + kN - kN / 4;
        if (f - last >= gap) { peaks.push_back(p); last = f; lastV = cf; }
        else if (cf > lastV) { peaks.back() = p; last = f; lastV = cf; }   // closer than the spacing: the stronger one wins
    }
    std::vector<float> env(len); { double a = 0; for (uint32_t i = 0; i < len; ++i) { a += std::fabs(double(d[i])) - (i >= 32 ? std::fabs(double(d[i - 32])) : 0.0); env[i] = float(a / 32); } }
    const long pre = long(jsRound(0.002 * rate)); std::vector<long> res;
    for (long p0 : peaks) {
        const long a = std::max(1L, p0 - kN / 2 - kH), b = std::min(long(len) - 1, p0 + kN / 2); long best = a; double bv = -1;
        for (long i = a; i < b; i += 4) { const double v = double(env[size_t(i)]) - double(env[size_t(std::max(0L, i - 64))]); if (v > bv) { bv = v; best = i; } }
        const long p = std::max(0L, best - 32 - pre);
        if (res.empty() || double(p - res.back()) >= double(gap * kH) * 0.5) res.push_back(p);
    }
    double pk = 0; for (uint32_t i = 0; i < len; ++i) pk = std::max(pk, std::fabs(double(d[i])));
    double s0 = 0; for (long i = 0; i < std::min(long(len), long(jsRound(0.01 * rate))); ++i) s0 = std::max(s0, std::fabs(double(d[i])));
    if (s0 > 0.1 * pk && (res.empty() || double(res.front()) > 0.02 * rate)) res.insert(res.begin(), 0);
    const uint32_t n = uint32_t(std::min<size_t>(res.size(), max));
    for (uint32_t i = 0; i < n; ++i) out[i] = uint32_t(res[i]);
    return n;
}

extern "C" int vd_slice_classify(const float *d, uint32_t len, double rate, uint32_t p, double loud) {   // = sxClassify
    if (!d || p >= len) return VD_HIT_OTHER;
    const long n = std::min(long(len) - long(p), long(jsRound(0.06 * rate))); if (n < 16) return VD_HIT_OTHER;
    const double al = 1 - std::exp(-2 * kPi * 150 / rate), ah = 1 - std::exp(-2 * kPi * 5000 / rate);
    double l = 0, h = 0, el = 0, eh = 0, e = 0, pk = 0;
    for (long i = 0; i < n; ++i) { const double x = double(d[p + size_t(i)]); l += (x - l) * al; h += (x - h) * ah; const double hp = x - h; el += l * l; eh += hp * hp; e += x * x; pk = std::max(pk, std::fabs(x)); }
    if (e <= 1e-12) return VD_HIT_OTHER;
    const double lowR = el / e, highR = eh / e;
    if (loud > 0 && pk < 0.3 * loud) return VD_HIT_GHOST;
    if (lowR > 0.45) return VD_HIT_KICK;
    if (highR > 0.3 && lowR < 0.1) return VD_HIT_HAT;
    return VD_HIT_SNARE;
}

namespace {
struct Feat { double lowR, highR, pk, e; };
Feat features(const float *d, uint32_t len, double rate, uint32_t p, double end) {   // = sxFeatures
    const long n = std::max(0L, std::min(std::min(long(len) - long(p), long(jsRound(0.05 * rate))), long(end) - long(p) - long(jsRound(0.001 * rate))));
    if (n < 16) return Feat{0, 0, 0, 0};
    const double al = 1 - std::exp(-2 * kPi * 150 / rate), ah = 1 - std::exp(-2 * kPi * 6000 / rate);
    double l1 = 0, l2 = 0, h1 = 0, h2 = 0, el = 0, eh = 0, e = 0, pk = 0;
    for (long i = 0; i < n; ++i) { const double x = double(d[p + size_t(i)]); l1 += (x - l1) * al; l2 += (l1 - l2) * al; h1 += (x - h1) * ah; const double y = x - h1; h2 += (y - h2) * ah; const double hp = y - h2;
        el += l2 * l2; eh += hp * hp; e += x * x; pk = std::max(pk, std::fabs(x)); }
    return e > 1e-12 ? Feat{el / e, eh / e, pk, e} : Feat{0, 0, pk, 0};
}
}   // namespace

extern "C" void vd_slice_classify_all(const float *d, uint32_t len, double rate, const uint32_t *ps, uint32_t n, int *out) {   // = sxClassifyAll
    if (!d || !ps || !out || !n) return;
    std::vector<Feat> f(n); double loud = 0;
    for (uint32_t i = 0; i < n; ++i) { f[i] = features(d, len, rate, ps[i], i + 1 < n ? double(ps[i + 1]) : double(len)); loud = std::max(loud, f[i].pk); }
    std::vector<int> idx; for (uint32_t i = 0; i < n; ++i) { out[i] = VD_HIT_OTHER; if (f[i].e > 0) idx.push_back(int(i)); }
    std::vector<double> b; for (int i : idx) b.push_back(std::log((f[size_t(i)].highR + 1e-3) / (f[size_t(i)].lowR + 1e-3)));
    std::vector<int> ord(idx.size()); for (size_t k = 0; k < ord.size(); ++k) ord[k] = int(k);
    std::sort(ord.begin(), ord.end(), [&](int x, int y) { return b[size_t(x)] != b[size_t(y)] ? b[size_t(x)] < b[size_t(y)] : x < y; });
    const int m = int(ord.size());
    std::vector<std::pair<int, int>> groups;
    std::vector<double> pre(size_t(m) + 1, 0.0); for (int k = 0; k < m; ++k) pre[size_t(k) + 1] = pre[size_t(k)] + b[size_t(ord[size_t(k)])];
    auto mean = [&](int a, int c) { return (pre[size_t(c)] - pre[size_t(a)]) / double(c - a); };
    if (m >= 3) {
        const double tot = pre[size_t(m)] / m; double best = -1; int bi = 1, bj = 2;
        for (int i = 1; i < m - 1; ++i) for (int j = i + 1; j < m; ++j) { const double a0 = mean(0, i) - tot, a1 = mean(i, j) - tot, a2 = mean(j, m) - tot, sc = i * a0 * a0 + (j - i) * a1 * a1 + (m - j) * a2 * a2; if (sc > best) { best = sc; bi = i; bj = j; } }
        groups = {{0, bi}, {bi, bj}, {bj, m}};
        for (int g = int(groups.size()) - 1; g > 0; --g) if (mean(groups[size_t(g)].first, groups[size_t(g)].second) - mean(groups[size_t(g - 1)].first, groups[size_t(g - 1)].second) < std::log(2.5)) { groups[size_t(g - 1)].second = groups[size_t(g)].second; groups.erase(groups.begin() + g); }
    }
    if (groups.size() < 2) { for (int i : idx) out[i] = vd_slice_classify(d, len, rate, ps[i], loud); return; }
    auto avg = [&](const std::pair<int, int> &g, bool low) { double s = 0; for (int k = g.first; k < g.second; ++k) { const Feat &q = f[size_t(idx[size_t(ord[size_t(k)])])]; s += low ? q.lowR : q.highR; } return s / double(g.second - g.first); };
    const int G = int(groups.size()), kickG = avg(groups[0], true) >= 0.15 ? 0 : -1, hatG = avg(groups[size_t(G - 1)], false) >= 0.05 ? G - 1 : -1;
    for (int gi = 0; gi < G; ++gi) for (int k = groups[size_t(gi)].first; k < groups[size_t(gi)].second; ++k) { const int i = idx[size_t(ord[size_t(k)])];
        out[i] = gi == kickG ? VD_HIT_KICK : gi == hatG ? VD_HIT_HAT : (loud > 0 && f[size_t(i)].pk < 0.3 * loud ? VD_HIT_GHOST : VD_HIT_SNARE); }
}

extern "C" double vd_slice_peak(const float *d, uint32_t len, uint32_t p, uint32_t n) {   // = sxPeak
    double m = 0; if (!d) return 0;
    for (uint64_t i = p; i < std::min<uint64_t>(len, uint64_t(p) + n); ++i) m = std::max(m, std::fabs(double(d[i])));
    return m;
}

extern "C" double vd_slice_bpm(const float *d, uint32_t len, double rate, double hint) {   // = sxBpm
    if (!d || double(len) < rate) return 0;
    const std::vector<double> c = onsetCurve(d, len); const double fr = rate / kH;
    double best = 0, bv = 0;
    for (double bpm = 70; bpm <= 190; bpm += 0.5) { const double s = acfAt(c, fr, bpm); if (s < 0 && s == -1) continue; if (s > bv) { bv = s; best = bpm; } }
    if (best == 0) return 0;
    while (best < 80) best *= 2;
    while (best > 180) best /= 2;
    struct Cand { double v, d; } cand[3]; int nc = 0;
    for (double k : {0.5, 1.0, 2.0}) { const double v = best * k; if (v >= 70 && v <= 190) cand[nc++] = Cand{v, hint > 0 ? std::fabs(std::log2(v / hint)) : 9}; }
    std::stable_sort(cand, cand + nc, [](const Cand &a, const Cand &b) { return a.d < b.d; });
    auto acf = [&](double b) { const double s = acfAt(c, fr, b); return s == -1 ? 0.0 : s; };
    if (hint > 0 && nc > 1 && cand[1].d - cand[0].d > 0.25) best = cand[0].v;
    else if (best * 2 <= 180 && acf(best * 2) >= 0.35 * acf(best)) best *= 2;
    const double sec = double(len) / rate;
    for (int bars : {1, 2, 4, 8, 16}) { const double b = bars * 4 * 60 / sec; if (std::fabs(b - best) / best < 0.04) return jsRound(b * 100) / 100; }
    double bb = 0, bv2 = 0;   // not near one: a loop is usually whole bars — the bar tempo with the strongest pulse, if it holds up
    for (int bars : {1, 2, 4, 8, 16}) { const double b = bars * 4 * 60 / sec; if (b < 70 || b > 190) continue; const double v = acf(b); if (v > bv2) { bv2 = v; bb = b; } }
    if (bb != 0 && bv2 >= 0.5 * acf(best)) return jsRound(bb * 100) / 100;
    return jsRound(best * 100) / 100;
}

extern "C" uint32_t vd_slice_stretch(const float *x, uint32_t n, double f, double rate, float *res, uint32_t capacity) {   // = sxStretch
    if (!x || !res) return 0;
    if (n < 8 || std::fabs(f - 1) < 1e-3) { const uint32_t k = std::min(n, capacity); std::memcpy(res, x, sizeof(float) * k); return k; }
    const long W = std::max(64L, long(jsRound(0.025 * rate)) & ~1L), H = W >> 1, S = long(jsRound(0.004 * rate)), outN = std::max(8L, long(jsRound(double(n) * f)));
    const size_t outZ = static_cast<size_t>(outN + W), wZ = static_cast<size_t>(W);
    std::vector<float> out(outZ, 0.f), wsum(outZ, 0.f), win(wZ);
    for (long i = 0; i < W; ++i) win[size_t(i)] = float(0.5 - 0.5 * std::cos(2 * kPi * double(i) / double(W)));
    auto at = [&](long i) { return i >= 0 && i < long(n) ? double(x[i]) : 0.0; };
    long prevIn = 0;
    for (long k = 0; k * H < outN; ++k) {
        const long op = k * H, nom = long(jsRound(double(op) / f));
        long pos = nom;
        if (k > 0) {
            const long tpl = prevIn + H; double best = -HUGE_VAL;
            for (long dlt = -S; dlt <= S; dlt += 2) { const long c0 = nom + dlt; if (c0 < 0) continue; double s = 0; for (long i = 0; i < W; i += 4) s += at(c0 + i) * at(tpl + i); if (s > best) { best = s; pos = c0; } }
        }
        for (long i = 0; i < W; ++i) { out[size_t(op + i)] = float(double(out[size_t(op + i)]) + at(pos + i) * double(win[size_t(i)])); wsum[size_t(op + i)] = float(double(wsum[size_t(op + i)]) + double(win[size_t(i)])); }
        prevIn = pos;
    }
    for (long i = 0; i < outN; ++i) if (double(wsum[size_t(i)]) > 1e-3) out[size_t(i)] = float(double(out[size_t(i)]) / double(wsum[size_t(i)]));
    const long A = std::min(std::min(long(n), outN), long(jsRound(0.012 * rate))), R = long(jsRound(0.003 * rate));
    for (long i = 0; i < std::min(outN, A + R); ++i) { const double g = i < A ? 0 : double(i - A) / double(R); out[size_t(i)] = float(double(x[std::min(i, long(n) - 1)]) * (1 - g) + double(out[size_t(i)]) * g); }
    const long T = std::min(outN, long(jsRound(0.003 * rate)));
    for (long i = 0; i < T; ++i) out[size_t(outN - 1 - i)] = float(double(out[size_t(outN - 1 - i)]) * (double(i) / double(T)));
    const uint32_t k = uint32_t(std::min<long>(outN, long(capacity)));
    std::memcpy(res, out.data(), sizeof(float) * k);
    return k;
}

extern "C" vd_sample *vd_slice_prepare(const float *d, uint32_t len, double rate, const vd_slice_def *slices, uint32_t count, const vd_prepare_opts *o) {   // = sxPrepare
    if (!d || len < 2 || !o || (count && !slices)) return nullptr;
    const int mode = o->tune_mode;
    const double lock = mode == 2 && o->sample_bpm > 0 ? o->sample_bpm / o->bpm : 1;
    vd_slice_def whole{0, len, 0, 1, 0, 0, 1, 0, 0, {0, 0}, 1, 0.125, -1};
    const vd_slice_def *sl = count ? slices : (mode ? &whole : nullptr); const uint32_t ns = count ? std::min<uint32_t>(count, VD_SLICES_MAX) : (mode ? 1 : 0);
    if (!sl) return nullptr;
    std::vector<float> buf, tab(size_t(ns) * VD_SLICE_FIELDS), tmp;
    for (uint32_t i = 0; i < ns; ++i) {
        const vd_slice_def &v = sl[i];
        const uint32_t s = std::min(v.start, len - 2), e = std::min(std::max(v.end, s + 2), len), segN = e - s;
        const double pc = mode ? std::pow(2.0, (o->tune + v.pitch) / 12) : 1, f = v.stretch * (mode ? o->stretch * lock * pc : 1);
        const size_t at = buf.size();
        if (std::fabs(f - 1) < 1e-3) buf.insert(buf.end(), d + s, d + e);
        else { tmp.resize(size_t(std::max(8.0, jsRound(double(segN) * f)))); const uint32_t k = vd_slice_stretch(d + s, segN, f, rate, tmp.data(), uint32_t(tmp.size())); buf.insert(buf.end(), tmp.begin(), tmp.begin() + k); }
        float *t = &tab[size_t(i) * VD_SLICE_FIELDS];
        t[0] = float(at); t[1] = float(buf.size() - at); t[2] = float(v.pitch); t[3] = float(v.gain); t[4] = float(v.pan); t[5] = float(v.attack_ms / 1000); t[6] = float(v.gate);
        t[7] = float(v.reverse); t[8] = float(v.stutter); t[9] = float(v.stutter_beats * 60 / std::max(o->bpm, 20.0)); t[10] = float(v.metalise);
    }
    if (buf.size() < 2) return nullptr;
    const float *ch[1] = {buf.data()};
    vd_sample *smp = vd_sample_create(ch, 1, uint32_t(buf.size()), rate);
    if (!smp) return nullptr;
    vd_sample_set_slices(smp, tab.data(), ns);
    return smp;
}
