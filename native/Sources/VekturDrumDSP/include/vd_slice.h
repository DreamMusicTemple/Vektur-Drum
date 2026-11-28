/* Vektur Drum 0.9 — the sample editor's analysis and preparation (C API). [main] thread only: these allocate and take
 * time (they are never called from the audio thread). Line for line with web/src/slices.js, so a break detects, slices
 * and stretches the same in the web app and the iOS app (tests/native_slice checks the two against each other).
 *
 *   transient detection   STFT 1024 / hop 256: spectral flux on log magnitudes + rise in energy, adaptive median
 *                         threshold (sensitivity 0…1), minimum spacing, each mark moved back to where its attack starts
 *   classification        kick / snare / hat / ghost / other — a suggestion only (the user assigns freely)
 *   tempo                 onset-curve autocorrelation 70–190 BPM, octave from the project tempo when it clearly points
 *                         to one, snapped to a whole number of bars when close
 *   stretch               WSOLA, 25 ms frames, ±4 ms alignment; the first 12 ms (the attack) kept exactly
 *   prepare               every slice cut out, stretched by its own Stretch × the track's tune mode, joined — a
 *                         vd_sample with its slice table, ready for vd_engine_set_sample
 */
#ifndef VD_SLICE_H
#define VD_SLICE_H
#include "vd_engine.h"
#ifdef __cplusplus
extern "C" {
#endif

enum { VD_HIT_KICK = 0, VD_HIT_SNARE, VD_HIT_HAT, VD_HIT_GHOST, VD_HIT_OTHER };
enum { VD_TUNE_RATE = 0, VD_TUNE_STRETCH = 1, VD_TUNE_TEMPO_LOCK = 2 };

/** Transient positions (frames), ascending; returns how many (≤ max). */
uint32_t vd_slice_detect(const float *mono, uint32_t frames, double rate, double sensitivity, double gap_ms, uint32_t *out, uint32_t max);
/** Suggested class of the hit at `pos`; `loudest` = the loudest hit's peak (for ghosts). */
int vd_slice_classify(const float *mono, uint32_t frames, double rate, uint32_t pos, double loudest);
/** NEW (0.9.1): classes for all the hits of a break at once (positions ascending), each judged against the others — use
    this for a break: fixed thresholds call nearly every hit of a real break a snare. out[i] = VD_HIT_*. */
void vd_slice_classify_all(const float *mono, uint32_t frames, double rate, const uint32_t *pos, uint32_t count, int *out);
/** Peak |x| over n frames from pos. */
double vd_slice_peak(const float *mono, uint32_t frames, uint32_t pos, uint32_t n);
/** Tempo of a loop (0 = no clear pulse); hint = the project's tempo (0 = none). */
double vd_slice_bpm(const float *mono, uint32_t frames, double rate, double hint);
/** x stretched by f (output ≈ f × n frames, at most capacity); returns the frames written. */
uint32_t vd_slice_stretch(const float *x, uint32_t n, double f, double rate, float *out, uint32_t capacity);

typedef struct {   /* one slice and its settings (web: { s, e, p, g, pan, a, gate, r, st, stut, sd, m }) */
    uint32_t start, end;        /* frames of the original sample */
    double pitch;               /* semitones −24…24 */
    double gain;                /* 0…2 */
    double pan;                 /* −1…1 */
    double attack_ms;           /* 0…200 */
    double gate;                /* 0.02…1 */
    uint8_t reverse, stutter, _pad[2];   /* stutter: repeats 0…8 */
    double stretch;             /* ×0.25…4 */
    double stutter_beats;       /* stutter length in beats (1/32 = 0.125) */
    double metalise;            /* −1 = the track's, else 0…1 */
} vd_slice_def;
typedef struct {
    int32_t tune_mode;          /* VD_TUNE_* */
    double stretch;             /* the track's Stretch ×0.5…2 */
    double tune;                /* the track's Tune, semitones */
    double bpm;                 /* the project tempo */
    double sample_bpm;          /* the sample's own tempo (0 = unknown) — TEMPO LOCK */
} vd_prepare_opts;
/** The engine's buffer for a sliced sample (or for TUNE MODE ≠ Rate with no slices: the whole sample as one).
    Returns NULL for "play the sample as it is" (no slices, Rate) or on bad arguments. Release with vd_sample_release
    unless handed to vd_engine_set_sample. */
vd_sample *vd_slice_prepare(const float *mono, uint32_t frames, double rate, const vd_slice_def *slices, uint32_t count, const vd_prepare_opts *o);

#ifdef __cplusplus
}
#endif
#endif /* VD_SLICE_H */
