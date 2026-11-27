// Vektur Drum — the drum engine (C++). Audio-thread object: everything here runs on the render thread except
// prepare() and the constructor. Threads talk to it only through vd_engine.cpp (commands, atomics, rings).
//
// Origin: Vektur VJ's native/Shared/DSP/Drums.h (Vektur Pulse), kept in structure and arithmetic so that with the
// new features off it renders what Vektur Pulse renders. Extended line for line with web/src/engine.js, which is the
// reference for the new features (tests/native_parity checks the two against each other):
//   12 tracks (0.9) · per-track engine (drum synth | sample | FM) · pitch sweep · choke groups A–D · FM voice (3 operators,
//   4 algorithms, feedback, index envelope, wavefolder, noise, per-step ratio) · global glitch (stutter, reverse,
//   Metal stretch) with 3 LFOs · Rate at its top is "off" at any sample rate (Pulse held 96 kHz voices to 48 kHz).
// Where JavaScript and C++ round differently, this file follows the JavaScript (jsRound = Math.round).
#pragma once
#include "vd_params.generated.h"
#include "vd_sample_impl.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace vd {

constexpr int kT = VDG_TRACKS, kS = 16, kP = 8, kC = 16, kCR = 16, kSF = 25, kND = VDG_DIVS;   // step fields: … 15 fold, 16–20 shift st, shift mix, spectral, colour, spectral mix,
                                                                                                  // NEW (0.9) 21 Metalise (−1 = track / slice), 22 slice (0 = the track's), 23 reverse chance, 24 stutter chance
constexpr int kNX = 9, kSLF = 11;   // a step's fields 16–24 (shift, spectral, Metalise, slice, chances) · a slice record (see Engine::setSlices)
// NEW (0.8): per-step pitch shifter and spectral processor — sizes (= web PSN, SPN, SPH, SPK)
constexpr int kPSN = 4096, kSPN = 256, kSPH = 64, kSPK = kSPN / 2 + 1, kSPLog = 8;
constexpr int kNSlot = VDG_SL_SLOTS, kNWire = VDG_MOD_WIRES, kNSrc = VDG_MOD_SOURCES, kRingOsc = VDG_RING_OSC;
constexpr int kTel = 4 + 3 * kT + 3 + kNSrc + 2 + 2 * kNWire;   // … + modulated dials: [dense index, position] × 32
constexpr double kPi = 3.14159265358979323846;
inline double clampd(double v, double a, double b) { return v < a ? a : (v > b ? b : v); }
inline double ftz(double x) { return std::fabs(x) < 1e-18 ? 0.0 : x; }
inline uint32_t xs(uint32_t &s) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
inline long lr(double x) { return std::lround(x); }                   // C lround = the web engine's lround()
inline double jsRound(double x) { return std::floor(x + 0.5); }       // JavaScript Math.round
// Transcendentals go through these. VD_ALT_LIBM (parity tests only) nudges about 3 % of results by one ulp,
// chosen by a hash of the argument — what V8's Math.sin / exp / pow do relative to the platform libm (measured:
// last-bit differences on 3.3 % of arguments). Rendering both builds shows where the music is so sensitive that
// one-bit differences grow (high-feedback FM, the glitch's rounded grain lengths): the yardstick for JS ↔ C++ parity.
#ifdef VD_ALT_LIBM
inline double vjit(double r, double x) {
    uint64_t b; std::memcpy(&b, &x, 8); b *= VD_ALT_LIBM == 2 ? 0xD6E8FEB86659FD93ull : 0x9E3779B97F4A7C15ull;   // 2: another 3 % (a second yardstick)
    if ((b >> 58) != 0) return r;                          // 1 in 64 ≈ 1.6 % up, 1.6 % down
    return std::nextafter(r, (b >> 57) & 1 ? HUGE_VAL : -HUGE_VAL);
}
inline double vsin(double x) { return vjit(std::sin(x), x); }
inline double vcos(double x) { return vjit(std::cos(x), x); }
inline double vpow(double a, double b) { return vjit(std::pow(a, b), a * 1.618 + b); }
inline double vexp(double x) { return vjit(std::exp(x), x); }
inline double vlog(double x) { return vjit(std::log(x), x); }
inline double vtan(double x) { return vjit(std::tan(x), x); }
inline double vtanh(double x) { return vjit(std::tanh(x), x); }
inline double vatan2(double y, double x) { return vjit(std::atan2(y, x), y * 1.618 + x); }
#else
inline double vsin(double x) { return std::sin(x); }
inline double vcos(double x) { return std::cos(x); }
inline double vpow(double a, double b) { return std::pow(a, b); }
inline double vexp(double x) { return std::exp(x); }
inline double vlog(double x) { return std::log(x); }
inline double vtan(double x) { return std::tan(x); }
inline double vtanh(double x) { return std::tanh(x); }
inline double vatan2(double y, double x) { return std::atan2(y, x); }
#endif

// template indices of the new per-track parameters (after Vektur Pulse's 15)
enum { K_ENGINE = VDG_K_ENGINE, K_CHOKE = VDG_K_CHOKE, K_SWEEP = VDG_K_SWEEP, K_SWTIME = VDG_K_SWTIME, K_ALGO = VDG_K_FMALGO,
       K_FREQ = VDG_K_FMFREQ, K_RATIO = VDG_K_FMRATIO, K_RATIO2 = VDG_K_FMRATIO2, K_INDEX = VDG_K_FMINDEX, K_IDEC = VDG_K_FMIDEC,
       K_FB = VDG_K_FMFB, K_FOLD = VDG_K_FMFOLD, K_NOISE = VDG_K_FMNOISE,
       K_LONG = VDG_K_LONG, K_METAL = VDG_K_METAL, K_RSMP = VDG_K_RSMP, K_RSMODE = VDG_K_RSMODE, K_RSSENS = VDG_K_RSSENS, K_SMODEL = VDG_K_SMODEL, K_SLICE = VDG_K_SLICE };   // NEW (0.9)
static const int kLF[3][6] = {
    {VDG_LFO1_RATE, VDG_LFO1_SHAPE, VDG_LFO1_DEPTH, VDG_LFO1_DEST, VDG_LFO1_SYNC, VDG_LFO1_DIV},
    {VDG_LFO2_RATE, VDG_LFO2_SHAPE, VDG_LFO2_DEPTH, VDG_LFO2_DEST, VDG_LFO2_SYNC, VDG_LFO2_DIV},
    {VDG_LFO3_RATE, VDG_LFO3_SHAPE, VDG_LFO3_DEPTH, VDG_LFO3_DEST, VDG_LFO3_SYNC, VDG_LFO3_DIV}};
