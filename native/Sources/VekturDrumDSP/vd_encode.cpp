// Vektur Drum — audio file encoders (NEW 0.8): WAV, FLAC, MP3 — a line-for-line port of web/src/encoders.js.
// WAV and FLAC output is byte-identical to the web app's; MP3 is the same algorithm (filterbank, MDCT, one global gain
// per frame, Huffman table choice, LAME "Info" tag for gapless decoding). Not real-time code: allocation is fine here.
#include "vd_encode.h"
#include "vd_mp3_tables.h"
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>

namespace {
struct Bits {
    std::vector<uint8_t> b; uint32_t acc = 0; int n = 0;
    void put(uint32_t v, int bits) {
        if (bits > 24) { put((v >> 16) & 0xffff, bits - 16); put(v & 0xffff, 16); return; }
        acc = (acc << bits) | (v & ((1u << bits) - 1u)); n += bits;
        while (n >= 8) { n -= 8; b.push_back(uint8_t((acc >> n) & 0xff)); }
        acc &= (1u << n) - 1u;
    }
    void align() { if (n) put(0, 8 - n); }
    size_t p() const { return b.size(); }
};
inline double clamp1(double x) { return x < -1 ? -1 : x > 1 ? 1 : x; }
inline int32_t quantInt(double x, int bits) { const double m = double((1 << (bits - 1)) - 1); return int32_t(std::floor(clamp1(x) * m + 0.5)); }   // = JS Math.round

// ---------------------------------------------------------------- WAV
std::vector<uint8_t> wav(const float *const *ch, int nc, uint32_t n, uint32_t sr, int depth) {
    const bool fl = depth == 32; const uint32_t bps = uint32_t(depth / 8), data = n * uint32_t(nc) * bps, hdr = fl ? 58 : 44;
    std::vector<uint8_t> o; o.reserve(hdr + data);
    auto s4 = [&](const char *s) { o.insert(o.end(), s, s + 4); };
    auto u32 = [&](uint32_t x) { for (int i = 0; i < 4; ++i) o.push_back(uint8_t(x >> (8 * i))); };
    auto u16 = [&](uint32_t x) { o.push_back(uint8_t(x)); o.push_back(uint8_t(x >> 8)); };
    s4("RIFF"); u32(hdr - 8 + data); s4("WAVE"); s4("fmt "); u32(fl ? 18 : 16); u16(fl ? 3 : 1); u16(uint32_t(nc)); u32(sr); u32(sr * uint32_t(nc) * bps); u16(uint32_t(nc) * bps); u16(uint32_t(depth));
    if (fl) { u16(0); s4("fact"); u32(4); u32(n); }
    s4("data"); u32(data);
    for (uint32_t i = 0; i < n; ++i) for (int c = 0; c < nc; ++c) {
        const float x = ch[c][i];
        if (fl) { uint32_t v; std::memcpy(&v, &x, 4); u32(v); }
        else if (depth == 16) { const int32_t q = quantInt(x, 16); u16(uint32_t(q) & 0xffff); }
        else { const int32_t q = quantInt(x, 24); o.push_back(uint8_t(q)); o.push_back(uint8_t(q >> 8)); o.push_back(uint8_t(q >> 16)); }
    }
    return o;
}

// ---------------------------------------------------------------- FLAC
uint8_t CRC8[256]; uint16_t CRC16[256]; bool crcReady = false;
void crcInit() {
    if (crcReady) return;
    for (int i = 0; i < 256; ++i) { int c = i; for (int k = 0; k < 8; ++k) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; CRC8[i] = uint8_t(c);
        int d = i << 8; for (int k = 0; k < 8; ++k) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = uint16_t(d); }
    crcReady = true;
}
struct Plan { bool verbatim = false; int order = 0, porder = 0; int params[64] = {}; double bits = 0; };
void residuals(const int32_t *x, int n, int order, int64_t *out) {
    for (int i = order; i < n; ++i)
        out[i] = order == 0 ? int64_t(x[i]) : order == 1 ? int64_t(x[i]) - x[i - 1] : order == 2 ? int64_t(x[i]) - 2LL * x[i - 1] + x[i - 2]
               : order == 3 ? int64_t(x[i]) - 3LL * x[i - 1] + 3LL * x[i - 2] - x[i - 3] : int64_t(x[i]) - 4LL * x[i - 1] + 6LL * x[i - 2] - 4LL * x[i - 3] + x[i - 4];
}
void bestRice(const int64_t *res, int a, int e, int &bk, double &bb) {
    double s = 0; for (int i = a; i < e; ++i) { const int64_t r = res[i]; s += double(r >= 0 ? 2 * r : -2 * r - 1); }
    const int n = e - a; bk = 0; bb = 1e300;
    for (int k = 0; k <= 14; ++k) { const double b = double(n) * (k + 1) + std::floor(s / double(1 << k)); if (b < bb) { bb = b; bk = k; } }
}
Plan planSub(const int32_t *x, int n, int bps, int64_t *res) {
    Plan best; bool have = false;
    for (int order = 0; order <= std::min(4, n - 1); ++order) {
        residuals(x, n, order, res);
        for (int po = 0; po <= 6; ++po) {
            if (((n >> po) << po) != n || (n >> po) <= order) break;
            const int ps = n >> po; Plan p; p.order = order; p.porder = po; p.bits = 6 + 4 + double(order) * bps + 2 + 4;
            for (int q = 0; q < (1 << po); ++q) { const int a = q ? q * ps : order, e = (q + 1) * ps; int k; double b; bestRice(res, a, e, k, b); p.params[q] = k; p.bits += 4 + b; }
            if (!have || p.bits < best.bits) { best = p; have = true; }
        }
    }
    const double verb = 8 + double(n) * bps; if (verb < best.bits) { best = Plan(); best.verbatim = true; best.bits = verb; }
    return best;
}
inline uint32_t mask(int bps) { return bps >= 32 ? 0xffffffffu : (1u << bps) - 1u; }
void writeSub(Bits &w, const int32_t *x, int n, int bps, const Plan &pl, int64_t *res) {
    if (pl.verbatim) { w.put(0, 1); w.put(1, 6); w.put(0, 1); for (int i = 0; i < n; ++i) w.put(uint32_t(x[i]) & mask(bps), bps); return; }
    w.put(0, 1); w.put(uint32_t(8 | pl.order), 6); w.put(0, 1);
    for (int i = 0; i < pl.order; ++i) w.put(uint32_t(x[i]) & mask(bps), bps);
    residuals(x, n, pl.order, res);
    w.put(0, 2); w.put(uint32_t(pl.porder), 4);
    const int ps = n >> pl.porder;
    for (int q = 0; q < (1 << pl.porder); ++q) {
        const int k = pl.params[q]; w.put(uint32_t(k), 4);
        for (int i = q ? q * ps : pl.order; i < (q + 1) * ps; ++i) {
            const int64_t r = res[i]; const uint64_t u = uint64_t(r >= 0 ? 2 * r : -2 * r - 1); uint64_t z = u >> k;
            while (z > 0) { const int c = int(std::min<uint64_t>(z, 24)); w.put(0, c); z -= uint64_t(c); }
            w.put(1, 1); if (k) w.put(uint32_t(u & ((1u << k) - 1u)), k);
        }
    }
}
void utf8num(Bits &w, uint32_t v) {
    if (v < 0x80) { w.put(v, 8); return; }
    const int nb = v < 0x800 ? 2 : v < 0x10000 ? 3 : v < 0x200000 ? 4 : v < 0x4000000 ? 5 : 6;
    w.put(((0xff00u >> nb) & 0xffu) | (v >> (6 * (nb - 1))), 8);
    for (int i = nb - 2; i >= 0; --i) w.put(0x80u | ((v >> (6 * i)) & 0x3fu), 8);
}
std::vector<uint8_t> flac(const float *const *ch, int nc, uint32_t n, uint32_t sr, int depth) {
    crcInit();
    const int BS = 4096; Bits w; w.b.reserve(size_t(n) * size_t(nc) * size_t(depth / 8) / 2 + 4096);
    std::vector<std::vector<int32_t>> ints(static_cast<size_t>(nc), std::vector<int32_t>(static_cast<size_t>(n)));
    for (int c = 0; c < nc; ++c) for (uint32_t i = 0; i < n; ++i) ints[size_t(c)][i] = quantInt(ch[c][i], depth);
    w.put(0x664C6143u, 32); w.put(0x80, 8); w.put(34, 24);
    w.put(uint32_t(BS), 16); w.put(uint32_t(BS), 16); w.put(0, 24); w.put(0, 24); w.put(sr, 20); w.put(uint32_t(nc - 1), 3); w.put(uint32_t(depth - 1), 5);
    w.put(0, 4); w.put(n, 32); for (int i = 0; i < 4; ++i) w.put(0, 32);
    const int srCode = sr == 44100 ? 9 : sr == 48000 ? 10 : sr == 96000 ? 11 : sr == 32000 ? 8 : 0, ssCode = depth == 16 ? 4 : 6;
    std::vector<int64_t> res(BS); std::vector<int32_t> M(BS), S(BS), Lb(BS), Rb(BS);
    uint32_t f = 0;
    for (uint32_t pos = 0; pos < n; ++f, pos += BS) {
        const int bs = int(std::min<uint32_t>(BS, n - pos)); const size_t start = w.p();
        int assign; struct Sub { const int32_t *x; int bps; Plan pl; } subs[2]; int ns = 0;
        if (nc == 2) {
            for (int i = 0; i < bs; ++i) { const int32_t l = ints[0][pos + uint32_t(i)], r = ints[1][pos + uint32_t(i)]; Lb[size_t(i)] = l; Rb[size_t(i)] = r; M[size_t(i)] = (l + r) >> 1; S[size_t(i)] = l - r; }
            const Plan pl = planSub(Lb.data(), bs, depth, res.data()), pr = planSub(Rb.data(), bs, depth, res.data()), pm = planSub(M.data(), bs, depth, res.data()), psd = planSub(S.data(), bs, depth + 1, res.data());
            if (pm.bits + psd.bits < pl.bits + pr.bits) { assign = 10; subs[0] = {M.data(), depth, pm}; subs[1] = {S.data(), depth + 1, psd}; }
            else { assign = 1; subs[0] = {Lb.data(), depth, pl}; subs[1] = {Rb.data(), depth, pr}; }
            ns = 2;
        } else { for (int i = 0; i < bs; ++i) Lb[size_t(i)] = ints[0][pos + uint32_t(i)]; assign = 0; subs[0] = {Lb.data(), depth, planSub(Lb.data(), bs, depth, res.data())}; ns = 1; }
        w.put(0xFFF8, 16);
        const int bsCode = bs == BS ? 12 : bs <= 256 ? 6 : 7;
        w.put(uint32_t(bsCode), 4); w.put(uint32_t(srCode), 4); w.put(uint32_t(assign), 4); w.put(uint32_t(ssCode), 3); w.put(0, 1);
        utf8num(w, f);
        if (bsCode == 6) w.put(uint32_t(bs - 1), 8); else if (bsCode == 7) w.put(uint32_t(bs - 1), 16);
        { uint8_t c = 0; for (size_t i = start; i < w.p(); ++i) c = CRC8[c ^ w.b[i]]; w.put(c, 8); }
        for (int s = 0; s < ns; ++s) writeSub(w, subs[s].x, bs, subs[s].bps, subs[s].pl, res.data());
        w.align();
        { uint16_t c = 0; for (size_t i = start; i < w.p(); ++i) c = uint16_t(((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ w.b[i]]); w.put(c, 16); }
    }
    return w.b;
}

// ---------------------------------------------------------------- MP3 (MPEG-1 Layer III)
using vd::mp3t::HT;
const int BR[15] = {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320};
const int SFB44[23] = {0, 4, 8, 12, 16, 20, 24, 30, 36, 44, 52, 62, 74, 90, 110, 134, 162, 196, 238, 288, 342, 418, 576};
const int SFB48[23] = {0, 4, 8, 12, 16, 20, 24, 30, 36, 42, 50, 60, 72, 88, 106, 128, 156, 190, 230, 276, 330, 384, 576};
const int SFB32[23] = {0, 4, 8, 12, 16, 20, 24, 30, 36, 44, 54, 66, 82, 102, 126, 156, 194, 240, 296, 364, 448, 550, 576};
const int SUBDV[23][2] = {{0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 1}, {1, 1}, {1, 1}, {1, 2}, {2, 2}, {2, 3}, {2, 3}, {3, 4}, {3, 4}, {3, 4}, {4, 5}, {4, 5}, {4, 6}, {5, 6}, {5, 6}, {5, 7}, {6, 7}, {6, 7}};
const int BIG[13] = {1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15};
struct Tabs { double C[512], M[32 * 64], W[36], MC[18 * 36], CS[8], CA[8]; };
const Tabs &tabs() {
    static const Tabs t = [] {
        Tabs x{};
        for (int i = 0; i < 257; ++i) { double v = vd::mp3t::ENWIN[i]; x.C[i] = v; if (i & 63) v = -v; if (i) x.C[512 - i] = v; }
        for (double &c : x.C) c /= 65536.0 * 32.0;
        for (int i = 0; i < 32; ++i) for (int k = 0; k < 64; ++k) x.M[i * 64 + k] = std::cos((2 * i + 1) * (k - 16) * M_PI / 64);
        for (int k = 0; k < 36; ++k) x.W[k] = std::sin(M_PI / 36 * (k + 0.5));
        for (int i = 0; i < 18; ++i) for (int k = 0; k < 36; ++k) x.MC[i * 36 + k] = std::cos(M_PI / 72 * (2 * k + 1 + 18) * (2 * i + 1));
        const double cc[8] = {-0.6, -0.535, -0.33, -0.185, -0.095, -0.041, -0.0142, -0.0037};
        for (int i = 0; i < 8; ++i) { x.CS[i] = 1 / std::sqrt(1 + cc[i] * cc[i]); x.CA[i] = cc[i] / std::sqrt(1 + cc[i] * cc[i]); }
        return x;
    }();
    return t;
}
int pairBits(const int32_t *ix, int a, int e, int t) {
    const auto &h = HT[t]; const int yl = h.ylen, lb = h.linbits; int b = 0;
    for (int i = a; i < e; i += 2) {
        const int x = ix[i], y = ix[i + 1];
        if (lb) b += h.lens[(x > 15 ? 15 : x) * 16 + (y > 15 ? 15 : y)] + (x >= 15 ? lb : 0) + (y >= 15 ? lb : 0);
        else b += h.lens[x * yl + y];
        if (x) b++;
        if (y) b++;
    }
    return b;
}
void pickTable(const int32_t *ix, int a, int e, int &tab, int &bits) {
    int m = 0; for (int i = a; i < e; ++i) if (ix[i] > m) m = ix[i];
    tab = 0; bits = 0; if (m == 0) return;
    int best = -1, bb = 1 << 30;
    if (m < 15) { for (int t : BIG) if (HT[t].xlen > m) { const int b = pairBits(ix, a, e, t); if (b < bb) { bb = b; best = t; } } }
    else { const int g[2][2] = {{16, 23}, {24, 31}}; for (auto &gg : g) for (int t = gg[0]; t <= gg[1]; ++t) if (HT[t].linmax >= m - 15) { const int b = pairBits(ix, a, e, t); if (b < bb) { bb = b; best = t; } break; } }
    tab = best; bits = bb;
}
struct GPlan { int bv, c1, r0, r1, a1, a2, big, tab[3], c1t, bits; };
GPlan plan(const int32_t *ix, const int *sfb) {
    int i = 576; while (i > 1 && ix[i - 1] == 0 && ix[i - 2] == 0) i -= 2;
    int c1 = 0; while (i > 3 && ix[i - 1] <= 1 && ix[i - 2] <= 1 && ix[i - 3] <= 1 && ix[i - 4] <= 1) { i -= 4; c1++; }
    GPlan p{}; p.bv = i >> 1; p.big = p.bv * 2; p.c1 = c1;
    if (p.big > 0) {
        int anz = 0; while (sfb[anz] < p.big) anz++;
        int tc; for (tc = SUBDV[anz][0]; tc; tc--) if (sfb[tc + 1] <= p.big) break;
        p.r0 = tc; p.a1 = sfb[tc + 1];
        for (tc = SUBDV[anz][1]; tc; tc--) if (sfb[p.r0 + 1 + tc + 1] <= p.big) break;
        p.r1 = tc; p.a2 = sfb[p.r0 + 1 + tc + 1];
        if (p.a1 > p.big) p.a1 = p.big;
        if (p.a2 > p.big) p.a2 = p.big;
        if (p.a2 < p.a1) p.a2 = p.a1;
    }
    int b0, b1, b2; pickTable(ix, 0, p.a1, p.tab[0], b0); pickTable(ix, p.a1, p.a2, p.tab[1], b1); pickTable(ix, p.a2, p.big, p.tab[2], b2);
    int ba = 0, bbb = 0;
    for (int k = p.big; k < p.big + 4 * c1; k += 4) { const int q = ix[k] * 8 + ix[k + 1] * 4 + ix[k + 2] * 2 + ix[k + 3], s = ix[k] + ix[k + 1] + ix[k + 2] + ix[k + 3]; ba += HT[32].lens[q] + s; bbb += HT[33].lens[q] + s; }
    p.c1t = bbb < ba ? 1 : 0; p.bits = b0 + b1 + b2 + std::min(ba, bbb);
    return p;
}
void writeHuff(Bits &w, const int32_t *ix, const uint8_t *sg, const GPlan &p) {
    const int reg[3][3] = {{0, p.a1, p.tab[0]}, {p.a1, p.a2, p.tab[1]}, {p.a2, p.big, p.tab[2]}};
    for (auto &r : reg) {
        const int a = r[0], e = r[1], t = r[2]; if (!t) continue; const auto &h = HT[t]; const int yl = h.ylen, lb = h.linbits;
        for (int i = a; i < e; i += 2) {
            const int x = ix[i], y = ix[i + 1];
            if (lb) { const int k = (x > 15 ? 15 : x) * 16 + (y > 15 ? 15 : y); w.put(h.codes[k], h.lens[k]);
                if (x >= 15) { w.put(uint32_t(x - 15), lb); }
                if (x) { w.put(sg[i], 1); }
                if (y >= 15) { w.put(uint32_t(y - 15), lb); }
                if (y) { w.put(sg[i + 1], 1); } }
            else { const int k = x * yl + y; w.put(h.codes[k], h.lens[k]); if (x) { w.put(sg[i], 1); } if (y) { w.put(sg[i + 1], 1); } }
        }
    }
    const auto &h = HT[32 + p.c1t];
    for (int k = p.big; k < p.big + 4 * p.c1; k += 4) { const int q = ix[k] * 8 + ix[k + 1] * 4 + ix[k + 2] * 2 + ix[k + 3]; w.put(h.codes[q], h.lens[q]); for (int j = 0; j < 4; ++j) if (ix[k + j]) w.put(sg[k + j], 1); }
}
std::vector<uint8_t> mp3(const float *const *ch, int nc, uint32_t n, uint32_t sr, int kbps) {
    const Tabs &t = tabs(); const int *sfb = sr == 44100 ? SFB44 : sr == 48000 ? SFB48 : sr == 32000 ? SFB32 : nullptr;
    int bri = 0;
    for (int i = 1; i < 15; ++i) if (BR[i] == kbps) bri = i;
    if (!sfb || !bri) return {};
    const uint32_t frames = (n + 1152 + 1151) / 1152; const int side = nc == 2 ? 32 : 17;
    Bits out; out.b.reserve(size_t(double(frames + 1) * (144.0 * kbps * 1000 / sr + 2)) + 64);
    std::vector<std::vector<double>> X(static_cast<size_t>(nc), std::vector<double>(512)), prev(static_cast<size_t>(nc), std::vector<double>(32 * 18));
    double Z[64], sbs[18 * 32], inn[36];
    struct G { double xr[2][2][576], x34[2][2][576]; int32_t ixs[2][2][576]; uint8_t sgs[2][2][576]; };
    std::unique_ptr<G> g(new G()); auto &xr = g->xr; auto &x34 = g->x34; auto &ixs = g->ixs; auto &sgs = g->sgs;
    const long frac = long(144) * kbps * 1000 % long(sr); const int base = int(long(144) * kbps * 1000 / long(sr)); long padAcc = 0;
    auto hdr = [&](int pad) { out.put(0xFFF, 12); out.put(1, 1); out.put(1, 2); out.put(1, 1); out.put(uint32_t(bri), 4); out.put(sr == 44100 ? 0 : sr == 48000 ? 1 : 2, 2); out.put(uint32_t(pad), 1); out.put(0, 1);
        out.put(nc == 2 ? 0 : 3, 2); out.put(0, 2); out.put(0, 1); out.put(1, 1); out.put(0, 2); };
    hdr(0); for (int i = 0; i < side; ++i) out.put(0, 8); const size_t tagAt = out.p(); while (out.p() < size_t(base)) out.put(0, 8);
    for (uint32_t f = 0; f < frames; ++f) {
        for (int gr = 0; gr < 2; ++gr) for (int c = 0; c < nc; ++c) {
            const float *src = ch[c]; double *x = X[size_t(c)].data(); const uint64_t s0 = uint64_t(f) * 1152 + uint64_t(gr) * 576;
            for (int tt = 0; tt < 18; ++tt) {
                std::memmove(x + 32, x, 480 * sizeof(double));
                for (int i = 0; i < 32; ++i) { const uint64_t k = s0 + uint64_t(tt) * 32 + uint64_t(i); x[31 - i] = k < n ? double(src[k]) : 0.0; }
                for (int i = 0; i < 64; ++i) { double y = 0; for (int j = 0; j < 8; ++j) y += t.C[i + 64 * j] * x[i + 64 * j]; Z[i] = y; }
                for (int sb = 0; sb < 32; ++sb) { double s = 0; const int m = sb * 64; for (int k = 0; k < 64; ++k) s += t.M[m + k] * Z[k]; sbs[tt * 32 + sb] = (sb & 1) && (tt & 1) ? -s : s; }
            }
            double *r = xr[gr][c], *pv = prev[size_t(c)].data();
            for (int sb = 0; sb < 32; ++sb) {
                for (int k = 0; k < 18; ++k) { inn[k] = pv[sb * 18 + k]; inn[18 + k] = sbs[k * 32 + sb]; pv[sb * 18 + k] = sbs[k * 32 + sb]; }
                for (int i = 0; i < 18; ++i) { double s = 0; for (int k = 0; k < 36; ++k) s += inn[k] * t.W[k] * t.MC[i * 36 + k]; r[sb * 18 + i] = s / 9; }
            }
            for (int sb = 1; sb < 32; ++sb) for (int i = 0; i < 8; ++i) {
                const int a = (sb - 1) * 18 + 17 - i, b = sb * 18 + i; const double bu = r[a], bd = r[b];
                r[a] = bu * t.CS[i] + bd * t.CA[i]; r[b] = bd * t.CS[i] - bu * t.CA[i];
            }
            for (int i = 0; i < 576; ++i) { const double v = r[i]; sgs[gr][c][i] = v < 0 ? 1 : 0; x34[gr][c][i] = std::pow(std::fabs(v), 0.75); }
        }
        int pad = 0; padAcc += frac; if (padAcc >= long(sr)) { padAcc -= long(sr); pad = 1; }
        const int fbytes = base + pad, mainBits = (fbytes - 4 - side) * 8;
        GPlan plans[4];
        auto quant = [&](int gg) -> bool {
            const double st = std::pow(2.0, -(gg - 210) * 0.1875); int tot = 0, k = 0;
            for (int gr = 0; gr < 2; ++gr) for (int c = 0; c < nc; ++c, ++k) {
                for (int i = 0; i < 576; ++i) { const double v = std::floor(x34[gr][c][i] * st + 0.4054); if (v > 8206) return false; ixs[gr][c][i] = int32_t(v); }
                plans[k] = plan(ixs[gr][c], sfb); if (plans[k].tab[0] < 0 || plans[k].tab[1] < 0 || plans[k].tab[2] < 0 || plans[k].bits > 4095) return false; tot += plans[k].bits;
            }
            return tot <= mainBits;
        };
        int lo = 0, hi = 255;
        if (!quant(255)) { std::memset(ixs, 0, sizeof ixs); for (int k = 0; k < 2 * nc; ++k) plans[k] = plan(ixs[0][0], sfb); lo = 255; }
        else { while (lo < hi) { const int mid = (lo + hi) >> 1; if (quant(mid)) hi = mid; else lo = mid + 1; } quant(lo); }
        const size_t start = out.p();
        hdr(pad);
        out.put(0, 9); out.put(0, nc == 2 ? 3 : 5); out.put(0, 4 * nc);
        int k = 0;
        for (int gr = 0; gr < 2; ++gr) for (int c = 0; c < nc; ++c, ++k) {
            const GPlan &p = plans[k]; out.put(uint32_t(p.bits), 12); out.put(uint32_t(p.bv), 9); out.put(p.bv || p.c1 ? uint32_t(lo) : 0, 8); out.put(0, 4); out.put(0, 1);
            out.put(uint32_t(p.tab[0]), 5); out.put(uint32_t(p.tab[1]), 5); out.put(uint32_t(p.tab[2]), 5); out.put(uint32_t(p.r0), 4); out.put(uint32_t(p.r1), 3); out.put(0, 1); out.put(0, 1); out.put(uint32_t(p.c1t), 1);
        }
        k = 0; for (int gr = 0; gr < 2; ++gr) for (int c = 0; c < nc; ++c, ++k) writeHuff(out, ixs[gr][c], sgs[gr][c], plans[k]);
        out.align(); while (out.p() < start + size_t(fbytes)) out.put(0, 8);
    }
    std::vector<uint8_t> &b = out.b; const uint32_t total = uint32_t(b.size()); const int DELAY = 528; const long endPad = long(frames) * 1152 - DELAY - long(n);
    auto put32 = [&](size_t o, uint32_t v) { b[o] = uint8_t(v >> 24); b[o + 1] = uint8_t(v >> 16); b[o + 2] = uint8_t(v >> 8); b[o + 3] = uint8_t(v); };
    size_t o = tagAt; std::memcpy(&b[o], "Info", 4); o += 4; put32(o, 3); o += 4; put32(o, frames); o += 4; put32(o, total); o += 4;
    std::memcpy(&b[o], "LAME3.100", 9); o += 9; b[o++] = 0x01;
    b[o++] = uint8_t(std::min<long>(255, std::lround(double(sr) / 200))); o += 4 + 2 + 2; b[o++] = 0; b[o++] = uint8_t(std::min(255, kbps));
    const int ep = int(std::max(0L, std::min(4095L, endPad))); b[o++] = uint8_t(DELAY >> 4); b[o++] = uint8_t(((DELAY & 15) << 4) | (ep >> 8)); b[o++] = uint8_t(ep & 255);
    o += 1 + 1 + 2; put32(o, total); o += 4; o += 2;
    uint32_t crc = 0; for (size_t i = 0; i < o; ++i) { crc ^= b[i]; for (int q = 0; q < 8; ++q) crc = crc & 1 ? (crc >> 1) ^ 0xA001 : crc >> 1; }
    b[o] = uint8_t(crc >> 8); b[o + 1] = uint8_t(crc & 255);
    return b;
}
}  // namespace

extern "C" {
size_t vd_encode(vd_file_format fmt, const float *const *ch, uint32_t channels, uint32_t frames, uint32_t sample_rate, uint32_t quality, uint8_t **out) {
    if (!out) return 0;
    *out = nullptr;
    if (!ch || channels < 1 || channels > 2 || !ch[0] || (channels == 2 && !ch[1]) || frames == 0 || sample_rate < 8000) return 0;
    std::vector<uint8_t> v;
    switch (fmt) {
        case VD_FILE_WAV: if (quality != 16 && quality != 24 && quality != 32) return 0; v = wav(ch, int(channels), frames, sample_rate, int(quality)); break;
        case VD_FILE_FLAC: if (quality != 16 && quality != 24) return 0; v = flac(ch, int(channels), frames, sample_rate, int(quality)); break;
        case VD_FILE_MP3: v = mp3(ch, int(channels), frames, sample_rate, int(quality)); break;
        default: return 0;
    }
    if (v.empty()) return 0;
    *out = static_cast<uint8_t *>(std::malloc(v.size()));
    if (!*out) return 0;
    std::memcpy(*out, v.data(), v.size()); return v.size();
}
void vd_encode_free(uint8_t *p) { std::free(p); }
}