static const double kLDiv[7] = {16, 8, 4, 2, 1, 0.5, 0.25}, kGlSlice[5] = {0.125, 0.25, 0.5, 1, 2};
static const double kMetal[6] = {205.3, 304.4, 369.6, 522.7, 540.0, 800.0};
static const int kSlHold[7] = {0, 2, 3, 4, 6, 8, 10};   // Slicer hold pad → action
static const double kFdnRate[8] = {0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 0.31, 0.37};   // Expanse: modulation rates (Hz)
// FFT (radix 2, in place) — the same algorithm and tables as web/src/engine.js, for sample-identical output
struct FFTTables {
    double cs[kSPN / 2], sn[kSPN / 2], win[kSPN]; uint16_t rev[kSPN];
    FFTTables() {
        for (int i = 0; i < kSPN / 2; ++i) { cs[i] = std::cos(2.0 * kPi * i / kSPN); sn[i] = std::sin(2.0 * kPi * i / kSPN); }
        for (int i = 0; i < kSPN; ++i) { int r = 0; for (int b = 0; b < kSPLog; ++b) if (i & (1 << b)) r |= 1 << (kSPLog - 1 - b); rev[i] = uint16_t(r); win[i] = 0.5 - 0.5 * std::cos(2.0 * kPi * i / kSPN); }
    }
};
inline const FFTTables &fftTables() { static const FFTTables t; return t; }
inline void fft(double *re, double *im, bool inv) {
    const FFTTables &T = fftTables();
    for (int i = 0; i < kSPN; ++i) { const int j = T.rev[i]; if (j > i) { double x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
    for (int len = 2; len <= kSPN; len <<= 1) {
        const int half = len >> 1, st = kSPN / len;
        for (int i = 0; i < kSPN; i += len) for (int k = 0; k < half; ++k) {
            const double wr = T.cs[k * st], wi = inv ? T.sn[k * st] : -T.sn[k * st]; const int a = i + k, b = a + half;
            const double xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
    }
}
// a dial's position 0…1 (log dials: logarithmic) and back — the modulation matrix works in positions (= web normP / denormP)
inline double normP(int i, double v) { const double mn = kVDGParams[i].min, mx = kVDGParams[i].max;
    if (kVDGParams[i].logscale) return mn > 0 ? vlog(v / mn) / vlog(mx / mn) : std::cbrt(clampd(v / mx, 0.0, 1.0));
    return (v - mn) / (mx - mn); }
inline double denormP(int i, double t) { const double mn = kVDGParams[i].min, mx = kVDGParams[i].max; t = clampd(t, 0.0, 1.0);
    if (kVDGParams[i].logscale) return mn > 0 ? mn * vpow(mx / mn, t) : mx * t * t * t;
    return mn + t * (mx - mn); }

struct Svf {   // Zavalishin TPT state-variable filter
    double ic1 = 0.0, ic2 = 0.0, a1 = 0.0, a2 = 0.0, a3 = 0.0, k = 1.0, lp = 0.0, bp = 0.0, hp = 0.0;
    void set(double fc, double q, double sr) {
        const double g = vtan(kPi * clampd(fc, 20.0, sr * 0.45) / sr);
        k = 1.0 / q; a1 = 1.0 / (1.0 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    void reset() { ic1 = ic2 = 0.0; }
    void run(double v0) {
        const double v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2.0 * v1 - ic1; ic2 = 2.0 * v2 - ic2; lp = v2; bp = v1; hp = v0 - k * v1 - v2;
    }
};

struct Voice {
    bool active = false; int model = 0;
    double t = 0.0, amp = 0.0, ampK = 1.0, pe = 0.0, peK = 1.0, ck = 0.0, ckK = 1.0, choke = 1.0;
    double ph[6] = {}, vel = 1.0, pan = 0.0, pitch = 0.0, ratio = 1.0, bph = 0.0;
    double sf = 0.0;   // NEW: the step's fold
    double swE = 0.0, swK = 1.0, stepRatio = 0.0, fcInc = 0.0, m1Inc = 0.0, m2Inc = 0.0, fmI = 0.0, ie = 0.0, ieK = 1.0,
           fmFb = 0.0, fmFold = 0.0, fmN = 0.0, m1y = 0.0, m1y2 = 0.0; int fmAlgo = 0;
    double hold = 0.0, holdPh = 0.0, out = 0.0, gl = 0.0, gr = 0.0, cq = 0.0, sdly = 0.0, srev = 0.0;
    double spos = 0.0, slp = 0.0, slpA = 1.0;
    // NEW (0.9): slice playback — which slice, where it starts, its length, gain, attack, gate and release (samples), reverse, stutter
    int sl = -1; double s0 = 0.0, sLen = 1.0, sG = 1.0, sAtt = 1.0, sGate = 2.0, sRel = 1.0; bool sRev = false; int stN = 0; double stL = 32.0; int stC = 0;
    Svf f1, f2;
};
/// NEW (0.9): METALISE state (per track, and two for the master character) and RESAMPLE state (per track)
struct Metal {
    double ef = 0, es = 0, pe = 0, de = 0, ph = 1, h0 = 0, h1 = 0, c1[256] = {}, c2[256] = {}; int cp = 0;
    double a = 0, st = 1, q = 32768, zm = 0, k = 0, fb = 0.25, cv = 0, cm = 0; int L1 = 54, L2 = 82;
};
struct Resamp {
    double ef = 0, es = 0, ph = 0, prev = 0, d0x = 0, d1x = 0, h0 = 0, h1 = 0, a1 = 0, a2 = 0, b0 = 0, b1 = 0, b2 = 0, o1 = 0, o2 = 0, pe = 0, de = 0, lp = 0, tm = 1e9;
    int was = 0, mode = 0, interp = 1; double a = 0, st = 1, q = 1, em = 0, cv = 0, nz = 0, sat = 0, wm = 0, thr = 2, lpA = 1, bits = 24, R = 48000;
};

/// Where the engine reports recorded hits (implemented by the C API layer with a lock-free ring).
struct RecordSink { virtual void push(int pat, int trk, int stp, float vel, int slice) = 0; virtual ~RecordSink() = default; };

struct Engine {
    // ---- parameters: targets are written by the C API layer (atomics there), copied here once per block
    float target[VDG_PARAM_COUNT] = {};
    double sm[VDG_PARAM_COUNT] = {};
    double mv[VDG_PARAM_COUNT] = {};   // NEW: smoothed + modulation — what the DSP reads
    // ---- sequence data (written only by commands, on the audio thread)
    float step[kP][kT][kS][kSF] = {};
    int trkLen[kP][kT] = {}, trkDiv[kP][kT] = {}, patBars[kP] = {};
    int chain[kC] = {}, chainN = 0, chainOn = 0, want = 0, jumpReq = 0, playReq = -1, recOn = 0, nTr = kT;
    int enabledFlag = 0;
    float tempo = 120.f; double hostBeat = 0.0; uint32_t beatSerial = 0;
    const vd_sample *smp[kT] = {};
    int8_t patSl[kP] = {-1, -1, -1, -1, -1, -1, -1, -1};   // NEW (0.9): each pattern's Slicer (−1 follows SLICER, 0 off, 1 on)
    RecordSink *recSink = nullptr;
    float tel[kTel] = {};

    // ---- audio-thread state
    double sr = 48000.0, beat = 0.0; uint32_t beatSeen = 0; int crCount = 0;
    bool wasEnabled = false, running = false, waiting = false;
    double startAt = 0.0, patStart = 0.0; int cur = 0, chainPos = 0;
    double nextIdx[kT] = {}, nextBeat[kT] = {}, skipIdx[kT] = {};
    int ratLeft[kT] = {}; double ratNext[kT] = {}, ratDt[kT] = {}, ratVel[kT] = {}, ratPan[kT] = {}, ratPitch[kT] = {}, ratFx[kT][3] = {}, ratFm[kT] = {}, ratFold[kT] = {};
    uint32_t prng = 0x9E3779B9u, rng = 0x1234567u, lrng = 0x2545F491u;
    // NEW (0.8): HUMANISE (the pending step's offset in beats, its own PRNG) and TEMPER (one stereo-linked stage)
    double hOff[kT] = {}, cHum = 0.0; uint32_t hrng = 0x6C8E9CF5u;
    double tmS = 0.0, tmSr = 0.0, tmA = 0.0, tmFa = 0.0, tmSa = 0.0, tmR = 0.0, tmLa = 0.0, tmF = 0.0, tmSl = 0.0, tmLp[2] = {}; bool tmLive = false;
    // NEW (0.8): per-step pitch shifter and spectral processor (per track), insert input, reverb types
    double nx[kNX] = {}, ratNx[kT][kNX] = {};
    // NEW (0.9): METALISE / RESAMPLE (slots kT, kT+1 = the master Metalise character, L and R), reverse / stutter chance PRNG
    Metal mt[kT + 2]; Resamp rs[kT]; double mtS[kT] = {}, mtSrc[kT] = {}; uint8_t mtOn[kT] = {}, rsOn[kT] = {}; uint32_t rsQ[kT] = {}, brng = 0x51ED270Bu; bool cGm = false;
    std::vector<double> psBuf, spIn, spDry, spOut, spMag, spPh; int psW[kT] = {}; double psPh[kT] = {}, psSt[kT] = {}, psMix[kT] = {}; uint8_t psOn[kT] = {}; int psWin = 1440;
    uint8_t spOn[kT] = {}, spFirst[kT] = {}; double spA[kT] = {}, spC[kT] = {}, spMix[kT] = {}; int spPos[kT] = {}, spCnt[kT] = {}, spTail[kT] = {}, fxTail[kT] = {};
    double spRe[kSPN] = {}, spIm[kSPN] = {}, spM[kSPK] = {}, spT[kSPK] = {}; uint32_t sprng = 0x2545F491u;
    int rvType = -1, cRevType = 0; bool cInDrums = true;
    double spgAp[32] = {}, spgLp[2] = {}; std::vector<double> spgBuf0, spgBuf1; long spgLen = 0, spgPos = 0;
    double gtEnv = 0.0, gtG = 0.0; long gtHold = 0;
    int fdnLen[8] = {}; long fdnMax = 0, fdnPos = 0; std::vector<double> fdnBuf; double fdnLp[8] = {}, fdnPh[8] = {}, xpLast[8] = {};
    std::vector<double> xpAp[4]; int xpApL[4] = {}, xpApP[4] = {}; double xpG[8] = {}, xpFz = 0.0, xpScale = 1.0, xpDepth = 0.0, xpDk = 0.0;
    float hits[kT] = {};
    Voice v[kT];
    std::vector<double> store;
    double *dly[2] = {}, *rvC[16] = {}, *rvA[8] = {};
    int dlyLen = 0, dlyPos = 0, rvCL[16] = {}, rvAL[8] = {}, rvCP[16] = {}, rvAP[8] = {};
    double dlyT = 0.0, dlyLp[2] = {}, rvF[16] = {}, dcX[2] = {}, dcY[2] = {}, outEnv = 0.0; long quiet = 0;
    // glitch
    std::vector<float> gb0, gb1; long gbLen = 0, gw = 0; double gAbs = 0.0;
    double lfoPh[3] = {}, lfoHold[3] = {}, lfoV[3] = {};
    static constexpr int kLPts = 16; double lfoTab[3 * kLPts] = {};   // NEW (0.9.1): drawn LFO shapes (default sines, set in the constructor)
    uint32_t glrng = 0x6A09E667u; double glChK = -1e9; bool glChOn = true;   // NEW (0.9.1): Metalise chance
    bool cGlOn = false; int cGlMode = 0, gModeNow = -1; double cGlMix = 0.0, cGlSize = 0.0, cGlSpeed = 0.0, gMixS = 0.0;
    double gCap = -1, gStart = 0.0, gLen = 1.0, gPos = 0.0, gSrc = 0.0; long gi = 0, gG = 0;
    // NEW: modulation (sources → wires → mv)
    double srcV[kNSrc] = {}, wAmt[kNWire] = {}, modOff[VDG_PARAM_COUNT] = {};
    int wSrc[kNWire] = {}, wDst[kNWire] = {}, modList[kNWire] = {}, nMod = 0; uint8_t wired[VDG_PARAM_COUNT] = {};
    double envPk = 0.0, envV = 0.0, chX = 0.1, chY = 0.0, chZ = 0.0, chL = 0.5, chPh = 0.0, chOut = 0.0; uint32_t chrng = 0x6C078965u; int envT = -1;
    // NEW: per-step ring modulation
    double yv[kT] = {}; uint8_t act[kT] = {};
    bool rOn = false; int rMaster = 0, rMask = 0; double rAmt = 0.0, rHz = 220.0, rEnd = 0.0, rPh = 0.0, rS = 0.0, rEnv = 0.0, ringK = 0.0, rEnvK = 0.0;
    // NEW: Slicer
    // NEW: per-track EQ (4 biquads, transposed direct form II) and tape & vinyl
    uint8_t eqOn[kT * 4] = {}; double eqC[kT * 4 * 5] = {}, eqZ[kT * 4 * 2] = {};
    std::vector<double> tb0, tb1; long tbLen = 0, tw = 0; double wowPh = 0.0, flPh = 0.0, fl2Ph = 0.0, wD = 0.0, popL = 0.0, popR = 0.0, hissL = 0.0, hissR = 0.0, popK = 0.0;
    uint32_t tprng = 0x51ED270Bu; bool cTape = false;
    uint8_t slAct[kNSlot] = {}, slSrc[kNSlot] = {};
    std::vector<float> sb0, sb1; long sbLen = 0, sw = 0; double sAbs = 0.0, curSt[kNSlot] = {}, prevSt[kNSlot] = {};
    long sCyc = -1; int sIdx = -1, sAct = 0, sSrc = 0, sHold = 0; double sStart = 0.0, sL = 1.0, sMixS = 0.0; uint32_t slrng = 1;
    double sLastP = -1.0, sLastG = 1.0, dclL = 0.0, dclR = 0.0; int dclN = 0;
    bool cSlOn = false; int cSlDiv = 1, cSlBars = 0, cSlSeed = 1, cSlStut = 2, cSlPitch = -12, cSlHold = 0;
    double cSlMix = 0.0, cSlDen = 1.0, cSlEvo = 0.0, cSlSpeed = 0.5, cSlTape = 0.8;
    // control-rate caches
    bool cMute[kT] = {}, cSolo[kT] = {}, cAnySolo = false, cPP = true; int cBits[kT] = {}; double cBitsQ[kT] = {}, cRate[kT] = {};
    double cDlyGlide = 0.0, cLpA = 0.0, cDsec = 0.1, cBpm = 120.0; int cDiv = 0; long fxZero = 0;

    Engine() {
        for (int i = 0; i < VDG_PARAM_COUNT; ++i) { target[i] = kVDGParams[i].def; sm[i] = mv[i] = double(kVDGParams[i].def); }
        for (int w = 0; w < kNWire; ++w) wDst[w] = -1;
        for (int i = 0; i < kNSlot; ++i) { slSrc[i] = uint8_t(i); curSt[i] = prevSt[i] = -1; }
        for (int t = 0; t < kT; ++t) { mtSrc[t] = -1.0; rsQ[t] = 0x2545F491u; }
        for (int i = 0; i < 3 * kLPts; ++i) lfoTab[i] = vsin(2.0 * kPi * double(i % kLPts) / kLPts);
        for (int p = 0; p < kP; ++p) { patBars[p] = 1; for (int t = 0; t < kT; ++t) { trkLen[p][t] = kS; trkDiv[p][t] = VDG_DEF_DIV;
            for (int s = 0; s < kS; ++s) { step[p][t][s][1] = 0.8f; step[p][t][s][4] = 1.f; step[p][t][s][8] = 1.f; step[p][t][s][11] = float(kRingOsc); step[p][t][s][14] = 220.f; step[p][t][s][17] = 1.f; step[p][t][s][20] = 1.f; step[p][t][s][21] = -1.f; } } }
    }

    // ---------------------------------------------------------------- setup (never while rendering)
    void prepare(double rate) {
        sr = rate > 0 ? rate : 48000.0;
        static const int kComb[8] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617}, kAp[4] = {556, 441, 341, 225};
        dlyLen = int(std::ceil(sr * 3.05)) + 4;
        size_t total = size_t(2 * dlyLen);
        for (int c = 0; c < 2; ++c) {
            for (int k = 0; k < 8; ++k) { rvCL[c * 8 + k] = std::max(8, int(lr((kComb[k] + c * 23) * sr / 44100.0))); total += size_t(rvCL[c * 8 + k]); }
            for (int k = 0; k < 4; ++k) { rvAL[c * 4 + k] = std::max(8, int(lr((kAp[k] + c * 23) * sr / 44100.0))); total += size_t(rvAL[c * 4 + k]); }
        }
        store.assign(total, 0.0);
        gbLen = long(std::ceil(sr * 2.2)) + 4; gb0.assign(size_t(gbLen), 0.f); gb1.assign(size_t(gbLen), 0.f);
        sbLen = long(std::ceil(sr * 14.0)) + 4; sb0.assign(size_t(sbLen), 0.f); sb1.assign(size_t(sbLen), 0.f);   // Slicer: 2 bars + a slice at 40 BPM
        ringK = 1.0 - vexp(-1.0 / (0.002 * sr)); rEnvK = vexp(-1.0 / (0.02 * sr));
        tbLen = long(std::ceil(sr * 0.02)) + 4; tb0.assign(size_t(tbLen), 0.0); tb1.assign(size_t(tbLen), 0.0); popK = vexp(-1.0 / (0.00025 * sr));
        psWin = int(std::min(long(kPSN - 8), lr(0.03 * sr)));
        psBuf.assign(size_t(kT) * kPSN, 0.0); spIn.assign(size_t(kT) * kSPN, 0.0); spDry.assign(size_t(kT) * kSPN, 0.0); spOut.assign(size_t(kT) * kSPN, 0.0);
        spMag.assign(size_t(kT) * kSPK, 0.0); spPh.assign(size_t(kT) * kSPK, 0.0); (void)fftTables();
        spgLen = lr(0.045 * sr) + 4; spgBuf0.assign(size_t(spgLen), 0.0); spgBuf1.assign(size_t(lr(double(spgLen) * 1.13) + 4), 0.0);
        { static const double fdnMs[8] = {89.7, 113.3, 137.9, 163.1, 191.3, 223.7, 251.9, 283.7}; for (int i = 0; i < 8; ++i) fdnLen[i] = int(lr(fdnMs[i] * 0.001 * sr)); }
        fdnMax = lr(0.2837 * 2.2 * sr) + 64; fdnBuf.assign(size_t(8 * fdnMax), 0.0);
        { static const int n[4] = {142, 107, 379, 277}; for (int i = 0; i < 4; ++i) { xpApL[i] = std::max(8, int(lr(n[i] * sr / 44100.0))); xpAp[i].assign(size_t(xpApL[i]), 0.0); } }
        double *q = store.data();
        for (int c = 0; c < 2; ++c) { dly[c] = q; q += dlyLen; }
        for (int c = 0; c < 2; ++c) { for (int k = 0; k < 8; ++k) { rvC[c * 8 + k] = q; q += rvCL[c * 8 + k]; } for (int k = 0; k < 4; ++k) { rvA[c * 4 + k] = q; q += rvAL[c * 4 + k]; } }
        clearFx();
        for (int i = 0; i < VDG_PARAM_COUNT; ++i) sm[i] = mv[i] = double(target[i]);
        for (auto &w : v) w = Voice();
    }
    void clearFx() {
        std::fill(store.begin(), store.end(), 0.0);
        dlyPos = 0; dlyLp[0] = dlyLp[1] = 0.0; std::memset(rvF, 0, sizeof rvF); std::memset(rvCP, 0, sizeof rvCP); std::memset(rvAP, 0, sizeof rvAP);
        dcX[0] = dcX[1] = dcY[0] = dcY[1] = 0.0; quiet = 0; tmLive = false; for (double &h : hOff) h = 0.0;
        fxZero = long(dlyLen) + 1;
        std::fill(gb0.begin(), gb0.end(), 0.f); std::fill(gb1.begin(), gb1.end(), 0.f); gw = 0; gAbs = 0.0; gMixS = 0.0; gModeNow = -1;
        std::fill(sb0.begin(), sb0.end(), 0.f); std::fill(sb1.begin(), sb1.end(), 0.f); sw = 0; sAbs = 0.0; sMixS = 0.0; sCyc = -1; sIdx = -1; sHold = 0;
        sLastP = -1.0; dclL = dclR = 0.0; dclN = 0;
        rS = 0.0; rOn = false; rEnv = 0.0;
        std::memset(eqZ, 0, sizeof eqZ); std::memset(eqOn, 0, sizeof eqOn);
        for (auto &m : mt) metalReset(m);
        for (auto &q : rs) rsReset(q);
        std::memset(rsOn, 0, sizeof rsOn); std::memset(mtOn, 0, sizeof mtOn); std::memset(mtS, 0, sizeof mtS); cGm = false;
        std::fill(psBuf.begin(), psBuf.end(), 0.0); std::memset(psOn, 0, sizeof psOn); std::memset(spOn, 0, sizeof spOn);
        std::fill(spIn.begin(), spIn.end(), 0.0); std::fill(spDry.begin(), spDry.end(), 0.0); std::fill(spOut.begin(), spOut.end(), 0.0); std::fill(spMag.begin(), spMag.end(), 0.0); std::memset(fxTail, 0, sizeof fxTail);
        rvClear();
        std::fill(tb0.begin(), tb0.end(), 0.0); std::fill(tb1.begin(), tb1.end(), 0.0); tw = 0; popL = popR = hissL = hissR = 0.0;
    }
    void rvClear() {
        for (int j = 0; j < 16; ++j) if (rvC[j]) std::fill(rvC[j], rvC[j] + rvCL[j], 0.0);
        for (int j = 0; j < 8; ++j) if (rvA[j]) std::fill(rvA[j], rvA[j] + rvAL[j], 0.0);
        std::memset(rvF, 0, sizeof rvF); std::memset(rvCP, 0, sizeof rvCP); std::memset(rvAP, 0, sizeof rvAP);
        std::memset(spgAp, 0, sizeof spgAp); spgLp[0] = spgLp[1] = 0.0; std::fill(spgBuf0.begin(), spgBuf0.end(), 0.0); std::fill(spgBuf1.begin(), spgBuf1.end(), 0.0); spgPos = 0;
        gtEnv = 0.0; gtHold = 0; gtG = 0.0;
        std::fill(fdnBuf.begin(), fdnBuf.end(), 0.0); fdnPos = 0; std::memset(fdnLp, 0, sizeof fdnLp); std::memset(fdnPh, 0, sizeof fdnPh); std::memset(xpLast, 0, sizeof xpLast);
        for (auto &b : xpAp) std::fill(b.begin(), b.end(), 0.0);
        std::memset(xpApP, 0, sizeof xpApP);
    }

    // ---------------------------------------------------------------- edits (applied from commands, audio thread)
    void setStep(int p, int t, int s, int on, double vel, double pan, double pitch, int rat) {
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        float *x = step[p][t][s];
        x[1] = float(std::min(std::max(vel, 0.0), 1.0)); x[2] = float(std::min(std::max(pan, -1.0), 1.0));
        x[3] = float(std::min(std::max(pitch, -12.0), 12.0)); x[4] = float(std::min(std::max(rat, 1), 4)); x[0] = on ? 1.f : 0.f;
    }
    void setStepFx(int p, int t, int s, double crush, double d, double r, double prob) {
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        float *x = step[p][t][s];
        x[5] = float(clampd(crush, 0, 1)); x[6] = float(clampd(d, 0, 1)); x[7] = float(clampd(r, 0, 1)); x[8] = float(clampd(prob, 0, 1));
    }
    void setStepFold(int p, int t, int s, double fold) {
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        step[p][t][s][15] = float(clampd(fold, 0.0, 1.0));
    }
    void setStepShift(int p, int t, int s, double st, double mix, double spec, double col, double smix) {   // NEW (0.8)
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        float *x = step[p][t][s];
        x[16] = float(clampd(st, -24.0, 24.0)); x[17] = float(clampd(mix, 0.0, 1.0)); x[18] = float(clampd(spec, 0.0, 1.0)); x[19] = float(clampd(col, 0.0, 1.0)); x[20] = float(clampd(smix, 0.0, 1.0));
    }
    void setStepMetal(int p, int t, int s, double metal, double slice, double revP, double stutP) {   // NEW (0.9)
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        float *x = step[p][t][s];
        x[21] = metal < 0 ? -1.f : float(clampd(metal, 0.0, 1.0)); x[22] = float(std::min(std::max(lr(slice), 0L), 32L));
        x[23] = float(clampd(revP, 0.0, 1.0)); x[24] = float(clampd(stutP, 0.0, 1.0));
    }
    void setLfoPoints(int l, int start, const float *pts, int n) {   // NEW (0.9.1)
        if (l < 0 || l > 2 || !pts) return;
        for (int j = 0; j < n && start + j < kLPts; ++j) if (start + j >= 0) lfoTab[l * kLPts + start + j] = clampd(double(pts[j]), -1.0, 1.0);
    }
    void setPatternSlicer(int p, int v2) { if (p >= 0 && p < kP) patSl[p] = int8_t(v2 == 0 || v2 == 1 ? v2 : -1); }
    void setStepFm(int p, int t, int s, double ratio) {
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        step[p][t][s][9] = ratio > 0 ? float(clampd(ratio, 0.25, 16.0)) : 0.f;
    }
    void setStepRing(int p, int t, int s, int on, int master, int mask, double amt, double hz) {
        if (p < 0 || p >= kP || t < 0 || t >= kT || s < 0 || s >= kS) return;
        float *x = step[p][t][s];
        x[10] = on ? 1.f : 0.f; x[11] = float(std::min(std::max(master, 0), kRingOsc)); x[12] = float(std::min(std::max(mask, 0), (1 << kT) - 1));
        x[13] = float(clampd(amt, 0.0, 1.0)); x[14] = float(clampd(hz, 20.0, 5000.0));
    }
    void setWire(int slot, int src, int dst, double amt) {   // dst: dense parameter index, −1 = empty
        if (slot < 0 || slot >= kNWire) return;
        wSrc[slot] = std::min(std::max(src, 0), kNSrc - 1); wDst[slot] = dst >= 0 && dst < VDG_PARAM_COUNT ? dst : -1; wAmt[slot] = clampd(amt, -1.0, 1.0);
        std::memset(wired, 0, sizeof wired); int n = 0;
        for (int w = 0; w < kNWire; ++w) { const int d = wDst[w]; if (d < 0) continue; if (!wired[d]) { wired[d] = 1; modList[n++] = d; } }
        nMod = n;
    }
    void setSlice(int slot, int a, int src) { if (slot < 0 || slot >= kNSlot) return; slAct[slot] = uint8_t(std::min(std::max(a, 0), 11)); slSrc[slot] = uint8_t(std::min(std::max(src, 0), kNSlot - 1)); }
    void setTracks(int n) { nTr = std::min(std::max(n, 1), kT); for (int t = nTr; t < kT; ++t) v[t].active = false; }
    void setTrack(int p, int t, int len, int div) { if (p < 0 || p >= kP || t < 0 || t >= kT) return; trkLen[p][t] = std::min(std::max(len, 1), kS); trkDiv[p][t] = std::min(std::max(div, 0), kND - 1); }
    void setBars(int p, int bars) { if (p >= 0 && p < kP) patBars[p] = bars >= 4 ? 4 : (bars >= 2 ? 2 : 1); }
    void setChain(const uint8_t *pats, int n, int on) { n = std::min(std::max(n, 0), kC); for (int i = 0; i < n; ++i) chain[i] = std::min(std::max(int(pats[i]), 0), kP - 1); chainN = n; chainOn = on ? 1 : 0; }
    void select(int p) { want = std::min(std::max(p, 0), kP - 1); jumpReq = 1; }
    void play(bool on) { playReq = on ? 1 : 0; }
    void setSample(int t, const vd_sample *s) { if (t < 0 || t >= kT) return; smp[t] = s; if (v[t].model == 8) v[t].active = false; }

    double P(int id) const { return mv[id]; }              // smoothed value + modulation
    int Pi(int id) const { return int(lr(mv[id])); }
    double srcP(int id) const { return wired[id] ? mv[id] : sm[id]; }
    double T(int id) const { return double(target[id]); }
    static int tp(int t, int k) { return VDG_T1 + t * VDG_TRACK_STRIDE + k; }
    double S(int p, int t, int s, int f) const { return double(step[p][t][s][f]); }

    // ---------------------------------------------------------------- MIDI
    bool takes(uint8_t status) const {
        if (!enabledFlag) return false;
        const int t = status & 0xF0, ch = int(lr(T(VDG_DR_CH)));
        return (t == 0x80 || t == 0x90) && (ch == 0 || (status & 0x0F) == ch - 1);
    }
    int trackOf(int note) const { for (int t = 0; t < nTr; ++t) if (kVDGNotes[t] == note) return t; return note >= 36 ? (note - 36) % nTr : -1; }
    void midi(uint8_t st, uint8_t d1, uint8_t d2) {
        if ((st & 0xF0) != 0x90 || d2 == 0) return;
        const int t = trackOf(d1); if (t < 0) return;
        const double vel = d2 / 127.0;
        trigger(t, vel, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, nullptr);
        if (recOn && running) record(t, vel);
    }
    /** NEW (0.9): a pad playing one slice of its track (Break Lab pads); recorded with the slice when REC is on. */
    void hitSlice(int t, int slice, double vel) {
        if (t < 0 || t >= kT) return;
        for (double &x : nx) x = 0.0;
        nx[1] = 1.0; nx[4] = 1.0; nx[5] = -1.0; nx[6] = double(slice);
        trigger(t, vel, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, nx);
        if (recOn && running) record(t, vel, slice);
    }
    void record(int t, double vel, int sl = 0) {
        const double sb = kVDGDivBeats[std::min(std::max(trkDiv[cur][t], 0), kND - 1)];
        const int len = std::min(std::max(trkLen[cur][t], 1), kS);
        const double patLen = 4.0 * std::min(std::max(patBars[cur], 1), 4);
        long k = lr((beat - patStart) / sb);
        if (double(k) * sb >= patLen - 1e-9) k = 0;
        const int s = int(k % len);
        setStep(cur, t, s, 1, double(float(vel)), 0, 0, 1); setStepFx(cur, t, s, 0, 0, 0, 1); setStepFm(cur, t, s, 0);
        setStepMetal(cur, t, s, -1, sl, 0, 0);
        if (double(k) >= nextIdx[t]) skipIdx[t] = double(k);
        if (recSink) recSink->push(cur, t, s, float(vel), sl);
    }

    // ---------------------------------------------------------------- voices
    void trigger(int t, double vel, double stepPan, double stepPitch, double crush, double sdly, double srev, double fmr, double fold, const double *nxs) {
        Voice &w = v[t];
        stepFx(t, nxs);
        const int eng = int(lr(T(tp(t, K_ENGINE))));
        if (eng == 1 && !smp[t]) return;                                        // sample engine with no sample: silent
        const int model = eng == 2 ? 9 : eng == 1 ? 8 : std::min(std::max(int(lr(T(tp(t, 0)))), 0), 7);
        w.active = true; w.model = model; w.t = 0.0; w.choke = 1.0;
        w.vel = clampd(vel, 0.0, 1.0); w.pan = stepPan; w.pitch = stepPitch;
        { const long bits = 16 - lr(clampd(crush, 0.0, 1.0) * 14.0); w.cq = bits < 16 ? vpow(2.0, double(bits - 1)) : 0.0; }
        w.sdly = sdly; w.srev = srev;
        w.spos = 0.0; w.slp = 0.0;
        // NEW (0.9): Metalise source — the step's own amount, else the slice's, else the track's (live)
        double msrc = nxs && nxs[5] >= 0 ? nxs[5] : -1.0;
        if (model == 8) sliceStart(t, w, nxs); else w.sl = -1;
        if (msrc < 0 && w.sl >= 0) { const double mm = smp[t]->slices[size_t(w.sl) * kSLF + 10]; if (mm >= 0) msrc = mm; }
        mtSrc[t] = msrc;
        { const double tg = msrc >= 0 ? msrc : clampd(P(tp(t, K_METAL)), 0.0, 1.0);   // bypassed (not a sample touched) unless it has an amount
          if (tg > 0 || mtS[t] > 0) { mtOn[t] = 1; metalParams(mt[t], mtS[t]); } }
        const bool lng = Pi(tp(t, K_LONG)) == 1; const double dec = clampd(P(tp(t, 2)) * (lng ? 20.0 : 1.0), 0.01, 60.0);   // 0.9.1: LONG = Decay × 20 (to 60 s)
        w.amp = 1.0; w.ampK = model == 8 && dec >= (lng ? 59.0 : 2.95) ? 1.0 : vexp(vlog(0.001) / (dec * sr));
        w.pe = 1.0; w.peK = vexp(-1.0 / ((model == 5 ? 0.06 : 0.035) * sr));
        w.ck = 1.0; w.ckK = vexp(-1.0 / (0.0025 * sr));
        for (double &p : w.ph) p = 0.0;
        w.bph = 0.0;
        w.f1.reset(); w.f2.reset(); w.holdPh = 1.0;
        w.swE = 1.0; w.swK = vexp(-double(kCR) / (clampd(P(tp(t, K_SWTIME)), 0.005, 2.0) * sr));
        w.stepRatio = fmr > 0 ? fmr : 0.0; w.sf = fold > 0 ? fold : 0.0;
        if (model == 9) { w.ie = 1.0; w.ieK = vexp(-1.0 / (clampd(P(tp(t, K_IDEC)), 0.005, 2.0) * sr)); w.m1y = w.m1y2 = 0.0; }
        hits[t] += 1.f;
        { const long g = lr(T(tp(t, K_CHOKE)));
          if (g > 0) for (int u = 0; u < kT; ++u) if (u != t && v[u].active && lr(T(tp(u, K_CHOKE))) == g) v[u].choke = vexp(-1.0 / (0.004 * sr)); }
        voiceCoefs(t);
    }
    void voiceCoefs(int t) {
        Voice &w = v[t];
        const double br = P(tp(t, 14)), bend = br > 0.001 ? P(tp(t, 7)) * vsin(2.0 * kPi * w.bph) : P(tp(t, 7));
        w.ratio = vpow(2.0, (P(tp(t, 1)) + w.pitch + bend + P(tp(t, K_SWEEP)) * w.swE) / 12.0);
        { const double a = (clampd(P(tp(t, 6)) + w.pan, -1.0, 1.0) + 1.0) * kPi * 0.25; w.gl = vcos(a); w.gr = vsin(a); }
        const double tone = P(tp(t, 3));
        switch (w.model) {
            case 1: w.f1.set(900.0 + tone * 6000.0, 0.7, sr); break;
            case 2: case 3: w.f1.set((5500.0 + tone * 5000.0) * std::sqrt(w.ratio), 1.2, sr); w.f2.set(6000.0 + tone * 3000.0, 0.7, sr); break;
            case 4: w.f1.set((900.0 + tone * 1400.0) * std::sqrt(w.ratio), 2.6, sr); break;
            case 6: w.f1.set(3200.0 * w.ratio, 3.0, sr); break;
            case 7: w.f1.set((1800.0 + tone * 2400.0) * std::sqrt(w.ratio), 3.5, sr); break;
            case 9: {
                const double fc = P(tp(t, K_FREQ)) * w.ratio, r1 = w.stepRatio > 0 ? w.stepRatio : P(tp(t, K_RATIO));
                w.fcInc = std::min(fc / sr, 0.49); w.m1Inc = std::min(fc * r1 / sr, 0.49); w.m2Inc = std::min(fc * P(tp(t, K_RATIO2)) / sr, 0.49);
                w.fmI = P(tp(t, K_INDEX)) * (0.25 + 1.5 * tone); w.fmFb = P(tp(t, K_FB)) * kPi;
                w.fmFold = P(tp(t, K_FOLD)); w.fmN = P(tp(t, K_NOISE)); w.fmAlgo = int(lr(T(tp(t, K_ALGO))));
                break; }
            case 8: w.slpA = tone >= 0.999 ? 1.0 : 1.0 - vexp(-2.0 * kPi * std::min(120.0 * vpow(2.0, tone * 7.7), sr * 0.45) / sr); break;
            default: break;
        }
    }
    double noise() { return double(xs(rng)) / 2147483648.0 - 1.0; }
    double sampleAt(const vd_sample *sp, long i) const {   // mono: the average of the sample's channels
        if (sp->channels == 1) return double(sp->data[i]);
        double a = 0.0; for (uint32_t c = 0; c < sp->channels; ++c) a += double(sp->data[size_t(c) * sp->frames + size_t(i)]); return a / sp->channels;
    }
    /** NEW (0.9): starts slice playback — which slice (the step's, else the track's Slice), its gain / pan / pitch, gate,
        reverse (the slice's, flipped by the step's reverse chance), stutter (the slice's, or 2–3 × 1/32 by the step's chance). */
    void sliceStart(int t, Voice &w, const double *nxs) {
        const vd_sample *sp = smp[t]; w.sl = -1;
        if (!sp || !sp->slices || sp->sliceCount < 1) return;
        const long k = nxs && nxs[6] > 0 ? lr(nxs[6]) : lr(T(tp(t, K_SLICE)));
        const int i = int(std::min(std::max(k, 1L), long(sp->sliceCount))) - 1; const double *L = sp->slices + size_t(i) * kSLF;
        w.sl = i; w.s0 = L[0]; w.sLen = std::max(1.0, L[1]); w.pitch += L[2]; w.sG = L[3]; w.pan = clampd(w.pan + L[4], -1.0, 1.0);
        const double rt = sp->rate;
        w.sAtt = std::max(1.0, L[5] * rt); w.sGate = std::max(2.0, std::min(w.sLen, jsRound(w.sLen * clampd(L[6], 0.02, 1.0)))); w.sRel = std::max(1.0, std::min(0.006 * rt, w.sGate * 0.5));
        bool rev = L[7] > 0.5; double sn = jsRound(L[8]), sl = L[9] * rt;
        const double rp = nxs ? nxs[7] : 0.0, stp = nxs ? nxs[8] : 0.0;
        if (rp > 0 && double(xs(brng)) / 4294967296.0 < rp) rev = !rev;
        if (stp > 0 && double(xs(brng)) / 4294967296.0 < stp) { sn = 2 + double(xs(brng) & 1u); sl = 60.0 / std::max(double(tempo), 20.0) / 8.0 * rt; }
        w.sRev = rev; w.stN = int(std::max(0.0, sn)); w.stL = std::max(32.0, std::min(sl, w.sGate)); w.stC = 0; w.spos = 0.0;
    }
    double sliceTick(Voice &w, const vd_sample *sp, double r) {
        double p = w.spos;
        if (w.stN > 0 && p >= w.stL) { p -= w.stL; w.spos = p; w.stC++; if (w.stC >= w.stN) w.stN = 0; }
        if (p >= w.sGate - 1) { w.active = false; w.out = 0.0; return 0.0; }
        const long i = long(p); const double fr = p - double(i);
        const long n = long(sp->frames);
        const long j0 = w.sRev ? long(w.s0 + w.sLen) - 1 - i : long(w.s0) + i, j1 = w.sRev ? j0 - 1 : j0 + 1;
        const double a = sampleAt(sp, std::min(std::max(j0, 0L), n - 1)), b = sampleAt(sp, std::min(std::max(j1, 0L), n - 1));
        double g = w.sG;
        if (p < w.sAtt) g *= p / w.sAtt;
        if (p > w.sGate - w.sRel) g *= (w.sGate - p) / w.sRel;
        if (w.stN > 0) { const double e = std::min(p, w.stL - p) / 48.0; if (e < 1.0) g *= e < 0 ? 0 : e; }   // stutter edges: ~1 ms fades, no clicks
        else if (w.stC > 0 && p < 48.0) g *= p / 48.0;
        w.spos = p + sp->rate / sr * r;
        const double x = (a + (b - a) * fr) * g;
        w.slp += (x - w.slp) * w.slpA;
        return w.slp;
    }
    double voiceTick(int t) {
        Voice &w = v[t];
        const double snap = P(tp(t, 4)), tone = P(tp(t, 3)), r = w.ratio, dt = 1.0 / sr;
        double y = 0.0;
        switch (w.model) {
            case 0: {
                const double f = 46.0 * r * (1.0 + tone * 5.0 * w.pe);
                w.ph[0] += f * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
                y = vsin(2.0 * kPi * w.ph[0]) * w.amp + snap * 0.6 * noise() * w.ck;
                break; }
            case 1: {
                for (int i = 0; i < 2; ++i) { w.ph[i] += (i ? 330.0 : 185.0) * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; }
                const double body = (0.62 * vsin(2.0 * kPi * w.ph[0]) + 0.38 * vsin(2.0 * kPi * w.ph[1])) * w.amp * w.amp;
                w.f1.run(noise());
                y = body * (1.0 - 0.45 * snap) + w.f1.hp * w.amp * (0.25 + snap) * 0.9;
                break; }
            case 2: case 3: {
                double m = 0.0;
                for (int i = 0; i < 6; ++i) { w.ph[i] += kMetal[i] * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; m += w.ph[i] < 0.5 ? 1.0 : -1.0; }
                const double x = m / 6.0 * (1.0 - 0.5 * snap) + noise() * (0.25 + 0.6 * snap);
                w.f1.run(x); w.f2.run(w.f1.bp);
                y = w.f2.hp * w.amp * 1.6;
                break; }
            case 4: {
                w.f1.run(noise());
                double env = 0.0;
                if (w.t < 0.03) { const double ph = std::fmod(w.t, 0.0105); env = vexp(-ph / 0.0028) * (0.7 + 0.3 * snap); }
                if (w.t >= 0.02) env = std::max(env, w.amp * 0.85);
                y = w.f1.bp * env * 2.2;
                break; }
            case 5: {
                const double f = 105.0 * r * (1.0 + tone * 1.6 * w.pe);
                w.ph[0] += f * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
                y = vsin(2.0 * kPi * w.ph[0]) * w.amp + snap * 0.35 * noise() * w.ck;
                break; }
            case 6: {
                w.ph[0] += 1700.0 * r * dt; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
                w.f1.run(noise());
                y = vsin(2.0 * kPi * w.ph[0]) * w.amp * w.amp * (0.4 + 0.6 * tone) + w.f1.bp * w.ck * (0.4 + snap) * 1.5;
                break; }
            case 8: {
                const vd_sample *sp = smp[t];
                if (w.sl >= 0) { y = sliceTick(w, sp, r) * w.amp; break; }   // NEW (0.9): a slice (pitch, gate, reverse, stutter, attack)
                const long n = sp ? long(std::min<double>(sp->frames, std::floor(sp->rate * 60.0))) : 0;
                if (n < 2 || w.spos >= double(n - 1)) { w.active = false; w.out = 0.0; return 0.0; }
                const long i = long(w.spos); const double fr = w.spos - double(i);
                const double a = sampleAt(sp, i), x = a + (sampleAt(sp, i + 1) - a) * fr;
                w.spos += sp->rate / sr * r;
                w.slp += (x - w.slp) * w.slpA;
                y = w.slp * w.amp;
                break; }
            case 9: {   // FM: carrier ph[0], modulator ph[1] (feedback), modulator 2 / ring ph[2]
                w.ph[0] += w.fcInc; if (w.ph[0] >= 1.0) w.ph[0] -= 1.0;
                w.ph[1] += w.m1Inc; if (w.ph[1] >= 1.0) w.ph[1] -= 1.0;
                w.ph[2] += w.m2Inc; if (w.ph[2] >= 1.0) w.ph[2] -= 1.0;
                const double I = w.fmI * w.ie, fb = (w.m1y + w.m1y2) * 0.5 * w.fmFb, m2 = vsin(2.0 * kPi * w.ph[2]);
                double m1, c;
                switch (w.fmAlgo) {
                    case 1: m1 = vsin(2.0 * kPi * w.ph[1] + fb + 0.7 * I * m2); c = vsin(2.0 * kPi * w.ph[0] + I * m1); break;
                    case 2: m1 = vsin(2.0 * kPi * w.ph[1] + fb); c = vsin(2.0 * kPi * w.ph[0] + 0.7 * I * (m1 + m2)); break;
                    case 3: m1 = vsin(2.0 * kPi * w.ph[1] + fb); c = vsin(2.0 * kPi * w.ph[0] + I * m1) * m2; break;
                    default: m1 = vsin(2.0 * kPi * w.ph[1] + fb); c = vsin(2.0 * kPi * w.ph[0] + I * m1); break;
                }
                w.m1y2 = w.m1y; w.m1y = m1; w.ie *= w.ieK;
                if (w.fmFold > 0.0) c = vsin(c * (1.0 + w.fmFold * 7.0) * kPi * 0.5);
                y = c * w.amp + (w.fmN * w.amp * w.amp + snap * 0.5 * w.ck) * noise();
                break; }
            default: {
                for (int i = 0; i < 2; ++i) { w.ph[i] += (i ? 845.0 : 587.0) * r * dt; if (w.ph[i] >= 1.0) w.ph[i] -= 1.0; }
                const double x = (w.ph[0] < 0.5 ? 0.5 : -0.5) + (w.ph[1] < 0.5 ? 0.5 : -0.5) + snap * 0.3 * noise() * w.ck;
                w.f1.run(x);
                y = w.f1.bp * w.amp * 1.4;
                break; }
        }
        w.t += dt; w.amp *= w.ampK; w.pe *= w.peK; w.ck *= w.ckK;
        if (w.choke < 1.0) w.amp *= w.choke;
        if (w.amp < 1e-5 && w.t > 0.04) { w.active = false; w.out = 0.0; return 0.0; }
        const double rate = cRate[t];
        if (rate < std::min(sr * 0.999, 47999.0)) { w.holdPh += rate / sr; if (w.holdPh >= 1.0) { w.holdPh -= 1.0; w.hold = y; } y = w.hold; }
        if (cBits[t] < 16) { const double q = cBitsQ[t]; y = double(lr(clampd(y, -1.0, 1.0) * q)) / q; }
        if (w.cq > 0.0) { const double q = w.cq; y = double(lr(clampd(y, -1.0, 1.0) * q)) / q; }
        if (w.sf > 0.0) { const double f = w.sf; y += (vsin(y * (1.0 + 8.0 * f) * kPi * 0.5) - y) * f; }   // NEW: the step's own wavefolder
        w.out = y;
        return y;
    }

    // ---------------------------------------------------------------- sequencer
    double stepBeats(int t) const { return kVDGDivBeats[std::min(std::max(trkDiv[cur][t], 0), kND - 1)]; }
    double stepTime(int t, double k) const { const double sb = stepBeats(t); return patStart + k * sb + ((long(k) & 1) ? P(VDG_DR_SWING) * sb * 0.5 : 0.0); }
    void resetTracks() { for (int t = 0; t < kT; ++t) { nextIdx[t] = 0; nextBeat[t] = stepTime(t, 0); skipIdx[t] = -1; ratLeft[t] = 0; if (cHum > 0.0 || hOff[t] != 0.0) humSet(t); } }
    /** HUMANISE: the offset (beats) of track t's next step. Triangular, at most 42 % of a step; the first step of a pattern only lags. */
    void humSet(int t) {
        const double h = cHum; if (h <= 0.0) { hOff[t] = 0.0; return; }
        const double mx = std::min(0.18 * vpow(h, 2.2), 0.42 * stepBeats(t));
        const double u1 = double(xs(hrng)), u2 = double(xs(hrng));
        double o = ((u1 + u2) / 4294967296.0 - 1.0) * mx;
        if (nextIdx[t] == 0 && o < 0.0) o = -o;
        hOff[t] = o;
    }
    /** HUMANISE 50–100 %: a quiet ghost on a free step next to a written hit (never written, never recorded); above 75 % some become doubles / triples. */
    void ghost(int t, int s, int len) {
        const double h = cHum, q = (h - 0.5) * 2.0;
        if (len < 2 || double(xs(hrng)) / 4294967296.0 >= q * std::sqrt(q) * 0.3) return;
        const int a = (s + len - 1) % len, b = (s + 1) % len;
        const int n = S(cur, t, a, 0) >= 0.5 ? a : S(cur, t, b, 0) >= 0.5 ? b : -1;
        if (n < 0) return;
        const double vel = S(cur, t, n, 1) * (0.22 + 0.18 * (double(xs(hrng)) / 4294967296.0));
        const double pan = S(cur, t, n, 2), pitch = S(cur, t, n, 3), cr = S(cur, t, n, 5), sd = S(cur, t, n, 6), sv = S(cur, t, n, 7), fr = S(cur, t, n, 9), fo = S(cur, t, n, 15);
        for (int j = 0; j < kNX; ++j) nx[j] = S(cur, t, n, 16 + j);
        trigger(t, vel, pan, pitch, cr, sd, sv, fr, fo, nx);
        if (h > 0.75 && ratLeft[t] == 0 && double(xs(hrng)) / 4294967296.0 < (h - 0.75) * 1.2) {
            const int r = 1 + int(xs(hrng) & 1u);
            ratLeft[t] = r; ratDt[t] = stepBeats(t) / (r + 1); ratNext[t] = beat + ratDt[t]; ratVel[t] = vel; ratPan[t] = pan; ratPitch[t] = pitch;
            ratFx[t][0] = cr; ratFx[t][1] = sd; ratFx[t][2] = sv; ratFm[t] = fr; ratFold[t] = fo; for (int j = 0; j < kNX; ++j) ratNx[t][j] = nx[j];
        }
    }
    int chainIndexOf(int p) const { for (int i = 0; i < chainN; ++i) if (chain[i] == p) return i; return 0; }
    void nextPattern() {
        const int n = chainN;
        if (jumpReq) { jumpReq = 0; cur = std::min(std::max(want, 0), kP - 1); chainPos = chainIndexOf(cur); return; }
        if (chainOn && n > 0) { chainPos = (chainPos + 1) % n; cur = std::min(std::max(chain[chainPos], 0), kP - 1); }
    }
    void fire(int t, double k) {
        const int len = std::min(std::max(trkLen[cur][t], 1), kS);
        const int s = int(long(k) % len);
        if (k == skipIdx[t]) { skipIdx[t] = -1; return; }
        if (S(cur, t, s, 0) < 0.5) { if (cHum > 0.5) ghost(t, s, len); return; }
        const double vel = S(cur, t, s, 1), pan = S(cur, t, s, 2), pitch = S(cur, t, s, 3);
        const int rat = std::min(std::max(int(lr(S(cur, t, s, 4))), 1), 4);
        const double prob = S(cur, t, s, 8);
        if (prob < 0.999 && double(xs(prng)) / 4294967296.0 >= prob) { ratLeft[t] = 0; return; }
        const double cr = S(cur, t, s, 5), sd = S(cur, t, s, 6), sv = S(cur, t, s, 7), fr = S(cur, t, s, 9), fo = S(cur, t, s, 15);
        for (int j = 0; j < kNX; ++j) { nx[j] = S(cur, t, s, 16 + j); ratNx[t][j] = nx[j]; }
        trigger(t, vel, pan, pitch, cr, sd, sv, fr, fo, nx); ratFm[t] = fr; ratFold[t] = fo;
        if (S(cur, t, s, 10) > 0.5) {   // ring step: master × slaves for this step's length
            rOn = true; rMaster = int(lr(S(cur, t, s, 11))); rMask = int(lr(S(cur, t, s, 12)));
            rAmt = S(cur, t, s, 13); rHz = S(cur, t, s, 14); rEnd = beat + stepBeats(t); rPh = 0.0;
        }
        if (rat > 1) { ratLeft[t] = rat - 1; ratDt[t] = stepBeats(t) / rat; ratNext[t] = beat + ratDt[t]; ratVel[t] = vel; ratPan[t] = pan; ratPitch[t] = pitch; ratFx[t][0] = cr; ratFx[t][1] = sd; ratFx[t][2] = sv; }
        else ratLeft[t] = 0;
    }
    void sequence() {
        const int req = playReq; playReq = -1;
        if (req == 1 && !running && !waiting) {
            waiting = true;
            const double fl = std::floor(beat);
            startAt = beat - fl < 0.05 ? fl : fl + 1.0;
            if (chainOn && chainN > 0) { chainPos = 0; cur = std::min(std::max(chain[0], 0), kP - 1); }
            else cur = std::min(std::max(want, 0), kP - 1);
            jumpReq = 0;
        } else if (req == 0) { running = waiting = false; for (int t = 0; t < kT; ++t) ratLeft[t] = 0; }
        if (!running && !waiting) { cur = std::min(std::max(want, 0), kP - 1); return; }
        if (waiting) { if (beat < startAt) return; waiting = false; running = true; patStart = startAt; resetTracks(); }
        double patLen = 4.0 * std::min(std::max(patBars[cur], 1), 4);
        if (beat < patStart - 0.5 || beat > patStart + patLen + 4.0) { patStart = std::floor(beat); resetTracks(); }
        if (beat >= patStart + patLen) { patStart += patLen; nextPattern(); resetTracks(); patLen = 4.0 * std::min(std::max(patBars[cur], 1), 4); }
        for (int t = 0; t < nTr; ++t) {
            int guard = 0;
            while (beat >= nextBeat[t] + hOff[t] && nextBeat[t] < patStart + patLen && guard++ < 8) { fire(t, nextIdx[t]); ++nextIdx[t]; nextBeat[t] = stepTime(t, nextIdx[t]); if (cHum > 0.0 || hOff[t] != 0.0) humSet(t); }
            if (ratLeft[t] > 0 && beat >= ratNext[t]) { trigger(t, ratVel[t] * 0.85, ratPan[t], ratPitch[t], ratFx[t][0], ratFx[t][1], ratFx[t][2], ratFm[t], ratFold[t], ratNx[t]); --ratLeft[t]; ratNext[t] += ratDt[t]; }
        }
    }

    // ---------------------------------------------------------------- control rate
    void control() {
        const double a = 1.0 - vexp(-double(kCR) / (0.01 * sr));
        for (int i = 0; i < VDG_PARAM_COUNT; ++i) { const double t = double(target[i]); if (kVDGParams[i].smooth) sm[i] += (t - sm[i]) * a; else sm[i] = t; }
        modSources();                                        // reads its own parameters (a wired one: last tick's value)
        std::memcpy(mv, sm, sizeof mv);
        if (nMod > 0) applyWires();
        cAnySolo = false;
        for (int t = 0; t < kT; ++t) {
            cMute[t] = Pi(tp(t, 12)) == 1; cSolo[t] = Pi(tp(t, 13)) == 1; cAnySolo = cAnySolo || cSolo[t];
            cBits[t] = Pi(tp(t, 8)); cBitsQ[t] = vpow(2.0, double(cBits[t] - 1)); cRate[t] = P(tp(t, 9));
        }
        cPP = Pi(VDG_DR_DLYPP) == 1; cDiv = std::min(std::max(Pi(VDG_DR_DLYDIV), 0), kND - 1);
        cDsec = clampd(kVDGDivBeats[cDiv] * 60.0 / cBpm, 0.01, 3.0);
        cDlyGlide = 1.0 - vexp(-1.0 / (0.05 * sr));
        cLpA = 1.0 - vexp(-2.0 * kPi * std::min(800.0 * vpow(2.0, P(VDG_DR_DLYTONE) * 4.3), sr * 0.45) / sr);
        for (int t = 0; t < kT; ++t) if (v[t].active) { Voice &w = v[t]; w.bph += P(tp(t, 14)) * double(kCR) / sr; if (w.bph >= 1.0) w.bph -= 1.0; w.swE *= w.swK; voiceCoefs(t); }
        { const double h = P(VDG_DR_HUMAN); cHum = h > 1e-4 ? (h < 1.0 ? h : 1.0) : 0.0; }
        if (tmSr != sr) { tmSr = sr;   // TEMPER coefficients (sample-rate independent)
            tmA = 1.0 - vexp(-1.0 / (0.005 * sr)); tmFa = 1.0 - vexp(-1.0 / (0.0005 * sr)); tmSa = 1.0 - vexp(-1.0 / (0.012 * sr));
            tmR = 1.0 - vexp(-1.0 / (0.08 * sr)); tmLa = 1.0 - vexp(-2.0 * kPi * std::min(5000.0, 0.45 * sr) / sr); }
        glitchControl(); slicerControl(); eqControl(); if (cRevType == 3) expControl();
        metalControl();
    }
    // ---------------------------------------------------------------- NEW (0.9) METALISE: a vintage 16-bit sampler's character
    void metalParams(Metal &m, double a) const {
        m.a = a;
        m.st = vpow(2.0, -2.2 * a) * std::min(1.0, 48000.0 / sr); m.q = vpow(2.0, 15.0 - 9.0 * a); m.zm = clampd((a - 0.2) / 0.5, 0.0, 1.0);
        m.k = 0.65 * a; m.fb = 0.25 + 0.5 * a; m.L1 = int(std::min(255.0, std::max(2.0, jsRound(0.00113 * sr)))); m.L2 = int(std::min(255.0, std::max(3.0, jsRound(0.00171 * sr))));
        m.cv = 0.08 * a; m.cm = 0.45 * a;
    }
    double metalTick(Metal &m, double x) const {
        const double a = m.a, ax = x < 0 ? -x : x;
        m.ef += (ax - m.ef) * 0.02; m.es += (ax - m.es) * 0.0008;
        const double tr = m.ef > 1e-9 ? clampd((m.ef - 1.6 * m.es) / m.ef, 0.0, 1.0) : 0.0;
        const double drive = 1.0 + a * (2.0 + 3.0 * tr * a);
        const double y = x + a * (vtanh(drive * x) / std::sqrt(drive) - x);
        const double e = y - m.k * m.pe; m.pe = y;
        m.ph += m.st;
        if (m.ph >= 1.0) { m.ph -= 1.0; double v2 = jsRound(e * m.q) / m.q; v2 += m.cv * v2 * (v2 < 0 ? -v2 : v2); m.h1 = m.h0; m.h0 = v2; }
        const double lin = m.h1 + (m.h0 - m.h1) * m.ph; double d = lin + (m.h0 - lin) * m.zm;
        d = d + m.k * m.de * 0.98; m.de = d;
        const int p = m.cp; const double r1 = m.c1[(p - m.L1) & 255], r2 = m.c2[(p - m.L2) & 255];
        m.c1[p] = d + m.fb * r1; m.c2[p] = d - m.fb * r2; m.cp = (p + 1) & 255;
        d += m.cm * (r1 - r2) * 0.5;
        const double ad = d < 0 ? -d : d;
        if (ad > 0.9) d = (d < 0 ? -1.0 : 1.0) * (0.9 + 0.1 * vtanh((ad - 0.9) * 10.0));
        return ftz(d);
    }
    static void metalReset(Metal &m) { m.ef = m.es = m.pe = m.de = m.h0 = m.h1 = 0.0; m.ph = 1.0; std::memset(m.c1, 0, sizeof m.c1); std::memset(m.c2, 0, sizeof m.c2); m.cp = 0; }
    // ---------------------------------------------------------------- NEW (0.9) RESAMPLE: the track through a sampler model's converter
    void rsParams(Resamp &q, double a, int mode, double sens, int model) const {
        const double *M = kVDGSModels[std::min(std::max(model, 0), VDG_SMODELS - 1)];   // bits, rate, interp, filter, emphasis, curve, noise
        const double u = std::min(1.0, 2.0 * a); double R = sr * vpow(std::min(M[1] / sr, 1.0), u); if (a > 0.5) R *= vpow(2.0, -(a - 0.5) * 2.0);
        q.a = a; q.mode = mode; q.st = std::min(1.0, R / sr); q.R = R; q.interp = int(M[2]);
        const double bits = 24 + (M[0] - 24) * u - 4.0 * std::max(0.0, 2.0 * a - 1.0); q.bits = bits; q.q = vpow(2.0, bits - 1);
        q.em = M[4] * u; q.cv = M[5] * u; q.nz = M[6] * u; q.sat = 0.35 * a; q.wm = std::min(1.0, 2.0 * a);
        q.thr = 1.2 + 1.6 * (1.0 - sens);
        const double fc = std::min(0.45 * sr, R * M[3]), w0 = 2.0 * kPi * fc / sr, al = vsin(w0) / (2.0 * 0.7071), cw = vcos(w0), a0 = 1.0 + al;
        q.b0 = (1.0 - cw) * 0.5 / a0; q.b1 = (1.0 - cw) / a0; q.b2 = q.b0; q.a1 = -2.0 * cw / a0; q.a2 = (1.0 - al) / a0;
        q.lpA = 1.0 - vexp(-2.0 * kPi * std::min(0.45 * sr, 0.45 * R) / sr);
    }
    double rsTick(Resamp &q, double x, int t) {
        const double ax = x < 0 ? -x : x;
        q.ef += (ax - q.ef) * 0.02; q.es += (ax - q.es) * 0.0008;
        const double tr = q.ef > 1e-9 ? clampd((q.ef - q.thr * q.es) / q.ef, 0.0, 1.0) : 0.0;
        double v2 = q.sat > 0 ? x + q.sat * (vtanh(2.0 * x) * 0.5 - x) : x;
        const double e = v2 - q.em * q.pe; q.pe = v2; v2 = e;
        if (q.interp != 2) { const double y = q.b0 * v2 + q.b1 * q.d0x + q.b2 * q.d1x - q.a1 * q.o1 - q.a2 * q.o2; q.d1x = q.d0x; q.d0x = v2; q.o2 = q.o1; q.o1 = ftz(y); v2 = q.o1; }
        const double st = q.mode == 2 ? q.st * (1.0 - 0.5 * tr) : q.st;
        q.ph += st;
        if (q.ph >= 1.0) {
            q.ph -= 1.0; const double fr = st > 0 ? q.ph / st : 0.0;
            double h = v2 + (q.prev - v2) * clampd(fr, 0.0, 1.0);
            const double qq = q.mode == 2 && tr > 0 ? q.q / vpow(2.0, 3.0 * tr) : q.q;
            h = jsRound(h * qq) / qq; h += q.cv * h * (h < 0 ? -h : h);
            if (q.nz > 0) { const uint32_t z = xs(rsQ[t]); h += q.nz * (double(z) / 4294967296.0 * 2.0 - 1.0); }
            q.h1 = q.h0; q.h0 = h;
        }
        q.prev = v2;
        double y = q.interp == 1 ? q.h1 + (q.h0 - q.h1) * q.ph : q.h0;
        const double la = q.mode == 1 ? q.lpA * (1.0 - 0.7 * tr) : q.lpA;
        q.lp += (y - q.lp) * la; y = q.lp;
        y = y + q.em * q.de * 0.98; q.de = y;
        double wm = q.wm;
        if (q.mode == 0) wm *= 1.0 - tr;
        else if (q.mode == 3) { if (tr > 0.5 && !q.was) q.tm = 0; q.was = tr > 0.5 ? 1 : 0; const double n = 0.008 * sr; if (q.tm < n) { wm *= q.tm / n; q.tm++; } }
        return ftz(x + (y - x) * wm);
    }
    static void rsReset(Resamp &q) { q.ef = q.es = q.ph = q.prev = q.d0x = q.d1x = q.o1 = q.o2 = q.pe = q.de = q.lp = q.h0 = q.h1 = 0.0; q.tm = 1e9; q.was = 0; }
    void metalControl() {
        const double ka = 1.0 - vexp(-double(kCR) / (0.002 * sr));
        for (int t = 0; t < kT; ++t) {
            if (mtOn[t]) {
                const double tg = mtSrc[t] >= 0 ? mtSrc[t] : clampd(P(tp(t, K_METAL)), 0.0, 1.0);
                double a = mtS[t] + (tg - mtS[t]) * ka; if (std::fabs(tg - a) < 1e-5) a = tg; mtS[t] = a;
                if (a == 0.0 && tg == 0.0) { mtOn[t] = 0; metalReset(mt[t]); } else metalParams(mt[t], a);
            } else if (P(tp(t, K_METAL)) > 1e-5 && v[t].active) mtOn[t] = 1;
            const double ra = clampd(P(tp(t, K_RSMP)), 0.0, 1.0);
            if (ra > 1e-5) { rsParams(rs[t], ra, std::min(std::max(Pi(tp(t, K_RSMODE)), 0), 3), clampd(P(tp(t, K_RSSENS)), 0.0, 1.0), Pi(tp(t, K_SMODEL))); rsOn[t] = 1; }
            else if (rsOn[t]) { rsOn[t] = 0; rsReset(rs[t]); }
        }
        const double g = clampd(P(VDG_GL_METAL), 0.0, 1.0);
        if (g > 1e-5) { metalParams(mt[kT], g); metalParams(mt[kT + 1], g); cGm = true; }
        else if (cGm) { cGm = false; metalReset(mt[kT]); metalReset(mt[kT + 1]); }
    }
    // ---- NEW: per-track EQ — RBJ biquads; a band at 0 dB is off and costs nothing
    void eqControl() {
        for (int t = 0; t < kT; ++t) for (int b = 0; b < 4; ++b) {
            const int j = t * 4 + b; const double g = P(tp(t, VDG_K_EQ1G + 2 * b));
            if (g == 0.0) { eqOn[j] = 0; continue; }
            if (!eqOn[j]) { eqZ[j * 2] = eqZ[j * 2 + 1] = 0.0; eqOn[j] = 1; }
            const double f = std::min(P(tp(t, VDG_K_EQ1F + 2 * b)), sr * 0.45), A = vpow(10.0, g / 40.0), w0 = 2.0 * kPi * f / sr, cs = vcos(w0), sn = vsin(w0);
            double b0, b1, b2, a0, a1, a2;
            if (b == 0 || b == 3) {   // shelves, slope 1
                const double al = sn / 2.0 * std::sqrt(2.0), sA = 2.0 * std::sqrt(A) * al, s = b == 0 ? 1.0 : -1.0;
                b0 = A * ((A + 1.0) - s * (A - 1.0) * cs + sA); b1 = s * 2.0 * A * ((A - 1.0) - s * (A + 1.0) * cs); b2 = A * ((A + 1.0) - s * (A - 1.0) * cs - sA);
                a0 = (A + 1.0) + s * (A - 1.0) * cs + sA; a1 = -s * 2.0 * ((A - 1.0) + s * (A + 1.0) * cs); a2 = (A + 1.0) + s * (A - 1.0) * cs - sA;
            } else {   // peaks, Q 1
                const double al = sn / 2.0;
                b0 = 1.0 + al * A; b1 = -2.0 * cs; b2 = 1.0 - al * A; a0 = 1.0 + al / A; a1 = -2.0 * cs; a2 = 1.0 - al / A;
            }
            double *c = eqC + j * 5; c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
        }
    }
    double eq(int t, double x) {
        for (int b = 0; b < 4; ++b) {
            const int j = t * 4 + b; if (!eqOn[j]) continue;
            const double *c = eqC + j * 5; double *z = eqZ + j * 2;
            const double y = c[0] * x + z[0]; z[0] = ftz(c[1] * x - c[3] * y + z[1]); z[1] = ftz(c[2] * x - c[4] * y); x = y;
        }
        return x;
    }
    // ---- NEW: tape wow and flutter (a modulated short delay) and vinyl dust (crackle + hiss), on the master
    void tape(double *o) {
        const double wow = P(VDG_TP_WOW), fl = P(VDG_TP_FLUTTER), dust = P(VDG_TP_DUST); const long N = tbLen;
        const long w0 = tw; tb0[size_t(w0)] = o[0]; tb1[size_t(w0)] = o[1]; tw = w0 + 1 == N ? 0 : w0 + 1;
        if (wow > 1e-7 || fl > 1e-7) {
            wowPh += 0.55 / sr; if (wowPh >= 1.0) wowPh -= 1.0;
            flPh += 6.8 / sr; if (flPh >= 1.0) flPh -= 1.0;
            fl2Ph += 11.3 / sr; if (fl2Ph >= 1.0) fl2Ph -= 1.0;
            wD = clampd(wD * 0.99995 + (double(xs(tprng)) / 4294967296.0 - 0.5) * 0.0006, -0.5, 0.5);   // slow drift: no two wows alike
            const double wv = clampd(vsin(2.0 * kPi * wowPh) * 0.7 + wD, -1.0, 1.0), fv = vsin(2.0 * kPi * flPh) * 0.7 + vsin(2.0 * kPi * fl2Ph) * 0.3;
            const double D = wow * 0.004 * sr * (1.0 + wv) + fl * 0.0006 * sr * (1.0 + fv);   // samples behind, ≥ 0 (0 = straight through)
            double rp = double(w0) - D; if (rp < 0) rp += double(N);
            const long i0 = long(std::floor(rp)); const double fr = rp - double(i0); const long i1 = i0 + 1 == N ? 0 : i0 + 1;
            o[0] = tb0[size_t(i0)] + (tb0[size_t(i1)] - tb0[size_t(i0)]) * fr; o[1] = tb1[size_t(i0)] + (tb1[size_t(i1)] - tb1[size_t(i0)]) * fr;
        }
        if (dust > 1e-6) {
            if (double(xs(tprng)) / 4294967296.0 < dust * dust * 180.0 / sr) {   // a crackle: up to ~180 a second
                const double a = (double(xs(tprng)) / 2147483648.0 - 1.0) * dust * 0.45;
                popL += a * (0.55 + 0.45 * (double(xs(tprng)) / 4294967296.0)); popR += a * (0.55 + 0.45 * (double(xs(tprng)) / 4294967296.0));
            }
            popL = ftz(popL * popK); popR = ftz(popR * popK);
            const double hl = (double(xs(tprng)) / 2147483648.0 - 1.0) * dust * 0.012, hr = (double(xs(tprng)) / 2147483648.0 - 1.0) * dust * 0.012;
            hissL += (hl - hissL) * 0.35; hissR += (hr - hissR) * 0.35;   // warm hiss
            o[0] += popL + hissL; o[1] += popR + hissR;
        }
    }
    // ---- NEW: modulation sources — LFO 1–3, envelope follower, chaos (control rate)
    void modSources() {
        for (int i = 0; i < 3; ++i) {
            const int *L = kLF[i], shape = int(lr(srcP(L[1])));
            double ph = lfoPh[i]; bool wrapped = false;
            if (int(lr(srcP(L[4]))) == 1) { const double per = kLDiv[std::min(std::max(int(lr(srcP(L[5]))), 0), 6)], np = std::fmod(beat / per, 1.0); const double q = np < 0 ? np + 1 : np; wrapped = q < ph; ph = q; }
            else { ph += srcP(L[0]) * double(kCR) / sr; if (ph >= 1.0) { ph -= std::floor(ph); wrapped = true; } }
            lfoPh[i] = ph;
            if (wrapped || lfoHold[i] == 0.0) lfoHold[i] = double(xs(lrng)) / 2147483648.0 - 1.0;
            double val;
            if (shape == 5) { const double x = ph * kLPts; const int j = std::min(int(std::floor(x)), kLPts - 1); const double fr = x - j; const double *T = lfoTab + i * kLPts; val = T[j] + (T[(j + 1) % kLPts] - T[j]) * fr; }   // 0.9.1: drawn
            else val = shape == 0 ? vsin(2.0 * kPi * ph) : shape == 1 ? 1.0 - 4.0 * std::fabs(ph - 0.5) : shape == 2 ? 2.0 * ph - 1.0 : shape == 3 ? (ph < 0.5 ? 1.0 : -1.0) : lfoHold[i];
            lfoV[i] = val; srcV[i] = val;
        }
        {   // envelope follower: the peak since the last tick → attack / release
            const double pk = envPk; envPk = 0.0;
            const double k = pk > envV ? 1.0 - vexp(-double(kCR) / (clampd(srcP(VDG_ENV_ATT), 0.0005, 0.2) * sr)) : 1.0 - vexp(-double(kCR) / (clampd(srcP(VDG_ENV_REL), 0.01, 2.0) * sr));
            envV = ftz(envV + (pk - envV) * k);
            srcV[3] = clampd(envV * srcP(VDG_ENV_GAIN), 0.0, 1.0);
        }
        {   // chaos
            const int mode = int(lr(srcP(VDG_CH_MODE))); const double rate = clampd(srcP(VDG_CH_RATE), 0.02, 20.0), dt = rate * double(kCR) / sr;
            if (mode == 0) {   // Lorenz attractor, two Euler steps per tick
                for (int s = 0; s < 2; ++s) { const double h = dt * 0.5, x = chX, y = chY, z = chZ;
                    chX = x + h * 10.0 * (y - x); chY = y + h * (x * (28.0 - z) - y); chZ = z + h * (x * y - 8.0 / 3.0 * z); }
                chOut = clampd(chX / 20.0, -1.0, 1.0);
            } else if (mode == 1) {   // logistic map at the rate: chaotic steps
                chPh += dt; if (chPh >= 1.0) { chPh -= std::floor(chPh); chL = 3.99 * chL * (1.0 - chL); if (chL <= 0.0 || chL >= 1.0) chL = 0.5; }
                chOut = 2.0 * chL - 1.0;
            } else {   // drift: a bounded random walk
                chOut += (double(xs(chrng)) / 4294967296.0 - 0.5) * dt * 4.0;
                if (chOut > 1.0) chOut = 2.0 - chOut; else if (chOut < -1.0) chOut = -2.0 - chOut;
            }
            srcV[4] = chOut;
        }
    }
    void applyWires() {
        for (int n = 0; n < nMod; ++n) modOff[modList[n]] = 0.0;
        for (int w = 0; w < kNWire; ++w) { const int d = wDst[w]; if (d >= 0) modOff[d] += wAmt[w] * srcV[wSrc[w]]; }
        for (int n = 0; n < nMod; ++n) { const int d = modList[n]; const double x = denormP(d, normP(d, sm[d]) + modOff[d]); mv[d] = kVDGParams[d].smooth ? x : jsRound(x); }
    }
    void slicerControl() {
        cTape = P(VDG_TP_WOW) > 1e-7 || P(VDG_TP_FLUTTER) > 1e-7 || P(VDG_TP_DUST) > 1e-6;
        cRevType = std::min(std::max(Pi(VDG_DR_REVTYPE), 0), 3); cInDrums = Pi(VDG_IN_DRUMS) == 1;
        { const int ps = patSl[cur]; cSlOn = ps >= 0 ? ps == 1 : Pi(VDG_SL_ON) == 1; } cSlMix = clampd(P(VDG_SL_MIX), 0.0, 1.0);   // 0.9: a pattern can override SLICER
        cSlDiv = std::min(std::max(Pi(VDG_SL_DIV), 0), 3); cSlBars = std::min(std::max(Pi(VDG_SL_BARS), 0), 1);
        cSlDen = clampd(P(VDG_SL_DENSITY), 0.0, 1.0); cSlEvo = clampd(P(VDG_SL_EVOLVE), 0.0, 1.0); cSlSeed = Pi(VDG_SL_SEED);
        cSlSpeed = clampd(P(VDG_SL_SPEED), 0.25, 2.0); cSlStut = std::min(std::max(Pi(VDG_SL_STUTTER), 0), 4);
        cSlTape = clampd(P(VDG_SL_TAPE), 0.1, 1.0); cSlPitch = Pi(VDG_SL_PITCH); cSlHold = std::min(std::max(Pi(VDG_SL_HOLD), 0), 6);
    }
    void glitchControl() {   // LFO n → its own glitch target (Mix / Size / Speed); wires go through applyWires
        double mod[3] = {0.0, 0.0, 0.0};
        cGlOn = Pi(VDG_GL_ON) == 1;   // (0.9.1: the switch can be wired — an LFO turns it on above the middle)
        {   // NEW (0.9.1): while ON, Metalise plays each division with this chance
            const double ch = clampd(P(VDG_GL_CHANCE), 0.0, 1.0);
            if (ch > 0.0 && cGlOn) { static constexpr double kChB[4] = {0.25, 0.5, 1.0, 4.0}; const double per = kChB[std::min(std::max(Pi(VDG_GL_CHDIV), 0), 3)], k = std::floor(beat / per);
                if (k != glChK) { glChK = k; glChOn = ch >= 1.0 || double(xs(glrng)) / 4294967296.0 < ch; }
                if (!glChOn) cGlOn = false; }
            else glChK = -1e9;
        }
        for (int i = 0; i < 3; ++i) { const int *L = kLF[i], dest = std::min(std::max(Pi(L[3]), 0), 2); mod[dest] += P(L[2]) * lfoV[i]; }
        cGlMode = std::min(std::max(Pi(VDG_GL_MODE), 0), 2);
        cGlMix = clampd(P(VDG_GL_MIX) + mod[0], 0.0, 1.0);
        cGlSize = clampd(P(VDG_GL_SIZE) + mod[1], 0.0, 1.0);
        cGlSpeed = clampd(P(VDG_GL_SPEED) + mod[2], 0.0, 1.0);
    }

    // ---------------------------------------------------------------- telemetry
    void publish(bool live) {
        tel[0] = running ? 1.f : (waiting ? 0.5f : 0.f); tel[1] = float(cur); tel[2] = float(chainPos); tel[3] = float(clampd(outEnv * 3.0, 0.0, 1.0));
        for (int t = 0; t < kT; ++t) {
            const int len = std::min(std::max(trkLen[cur][t], 1), kS);
            tel[4 + t] = live && running && nextIdx[t] > 0 ? float(long(nextIdx[t] - 1) % len) : -1.f;
            tel[4 + kT + t] = hits[t];
            tel[4 + 2 * kT + t] = v[t].active ? float(clampd(v[t].amp * v[t].vel, 0.0, 1.0)) : 0.f;
        }
        for (int i = 0; i < 3; ++i) tel[4 + 3 * kT + i] = cGlOn ? float(lfoV[i]) : 0.f;
        for (int i = 0; i < kNSrc; ++i) tel[4 + 3 * kT + 3 + i] = float(srcV[i]);
        tel[4 + 3 * kT + 3 + kNSrc] = cSlOn ? float(sIdx) : -1.f; tel[4 + 3 * kT + 4 + kNSrc] = cSlOn ? float(sAct) : 0.f;
        const int mb = 4 + 3 * kT + 5 + kNSrc;   // modulated dials: where each one is now (0…1 of its travel)
        for (int n = 0; n < kNWire; ++n) { const int d = n < nMod ? modList[n] : -1; tel[mb + 2 * n] = float(d); tel[mb + 2 * n + 1] = d >= 0 ? float(clampd(normP(d, mv[d]), 0.0, 1.0)) : 0.f; }
    }

    // ---------------------------------------------------------------- render (adds into L / R)
    void render(float *L, float *R, uint32_t frames, const float *inLp = nullptr, const float *inRp = nullptr) {   // in: the insert input (AUv3 effect), or none
        const bool en = enabledFlag != 0;
        if (en != wasEnabled) { if (!en) { for (auto &w : v) w.active = false; running = waiting = false; clearFx(); publish(false); } wasEnabled = en; }
        if (!en) return;
        if (beatSerial != beatSeen) { beatSeen = beatSerial; const double d = hostBeat - beat; if (std::fabs(d) > 0.25) beat += d; else beat += d * 0.1; }
        const double bpm = clampd(double(tempo), 20.0, 400.0), dB = bpm / 60.0 / sr;
        envT = int(lr(P(VDG_ENV_SRC))) - 1;   // −1 = master
        cBpm = bpm; cDsec = clampd(kVDGDivBeats[cDiv] * 60.0 / bpm, 0.01, 3.0);
        double o[2];
        for (uint32_t f = 0; f < frames; ++f) {
            if (crCount == 0) control();
            crCount = (crCount + 1) % kCR;
            sequence();
            beat += dB;
            bool any = false; for (const auto &w : v) if (w.active) { any = true; break; }
            if (!any) for (int t = 0; t < kT; ++t) if (fxTail[t] > 0) { any = true; break; }
            if (!any && !inLp && rvType != 3 && !cGlOn && gMixS == 0.0 && !cSlOn && sMixS == 0.0 && !cTape && quiet > long(dlyT) + long(sr * 0.5)) continue;
            const bool solo = cAnySolo;
            double l = 0.0, r = 0.0, sl = 0.0, sr2 = 0.0, rl = 0.0, rr = 0.0;
            for (int t = 0; t < kT; ++t) {
                const bool va = v[t].active;
                if (!va && fxTail[t] <= 0) { act[t] = 0; yv[t] = 0.0; continue; }
                double y = va ? voiceTick(t) : 0.0;
                if (mtOn[t]) y = metalTick(mt[t], y);   // NEW (0.9): METALISE, then RESAMPLE
                if (rsOn[t]) y = rsTick(rs[t], y, t);
                if (psOn[t]) y = pshift(t, y);
                if (spOn[t]) y = spectral(t, y);
                if (va) fxTail[t] = (psOn[t] ? psWin + 16 : 0) + (spOn[t] ? 2 * kSPN : 0) + (mtOn[t] || rsOn[t] ? 1024 : 0);
                else { fxTail[t]--; if (spOn[t] && spTail[t] > fxTail[t]) { fxTail[t] = spTail[t]; spTail[t] = 0; } }
                act[t] = 1; yv[t] = eq(t, y);
            }
            if (rOn || rS != 0.0) ring();
            for (int t = 0; t < kT; ++t) {
                if (!act[t]) continue;
                double y = yv[t];
                if (cMute[t] || (solo && !cSolo[t])) continue;
                y *= P(tp(t, 5)) * v[t].vel * v[t].vel;
                if (t == envT) { const double ay = std::fabs(y); if (ay > envPk) envPk = ay; }
                const double yl = y * v[t].gl, yr = y * v[t].gr;
                l += yl; r += yr;
                const double ds = std::min(1.0, P(tp(t, 10)) + v[t].sdly), rs = std::min(1.0, P(tp(t, 11)) + v[t].srev);
                sl += yl * ds; sr2 += yr * ds; rl += yl * rs; rr += yr * rs;
            }
            if (!cInDrums) { l = r = sl = sr2 = rl = rr = 0.0; }
            if (inLp) {   // the insert input joins the mix here: through the sends, then glitch, Slicer, tape
                const double xl = double(inLp[f]), xr = inRp ? double(inRp[f]) : xl, g = P(VDG_IN_LEVEL), dg = g * P(VDG_IN_DLY), rg = g * P(VDG_IN_REV);
                l += xl * g; r += xr * g; sl += xl * dg; sr2 += xr * dg; rl += xl * rg; rr += xr * rg;
            }
            if (fxZero > long(dlyLen) && rvType != 3 && sl == 0.0 && sr2 == 0.0 && rl == 0.0 && rr == 0.0) { dlyT += (cDsec * sr - dlyT) * cDlyGlide; if (dlyT < 1.0) dlyT = cDsec * sr; }
            else { o[0] = l; o[1] = r; fx(o, sl, sr2, rl, rr); l = o[0]; r = o[1]; }
            { gb0[size_t(gw)] = float(l); gb1[size_t(gw)] = float(r); gw = gw + 1 == gbLen ? 0 : gw + 1; gAbs += 1.0; }
            if (cGlOn || gMixS != 0.0) { o[0] = l; o[1] = r; glitch(o, bpm); l = o[0]; r = o[1]; }
            { sb0[size_t(sw)] = float(l); sb1[size_t(sw)] = float(r); sw = sw + 1 == sbLen ? 0 : sw + 1; sAbs += 1.0; }
            if (cSlOn || sMixS != 0.0) { o[0] = l; o[1] = r; slicer(o, bpm); l = o[0]; r = o[1]; }
            if (cTape) { o[0] = l; o[1] = r; tape(o); l = o[0]; r = o[1]; }
            if (envT < 0) { const double ay = std::max(std::fabs(l), std::fabs(r)); if (ay > envPk) envPk = ay; }
            { const double p = P(VDG_DR_TEMPER), tg = p > 1e-4 || p < -1e-4 ? p : 0.0;   // TEMPER: 0 = bypassed (not a sample touched)
              double tm = tmS;
              if (tm != tg) { tm += (tg - tm) * tmA; if (std::fabs(tg - tm) < 1e-5) tm = tg; tmS = tm; }
              if (tm != 0.0) { if (!tmLive) { tmLive = true; tmLp[0] = l; tmLp[1] = r; tmF = tmSl = std::max(std::fabs(l), std::fabs(r)); }
                  temper(o, l, r, tm); l = o[0]; r = o[1]; }
              else tmLive = false; }
            const double lv = P(VDG_DR_LEVEL);
            for (int c = 0; c < 2; ++c) {
                double x = c == 0 ? l : r;
                x *= lv;
                const double y = ftz(x - dcX[c] + 0.9995 * dcY[c]); dcX[c] = x; dcY[c] = y;
                const double av = std::fabs(y);
                o[c] = av <= 0.8 ? y : (y < 0 ? -1.0 : 1.0) * (0.8 + 0.2 * vtanh((av - 0.8) / 0.2));
            }
            const double e = std::max(std::fabs(o[0]), std::fabs(o[1]));
            outEnv = e > outEnv ? e : outEnv * 0.9997;
            if (e < 1e-5) ++quiet; else quiet = 0;
            L[f] = float(L[f] + float(o[0])); R[f] = float(R[f] + float(o[1]));
        }
        publish(true);
    }

    /** TEMPER (t −1 warm … +1 cold) — see web/src/engine.js temper(). */
    void temper(double *o, double l, double r, double t) {
        const double a = t < 0.0 ? -t : t, m = std::max(std::fabs(l), std::fabs(r));
        tmF += (m - tmF) * (m > tmF ? tmFa : tmR);
        tmSl += (m - tmSl) * (m > tmSl ? tmSa : tmR);
        double tr = tmF / (tmSl + 1e-4) - 1.0; tr = tr < 0.0 ? 0.0 : tr > 2.0 ? 2.0 : tr;
        const double g = 1.0 + (t > 0.0 ? 0.35 : -0.3) * a * a * tr;
        for (int c = 0; c < 2; ++c) {
            double x = (c == 0 ? l : r) * g;
            const double lp = tmLp[c] = ftz(tmLp[c] + (x - tmLp[c]) * tmLa), h = x - lp;
            if (t < 0.0) {
                x -= a * 0.4 * h;
                const double d = 1.0 + 2.5 * a, b = 0.12 * a; x += a * ((vtanh(d * x + b) - vtanh(b)) / std::sqrt(d) - x);
            } else {
                x += a * 0.6 * h;
                const double ax = x < 0.0 ? -x : x; if (ax > 0.85) { const double e = ax - 0.85, y = 0.85 + e / (1.0 + 2.0 * a * e); x = x < 0.0 ? -y : y; }
                if (a > 0.75) x += (a - 0.75) * 3.6 * h * (h < 0.0 ? -h : h);
            }
            o[c] = x;
        }
    }

    // ---------------------------------------------------------------- NEW (0.8): per-step pitch shift and spectral
    void stepFx(int t, const double *n) {
        const bool ps = n && n[0] != 0.0 && n[1] > 0.0, sp = n && n[2] > 0.0 && n[4] > 0.0;
        if (ps) { if (!psOn[t]) { std::fill(psBuf.begin() + long(t) * kPSN, psBuf.begin() + long(t + 1) * kPSN, 0.0); psPh[t] = 0.0; } psOn[t] = 1; psSt[t] = vpow(2.0, n[0] / 12.0); psMix[t] = n[1]; }
        else psOn[t] = 0;
        if (sp) {
            if (!spOn[t]) { const long b = long(t) * kSPN; std::fill(spIn.begin() + b, spIn.begin() + b + kSPN, 0.0); std::fill(spDry.begin() + b, spDry.begin() + b + kSPN, 0.0); std::fill(spOut.begin() + b, spOut.begin() + b + kSPN, 0.0);
                std::fill(spMag.begin() + long(t) * kSPK, spMag.begin() + long(t + 1) * kSPK, 0.0); spCnt[t] = 0; }
            spOn[t] = 1; spA[t] = n[2]; spC[t] = n[3]; spMix[t] = n[4]; spFirst[t] = 6;
        } else spOn[t] = 0;
        if (!ps && !sp) fxTail[t] = 0;
    }
    double psRead(long b, int w, double d) const { double rp = double(w - 1) - d; if (rp < 0) rp += kPSN; const double fl = std::floor(rp); const int i0 = int(fl); const double fr = rp - fl; const int i1 = (i0 + 1) & (kPSN - 1); return psBuf[size_t(b + i0)] + (psBuf[size_t(b + i1)] - psBuf[size_t(b + i0)]) * fr; }
    double pshift(int t, double x) {   // two taps sweeping through a 30 ms window, crossfaded with sin²
        const long b = long(t) * kPSN; const double W = psWin; int w = psW[t];
        psBuf[size_t(b + w)] = x; w = (w + 1) & (kPSN - 1); psW[t] = w;
        double ph = psPh[t] + (1.0 - psSt[t]) / W; ph -= std::floor(ph); psPh[t] = ph;
        const double p2 = ph >= 0.5 ? ph - 0.5 : ph + 0.5;
        const double s1 = vsin(kPi * ph), s2 = vsin(kPi * p2);
        const double wet = s1 * s1 * psRead(b, w, ph * W) + s2 * s2 * psRead(b, w, p2 * W);
        return x + (wet - x) * psMix[t];
    }
    double spectral(int t, double x) {   // STFT 256 / hop 64 (Hann); dry and wet both delayed 256 samples
        const long b = long(t) * kSPN; int pos = spPos[t];
        spIn[size_t(b + pos)] = x; const double dry = spDry[size_t(b + pos)]; spDry[size_t(b + pos)] = x;
        const double out = spOut[size_t(b + pos)]; spOut[size_t(b + pos)] = 0.0;
        pos = pos + 1 == kSPN ? 0 : pos + 1; spPos[t] = pos;
        if (++spCnt[t] >= kSPH) { spCnt[t] = 0; spFrame(t, pos); }
        return dry + (out - dry) * spMix[t];
    }
    void spFrame(int t, int pos) {   // SMEAR · SHIFT · HARMONIC · ROBOT · WHISPER · FREEZE (see web/src/engine.js)
        double *re = spRe, *im = spIm, *m = spM; const long b = long(t) * kSPN, mb = long(t) * kSPK; const double a = spA[t], c = spC[t];
        const FFTTables &T = fftTables(); double *M = spMag.data() + mb, *P2 = spPh.data() + mb;
        for (int i = 0; i < kSPN; ++i) { const int j = pos + i < kSPN ? pos + i : pos + i - kSPN; re[i] = spIn[size_t(b + j)] * T.win[i]; im[i] = 0.0; }
        fft(re, im, false);
        const int z = std::min(5, int(std::floor(c * 6.0))); const double f = c * 6.0 - z;
        double mx = 0.0, en = 0.0;
        for (int k = 0; k < kSPK; ++k) { m[k] = std::sqrt(re[k] * re[k] + im[k] * im[k]); if (m[k] > mx) mx = m[k]; en += m[k] * m[k]; }
        if (z == 0) {   // SMEAR
            const double keep = 0.97 * a; double *Tt = spT;
            for (int k = 0; k < kSPK; ++k) { M[k] = ftz(M[k] + (m[k] - M[k]) * (1.0 - keep)); Tt[k] = M[k]; }
            const int wd = int(jsRound(f * 6.0 * a));
            for (int k = 0; k < kSPK; ++k) {
                double sum = 0.0; int n = 0; for (int q = k - wd; q <= k + wd; ++q) if (q >= 0 && q < kSPK) { sum += Tt[q]; ++n; }
                const double g = (sum / n) / (m[k] + 1e-12); re[k] *= g; im[k] *= g;
            }
        } else if (z == 1) {   // SHIFT
            const int sh = int(jsRound((f * 2.0 - 1.0) * a * 40.0)); double *Tt = spT, *U = m;
            for (int k = 0; k < kSPK; ++k) { Tt[k] = re[k]; U[k] = im[k]; }
            for (int k = 0; k < kSPK; ++k) { const int q = k - sh; if (q >= 0 && q < kSPK) { re[k] = Tt[q]; im[k] = U[q]; } else { re[k] = 0.0; im[k] = 0.0; } }
        } else if (z == 2) {   // HARMONIC
            const double F = 1.5 + f * 14.0, ex = 1.0 + a * 8.0;
            for (int k = 0; k < kSPK; ++k) { const double g = (1.0 - a) + a * vpow(std::fabs(vcos(kPi * k / F)), ex); re[k] *= g; im[k] *= g; }
        } else if (z == 3) {   // ROBOT
            const double ex = (f - 0.5) * 3.0 * a;
            for (int k = 0; k < kSPK; ++k) { const double g = vpow(double(k + 1) / kSPK, ex); re[k] = (re[k] * (1.0 - a) + m[k] * a) * g; im[k] = im[k] * (1.0 - a) * g; }
        } else if (z == 4) {   // WHISPER
            const double thr = f * f * a * 0.25 * mx;
            for (int k = 0; k < kSPK; ++k) {
                if (m[k] < thr) { re[k] = 0.0; im[k] = 0.0; continue; }
                const double th = a * kPi * (double(xs(sprng)) / 2147483648.0 - 1.0), cs = vcos(th), sn = vsin(th), r0 = re[k];
                re[k] = r0 * cs - im[k] * sn; im[k] = r0 * sn + im[k] * cs;
            }
        } else {   // FREEZE
            double me = 0.0; for (int k = 0; k < kSPK; ++k) me += M[k] * M[k];
            if (spFirst[t] > 0 && en > me) for (int k = 0; k < kSPK; ++k) { M[k] = m[k]; P2[k] = vatan2(im[k], re[k]); }
            else { const double dec = vexp(-double(kSPH) / (sr * (0.15 + f * 6.0)));
                for (int k = 0; k < kSPK; ++k) { M[k] = ftz(M[k] * dec); P2[k] += 2.0 * kPi * k * kSPH / kSPN; if (P2[k] > 1e6) P2[k] -= 2.0 * kPi * std::floor(P2[k] / (2.0 * kPi)); } }
            for (int k = 0; k < kSPK; ++k) { const double ph = P2[k]; re[k] = re[k] * (1.0 - a) + M[k] * vcos(ph) * a; im[k] = im[k] * (1.0 - a) + M[k] * vsin(ph) * a; }
        }
        if (spFirst[t] > 0) spFirst[t]--;
        im[0] = 0.0; im[kSPN / 2] = 0.0;
        double oe = 0.0;
        for (int k = 1; k < kSPN / 2; ++k) { re[kSPN - k] = re[k]; im[kSPN - k] = -im[k]; }
        for (int k = 0; k < kSPK; ++k) oe += re[k] * re[k] + im[k] * im[k];
        fft(re, im, true);
        const double g = 1.0 / (kSPN * 1.5);
        for (int i = 0; i < kSPN; ++i) { const int j = pos + i < kSPN ? pos + i : pos + i - kSPN; spOut[size_t(b + j)] += re[i] * T.win[i] * g; }
        spTail[t] = oe > 1e-12 ? 3 * kSPN : 0;
    }

    // ---------------------------------------------------------------- glitch
    double gRead(int c, double pos) const {
        const std::vector<float> &b = c ? gb1 : gb0; const long N = gbLen;
        const double fl = std::floor(pos); const double fr = pos - fl;
        long a = long(std::fmod(fl, double(N))); if (a < 0) a += N; const long n = a + 1 == N ? 0 : a + 1;
        return double(b[size_t(a)]) + (double(b[size_t(n)]) - double(b[size_t(a)])) * fr;
    }
    void glitch(double *o, double bpm) {
        const double N = double(gbLen); const int mode = cGlMode;
        gMixS += ((cGlOn ? cGlMix : 0.0) - gMixS) * 0.002;
        if (!cGlOn && gMixS < 1e-5) { gMixS = 0.0; gModeNow = -1; return; }
        if (mode != gModeNow) { gModeNow = mode; gCap = -1; gi = 0; gG = 0; gSrc = gAbs - 2.0 * jsRound(sr * 0.01); }
        const double beatLen = 60.0 / bpm * sr;
        double wl, wr;
        if (mode == 2) {   // Metal stretch: cyclic time-stretch
            if (gi >= gG) {
                const long G = std::max(32L, long(jsRound(sr * 0.003 * vpow(20.0, cGlSize))));
                gSrc += (0.25 + 0.75 * cGlSpeed) * double(gG); gG = G; gi = 0;
                const double lag = gAbs - gSrc;
                if (lag < double(G) + 1.0 || lag > std::min(beatLen, N * 0.45)) gSrc = gAbs - 2.0 * double(G);
            }
            const long g = gi++, G = gG; const double fe = std::min(1.0, std::min(double(g) / 24.0, double(G - g) / 24.0));
            wl = jsRound(gRead(0, gSrc + double(g)) * fe * 2048.0) / 2048.0;
            wr = jsRound(gRead(1, gSrc + double(g)) * fe * 2048.0) / 2048.0;
        } else {
            const double sb = kGlSlice[std::min(4, int(std::floor(cGlSize * 5.0)))];
            const double Ls = std::min(N - 8.0, std::max(64.0, jsRound(sb * beatLen))), rate = vpow(2.0, (cGlSpeed - 0.5) * 2.0);
            const double per = mode == 0 ? std::max(sb, 1.0) : sb, cap = std::floor(beat / per);
            if (cap != gCap) { gCap = cap; gLen = Ls; gPos = 0.0; gStart = mode == 0 ? gAbs - Ls : gAbs; }
            const double p = gPos, fe = std::min(1.0, std::min(p / 64.0, std::max(0.0, gLen - p) / 64.0));
            if (mode == 0) { wl = gRead(0, gStart + p) * fe; wr = gRead(1, gStart + p) * fe; gPos += rate; if (gPos >= gLen) gPos -= gLen; }
            else { wl = gRead(0, gStart - 1.0 - p) * fe; wr = gRead(1, gStart - 1.0 - p) * fe; gPos = std::min(gPos + rate, gLen); }
        }
        const double m = gMixS;
        if (cGm) { wl = metalTick(mt[kT], wl); wr = metalTick(mt[kT + 1], wr); }   // NEW (0.9): Metalise character
        o[0] += (wl - o[0]) * m; o[1] += (wr - o[1]) * m;
    }

    // ---------------------------------------------------------------- NEW: per-step ring modulation
    // slaves × (the master track's waveform, level-normalised, or a sine), for the ring step's length
    void ring() {
        const bool on = rOn && beat < rEnd; if (!on) rOn = false;
        rS += ((on ? rAmt : 0.0) - rS) * ringK; if (!on && rS < 1e-5) { rS = 0.0; return; }
        double c;
        if (rMaster >= kRingOsc) { rPh += rHz / sr; if (rPh >= 1.0) rPh -= 1.0; c = vsin(2.0 * kPi * rPh); }
        else { const double m = yv[rMaster], a = std::fabs(m); rEnv = a > rEnv ? a : rEnv * rEnvK; c = rEnv > 0.003 ? clampd(m / rEnv, -1.5, 1.5) : 0.0; }
        const double g = rS;
        for (int t = 0; t < kT; ++t) if ((rMask >> t) & 1) yv[t] += (yv[t] * c - yv[t]) * g;
    }

    // ---------------------------------------------------------------- NEW: Slicer
    double sRead(int c, double pos) const {
        const std::vector<float> &b = c ? sb1 : sb0; const long N = sbLen;
        const double fl = std::floor(pos); const double fr = pos - fl;
        long a = long(std::fmod(fl, double(N))); if (a < 0) a += N; const long n = a + 1 == N ? 0 : a + 1;
        return double(b[size_t(a)]) + (double(b[size_t(n)]) - double(b[size_t(a)])) * fr;
    }
    double srnd() { return double(xs(slrng)) / 4294967296.0; }
    void slicer(double *o, double bpm) {
        sMixS += ((cSlOn ? cSlMix : 0.0) - sMixS) * 0.002;
        if (!cSlOn && sMixS < 1e-5) { sMixS = 0.0; sCyc = -1; sIdx = -1; sHold = 0; dclN = 0; sLastP = -1.0; return; }
        const double sbt = kVDGSlDivBeats[cSlDiv], cycB = std::min((cSlBars + 1) * 4.0, kNSlot * sbt);
        const int n = int(jsRound(cycB / sbt));
        const long cyc = long(std::floor(beat / cycB));
        const int i = std::min(n - 1, int(std::floor((beat - double(cyc) * cycB) / sbt)));
        const double L = std::max(64.0, jsRound(sbt * 60.0 / bpm * sr));
        if (cyc != sCyc) {
            const bool next = sCyc >= 0 && cyc == sCyc + 1;
            for (int k = 0; k < kNSlot; ++k) { prevSt[k] = next ? curSt[k] : -1; curSt[k] = -1; }
            sCyc = cyc; sIdx = -1;
            slrng = uint32_t(int64_t(cSlSeed + 1) * 2654435761LL + int64_t(cyc) * 40503LL); if (!slrng) slrng = 1;   // the same seed gives the same variations
        }
        bool fresh = false;
        if (i != sIdx) {   // a new slice: its action
            sIdx = i; curSt[i] = sAbs - 1.0; sStart = sAbs - 1.0; sL = L; fresh = true;
            int a = slAct[i], src = slSrc[i];
            const double r1 = srnd(), r2 = srnd(), r3 = srnd(), r4 = srnd();
            if (a != 0 && r1 >= cSlDen) a = 0;
            if (r2 < cSlEvo) { a = 1 + int(std::floor(r3 * 11.0)); src = int(std::floor(r4 * n)); }
            sAct = a; sSrc = src;
        }
        if (cSlHold != sHold) {   // momentary hold: starts now, over everything; release → through to the next slice
            sHold = cSlHold; sStart = sAbs - 1.0; sL = L;
            sAct = sHold > 0 ? kSlHold[sHold] : 0;
        } else if (fresh && sHold > 0) sAct = kSlHold[sHold];
        const int a = sAct;
        const double oo = sAbs - sStart, Ls = sL;
        const double prev = i > 0 ? curSt[i - 1] : prevSt[n - 1];
        double pos = -1.0, gain = 1.0; bool echo = false;
        switch (a) {
            case 1: if (prev >= 0) pos = prev + std::fmod(oo, Ls); break;                                                  // repeat the previous slice
            case 2: { const double seg = Ls / kVDGSlStutter[cSlStut]; pos = sStart + std::fmod(oo, seg); break; }               // stutter
            case 3: { const double base = prevSt[i] >= 0 ? prevSt[i] : prev; if (base >= 0) pos = base + (Ls - 1.0 - std::fmod(oo, Ls)); break; }   // reverse
            case 4: { const double T = Ls * cSlTape; if (oo < T) { pos = sStart + oo - oo * oo / (2.0 * T); gain = std::min(1.0, (T - oo) / 64.0); } else { gain = 0.0; pos = sStart; } break; }   // tape stop
            case 5: { const double T = Ls * cSlTape; pos = oo < T ? sStart + oo * oo / (2.0 * T) : sStart + T * 0.5 + (oo - T); break; }   // tape start
            case 6: case 7: { const double rr = a == 6 ? vpow(2.0, cSlPitch / 12.0) : cSlSpeed;                                // pitch / speed
                if (rr <= 1.0) pos = sStart + oo * rr; else if (prev >= 0) pos = prev + std::fmod(oo * rr, Ls); break; }
            case 8: gain = 0.0; pos = sStart; break;                                                                         // gate
            case 9: { const int j = std::min(sSrc, n - 1); if (j != i) { const double base = j < i ? curSt[j] : prevSt[j]; if (base >= 0) pos = base + std::fmod(oo, Ls); } break; }   // permute
            case 10: if (prev >= 0) pos = prev + Ls * 0.5 + Ls * 0.45 * vsin(4.0 * kPi * oo / Ls); break;                     // scratch
            case 11: if (prev >= 0) { pos = prev + std::fmod(oo, Ls); echo = true; } break;                                  // echo: + the previous slice
            default: break;
        }
        if (a == 0 || pos < 0 || pos > sAbs - 1.0 || pos < sAbs - double(sbLen) + 2.0) pos = -1.0;                         // through (or not recorded yet / any more)
        double yl = o[0], yr = o[1];
        if (pos >= 0) {
            double wl = sRead(0, pos) * gain, wr = sRead(1, pos) * gain;
            if (echo) { wl = o[0] + 0.6 * wl; wr = o[1] + 0.6 * wr; }
            yl += (wl - yl) * sMixS; yr += (wr - yr) * sMixS;
        }
        // declick: wherever the read position jumps (a new slice, a stutter re-trigger, a loop, wet ↔ through), the jump in
        // the output is spread over 2 ms — from the sound that was playing, so a gate or a stop never lets a hit through
        const double lp = sLastP, lg = sLastG; sLastP = pos; sLastG = gain;
        if ((pos < 0) != (lp < 0) || (pos >= 0 && (fresh || std::fabs(pos - lp) > 8.0))) {
            double ql = o[0], qr = o[1];   // what the old read would have played now
            if (lp >= 0 && lp + 1.0 <= sAbs - 1.0) { const double m = sMixS, g = lg; ql += (sRead(0, lp + 1.0) * g - ql) * m; qr += (sRead(1, lp + 1.0) * g - qr) * m; }
            const double k0 = dclN / 96.0;   // a declick still running carries on from where it was
            dclL = ql + dclL * k0 - yl; dclR = qr + dclR * k0 - yr; dclN = 96;
        }
        if (dclN > 0) { const double k = dclN / 96.0; yl += dclL * k; yr += dclR * k; --dclN; }
        o[0] = yl; o[1] = yr;
    }

    // ---------------------------------------------------------------- delay + reverb (Vektur Pulse)
    void fx(double *o, double sl, double sr2, double rl, double rr) {
        const double dsec = cDsec;
        dlyT += (dsec * sr - dlyT) * cDlyGlide;
        if (dlyT < 1.0) dlyT = dsec * sr;
        double rp = double(dlyPos) - dlyT; if (rp < 0.0) rp += dlyLen;
        const int i0 = int(rp); const double fr = rp - i0; const int i1 = (i0 + 1) % dlyLen;
        const double lpA = cLpA, fb = P(VDG_DR_DLYFB);
        for (int c = 0; c < 2; ++c) { const double d = dly[c][i0] + (dly[c][i1] - dly[c][i0]) * fr; dlyLp[c] = ftz(dlyLp[c] + (d - dlyLp[c]) * lpA); }
        if (cPP) { dly[0][dlyPos] = (sl + sr2) * 0.5 + dlyLp[1] * fb; dly[1][dlyPos] = dlyLp[0] * fb; }
        else { dly[0][dlyPos] = sl + dlyLp[0] * fb; dly[1][dlyPos] = sr2 + dlyLp[1] * fb; }
        bool nz = dly[0][dlyPos] != 0.0 || dly[1][dlyPos] != 0.0 || dlyLp[0] != 0.0 || dlyLp[1] != 0.0;
        dlyPos = (dlyPos + 1) % dlyLen;
        o[0] += dlyLp[0]; o[1] += dlyLp[1];
        const double inp = (rl + rr) * 0.5 * 0.015; const int rt = cRevType;
        if (rt != rvType) { if (rvType >= 0) rvClear(); rvType = rt; }   // a new type starts clean
        if (rt == 0) nz = room(o, inp, 0.7 + P(VDG_DR_REVSIZE) * 0.28, P(VDG_DR_REVDAMP) * 0.4, 1.0) || nz;
        else if (rt == 1) nz = spring(o, inp) || nz;
        else if (rt == 2) nz = gate(o, inp, std::fabs(rl) + std::fabs(rr)) || nz;
        else nz = expanse(o, inp) || nz;
        fxZero = nz ? 0 : fxZero + 1;
    }
    // ---- reverb types (NEW 0.8): Room (Vektur Pulse's), Spring, Gate, Expanse
    bool room(double *o, double in, double rfb, double damp, double gain) {
        bool nz = false;
        for (int c = 0; c < 2; ++c) {
            double acc = 0.0;
            for (int k = 0; k < 8; ++k) {
                const int j = c * 8 + k; double *b = rvC[j]; int &p = rvCP[j];
                const double y = b[p];
                rvF[j] = ftz(y * (1.0 - damp) + rvF[j] * damp);
                b[p] = in + rvF[j] * rfb;
                nz = nz || y != 0.0 || b[p] != 0.0;
                if (++p >= rvCL[j]) p = 0;
                acc += y;
            }
            for (int k = 0; k < 4; ++k) {
                const int j = c * 4 + k; double *b = rvA[j]; int &p = rvAP[j];
                const double bo = b[p];
                b[p] = ftz(acc + bo * 0.5);
                nz = nz || bo != 0.0 || b[p] != 0.0;
                acc = bo - acc;
                if (++p >= rvAL[j]) p = 0;
            }
            o[c] += acc * 3.0 * gain;
        }
        if (!nz) for (int j = 0; j < 16; ++j) if (rvF[j] != 0.0) { nz = true; break; }
        return nz;
    }
    bool spring(double *o, double inp) {   // two dispersive loops (16 first-order allpasses each), damped, ~45 / 51 ms
        const double size = P(VDG_DR_REVSIZE), damp = P(VDG_DR_REVDAMP), fb = 0.45 + 0.45 * size, lpk = 1.0 - damp * 0.7; bool nz = false;
        for (int c = 0; c < 2; ++c) {
            std::vector<double> &buf = c ? spgBuf1 : spgBuf0; const long Lb = long(buf.size()), p = spgPos % Lb; const double d = buf[size_t(p)];
            spgLp[c] = ftz(spgLp[c] + (d - spgLp[c]) * lpk);
            double x = inp * 4.0 + fb * spgLp[c]; const double a = c ? -0.62 : -0.56;
            for (int k = 0; k < 16; ++k) { const int j = c * 16 + k; const double y = a * x + spgAp[j]; spgAp[j] = ftz(x - a * y); x = y; }
            buf[size_t(p)] = x; o[c] += d * 1.4;
            nz = nz || d != 0.0 || x != 0.0;
        }
        spgPos = spgPos + 1 >= 0x3fffffff ? 0 : spgPos + 1;
        return nz;
    }
    bool gate(double *o, double inp, double lvl) {   // the 80s gated reverb: a dense room cut off after Size's hold (60–560 ms)
        const double size = P(VDG_DR_REVSIZE);
        if (lvl > 0.02) gtHold = lr((0.06 + 0.5 * size) * sr);
        const double tg = gtHold > 0 ? 1.0 : 0.0; if (gtHold > 0) gtHold--;
        gtG += (tg - gtG) * (tg > gtG ? 0.2 : 0.004);
        return room(o, inp * 1.4, 0.7 + 0.28 * 0.93, P(VDG_DR_REVDAMP) * 0.4, gtG) || gtG > 1e-6;
    }
    void expControl() {   // Expanse coefficients (control rate: identical to per sample)
        const double sz = P(VDG_DR_REVSIZE), fz = clampd((sz - 0.95) / 0.05, 0.0, 1.0), wash = clampd((sz - 0.9) / 0.05, 0.0, 1.0);
        const double rt = sz >= 0.9 ? 12.0 + wash * 48.0 : 1.5 + sz / 0.9 * 10.5, scale = 1.0 + 1.2 * sz;
        xpFz = fz; xpScale = scale; xpDepth = (4.0 + wash * 14.0) * sr / 48000.0; xpDk = P(VDG_DR_REVDAMP) * 0.5 * (1.0 - fz);
        for (int i = 0; i < 8; ++i) { const double d = fdnLen[i] * scale; double g = vpow(10.0, -3.0 * d / (rt * sr)); g += (1.0 - g) * fz; xpG[i] = g; }
    }
    bool expanse(double *o, double inp) {   // 8-line FDN up to 12 s; 90–95 %: up to 60 s washes; 95–100 %: freeze
        const double fz = xpFz, scale = xpScale, depth = xpDepth, dk = xpDk; const long M = fdnMax, pos = fdnPos; double *B = fdnBuf.data(), *y = xpLast;
        double x = inp * 2.0 * (1.0 - fz);
        for (int i = 0; i < 4; ++i) { std::vector<double> &ab = xpAp[i]; const int p = xpApP[i]; const double bo = ab[size_t(p)]; ab[size_t(p)] = ftz(x + bo * 0.6); x = bo - x * 0.6; xpApP[i] = p + 1 >= xpApL[i] ? 0 : p + 1; }
        double sum = 0.0;
        for (int i = 0; i < 8; ++i) {
            fdnPh[i] += kFdnRate[i] / sr; if (fdnPh[i] >= 1.0) fdnPh[i] -= 1.0;
            const double d = fdnLen[i] * scale + depth * (1.0 + vsin(2.0 * kPi * fdnPh[i]));
            double rp = double(pos) - d; if (rp < 0) rp += double(M); const double fl = std::floor(rp); const long i0 = long(fl); const double fr = rp - fl; const long i1 = i0 + 1 == M ? 0 : i0 + 1, bb = i * M;
            const double vv = B[bb + i0] + (B[bb + i1] - B[bb + i0]) * fr;
            fdnLp[i] = ftz(vv * (1.0 - dk) + fdnLp[i] * dk); y[i] = fdnLp[i]; sum += y[i];
        }
        bool nz = false;
        for (int i = 0; i < 8; ++i) { B[i * M + pos] = ftz(((i & 1) ? -x : x) * 0.5 + (y[i] - sum * 0.25) * xpG[i]); nz = nz || y[i] != 0.0; }
        fdnPos = pos + 1 == M ? 0 : pos + 1;
        o[0] += (y[0] + y[2] + y[4] + y[6]) * 0.7; o[1] += (y[1] + y[3] + y[5] + y[7]) * 0.7;
        return nz || x != 0.0;
    }
};

}  // namespace vd
