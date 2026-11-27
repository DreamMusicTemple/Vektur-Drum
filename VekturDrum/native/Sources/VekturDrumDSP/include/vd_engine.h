/* Vektur Drum — DSP engine contract (C API).
 *
 * The engine is C++ (VekturDrumDSP). Swift — the app and the AUv3 extension — sees only this header. Keeping C++
 * types out of Swift lets the audio unit's render block call straight in, and avoids enabling Swift/C++ interop
 * in every target.
 *
 * THREADS. Every function is marked with the thread it may run on:
 *   [any]    safe from any thread, lock-free, no allocation
 *   [audio]  the render thread only (real-time: no locks, no allocation, no I/O)
 *   [main]   any non-real-time thread (may allocate). vd_engine_send has a single-producer queue: call it from one
 *            thread at a time. vd_engine_set_sample, vd_engine_load_sequence and vd_engine_collect_garbage use atomic
 *            hand-offs only and may be called from several non-real-time threads at once (tested under TSan).
 * The engine never calls back into Swift.
 *
 * SOURCE OF TRUTH. The Swift project model (VekturDrumCore) owns the music. The engine holds a mirror of it, fed by
 * parameters and commands, so a full resync (vd_engine_sync_begin … _end) can always rebuild the engine from the
 * model — after an engine reset, a sample-rate change or loading a project.
 */
#ifndef VD_ENGINE_H
#define VD_ENGINE_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---------------------------------------------------------------------------------------------- capacities
 * VD_TRACK_CAPACITY sizes the address space, telemetry and buses, so going beyond 12 tracks later changes no API:
 * the engine itself is built with VD_TRACKS_MAX tracks (the generated parameter table), of which a project plays
 * VD_TRACKS_MIN…VD_TRACKS_MAX (VD_CMD_SET_TRACK_COUNT). Patterns, steps and chain match Vektur Pulse exactly. */
enum {
    VD_TRACK_CAPACITY = 16,
    VD_TRACKS_MIN = 6,
    VD_TRACKS_MAX = 12,          /* 0.9: 12 (was 9) */
    VD_PATTERNS = 8,
    VD_STEPS = 16,
    VD_CHAIN_MAX = 16,
    VD_DIVISIONS = 10,          /* 1/4 1/4T 1/8 1/8T 1/8. 1/16 1/16T 1/16. 1/32 1/32T */
    VD_RATCHET_MAX = 4,
    VD_MAX_BUSES = 1 + VD_TRACK_CAPACITY   /* bus 0 = main mix; 1… = per-track outputs (AUv3 multi-out, optional) */
};

/* ---------------------------------------------------------------------------------------------- parameters
 * Stable addresses (they become AUParameter addresses: hosts store automation by them, so they never change).
 *   master:  VD_PARAM_MASTER_BASE + index                         (0 … 255)
 *   track t: VD_PARAM_TRACK_BASE + t * VD_PARAM_TRACK_STRIDE + index
 * Track-local index blocks: 0–31 channel + analogue (Vektur Pulse order, so Pulse kits import 1:1),
 * 32–63 per-track additions, 64–191 FM engine (Stage 7), 192–255 reserved for future engines. */
typedef uint32_t vd_param_id;
enum {
    VD_PARAM_MASTER_BASE = 0,
    VD_PARAM_TRACK_BASE = 1024,
    VD_PARAM_TRACK_STRIDE = 256,
    VD_PARAM_TRACK_FM_BASE = 64,
    VD_PARAM_ID_END = VD_PARAM_TRACK_BASE + VD_TRACK_CAPACITY * VD_PARAM_TRACK_STRIDE
};

/* Track-local indices 0–14: exactly Vektur Pulse's per-track parameters, in drumspec.py order. */
typedef enum {
    VD_TP_MODEL = 0, VD_TP_TUNE, VD_TP_DECAY, VD_TP_TONE, VD_TP_SNAP, VD_TP_LEVEL, VD_TP_PAN, VD_TP_BEND,
    VD_TP_BITS, VD_TP_RATE, VD_TP_DELAY_SEND, VD_TP_REVERB_SEND, VD_TP_MUTE, VD_TP_SOLO, VD_TP_BEND_RATE,
    /* NEW in Vektur Drum */
    VD_TP_ENGINE = 32,          /* vd_track_engine */
    VD_TP_CHOKE_GROUP,          /* 0 = none, 1…4 */
    VD_TP_MIDI_NOTE,            /* 0…127 */
    VD_TP_SWEEP,                /* pitch sweep −48…48 st, glides to 0 */
    VD_TP_SWEEP_TIME,           /* 5 ms…2 s */
    /* NEW: 4-band EQ — low shelf, peak, peak, high shelf; frequency (Hz) then gain (dB, 0 = band off) */
    VD_TP_EQ1_FREQ = 40, VD_TP_EQ1_GAIN, VD_TP_EQ2_FREQ, VD_TP_EQ2_GAIN, VD_TP_EQ3_FREQ, VD_TP_EQ3_GAIN, VD_TP_EQ4_FREQ, VD_TP_EQ4_GAIN,
    /* FM engine (web build: tests/features.test.js) */
    VD_TP_FM_ALGORITHM = 64,    /* 0 classic M→C · 1 stack M2→M1→C · 2 parallel · 3 ring metal */
    VD_TP_FM_FREQ, VD_TP_FM_RATIO, VD_TP_FM_RATIO2, VD_TP_FM_INDEX, VD_TP_FM_INDEX_DECAY,
    VD_TP_FM_FEEDBACK, VD_TP_FM_FOLD, VD_TP_FM_NOISE,
    /* NEW (0.9): vintage sampler — METALISE 0…1 (0 = bypassed), RESAMPLE 0…1 (0 = unaffected), its transient mode
       (0 Preserve · 1 Round · 2 Crush · 3 Rebuild) and sensitivity, the slice a hit plays (1…32), the sample's tune
       mode (0 Rate · 1 Stretch · 2 Tempo lock), stretch ×0.5…2 and the sampler model (0…5, see vd_params.generated.h) */
    VD_TP_METALISE = 48, VD_TP_RESAMPLE, VD_TP_TRANSIENT_MODE, VD_TP_TRANSIENT_SENS, VD_TP_SLICE, VD_TP_TUNE_MODE, VD_TP_STRETCH, VD_TP_SAMPLER_MODEL,
    VD_TP_LONG /* NEW 0.9.1: Decay × 20 — up to 60 s */
} vd_track_param;

/* Master indices: Vektur Pulse's master block, same order. */
typedef enum {
    VD_MP_MIDI_CHANNEL = 0, VD_MP_SWING, VD_MP_TEMPER /* NEW 0.8: −1 warm … 0 neutral (bypassed) … +1 cold; was Warmth 0…1 */, VD_MP_LEVEL, VD_MP_HAT_CHOKE,
    VD_MP_DELAY_DIV, VD_MP_DELAY_FEEDBACK, VD_MP_DELAY_TONE, VD_MP_DELAY_PINGPONG,
    VD_MP_REVERB_SIZE, VD_MP_REVERB_DAMPING,
    VD_MP_REVERB_TYPE /* NEW 0.8: 0 Room · 1 Spring · 2 Gate · 3 Expanse */, VD_MP_HUMANISE /* NEW 0.8: 0…1, 0 = the sequencer as written */,
    /* NEW: global glitch and its 3 LFOs (LFO n: VD_MP_LFO_BASE + n * VD_MP_LFO_STRIDE + field) */
    VD_MP_GLITCH_ON = 32, VD_MP_GLITCH_MODE /* 0 stutter · 1 reverse · 2 Metal stretch */, VD_MP_GLITCH_MIX, VD_MP_GLITCH_SIZE, VD_MP_GLITCH_SPEED,
    VD_MP_METALISE_CHARACTER /* NEW 0.9: the vintage-sampler character on the Metalise output, 0…1 */,
    VD_MP_METALISE_CHANCE /* NEW 0.9.1: 0 = always · else the chance each division plays while ON */, VD_MP_METALISE_CHANCE_DIV /* 0 1/16 · 1 1/8 · 2 1/4 · 3 bar */,
    VD_MP_LFO_BASE = 48, VD_MP_LFO_STRIDE = 8,  /* fields: 0 rate, 1 shape, 2 depth, 3 dest (mix|size|speed), 4 sync, 5 division */
    /* NEW: the Slicer (last on the master bus) */
    VD_MP_SLICER_ON = 80, VD_MP_SLICER_MIX, VD_MP_SLICER_DIVISION /* 1/32 1/16 1/8 1/4 */, VD_MP_SLICER_CYCLE /* 1|2 bars */,
    VD_MP_SLICER_DENSITY, VD_MP_SLICER_EVOLVE, VD_MP_SLICER_SEED, VD_MP_SLICER_SPEED, VD_MP_SLICER_STUTTER /* ×2 3 4 6 8 */,
    VD_MP_SLICER_TAPE, VD_MP_SLICER_PITCH, VD_MP_SLICER_HOLD /* 0 off · 1 stutter 2 reverse 3 tape stop 4 pitch 5 gate 6 scratch */,
    /* NEW: modulation sources besides the LFOs */
    VD_MP_ENV_INPUT = 96 /* 0 master, 1…12 track */, VD_MP_ENV_ATTACK, VD_MP_ENV_RELEASE, VD_MP_ENV_GAIN,
    VD_MP_CHAOS_MODE = 104 /* 0 Lorenz · 1 logistic · 2 drift */, VD_MP_CHAOS_RATE,
    /* NEW: tape and vinyl on the whole mix (0…1, 0 = off) */
    VD_MP_TAPE_WOW = 112, VD_MP_TAPE_FLUTTER, VD_MP_VINYL_DUST,
    /* NEW 0.8: the insert input (the AUv3 effect's source): its level, delay and reverb sends, and whether the drums play */
    VD_MP_INPUT_LEVEL = 120, VD_MP_INPUT_DELAY, VD_MP_INPUT_REVERB, VD_MP_INPUT_DRUMS
} vd_master_param;

/* NEW: Slicer actions (one per slice of the cycle) and modulation sources */
typedef enum {
    VD_SLICE_THRU = 0, VD_SLICE_REPEAT, VD_SLICE_STUTTER, VD_SLICE_REVERSE, VD_SLICE_TAPE_STOP, VD_SLICE_TAPE_START,
    VD_SLICE_PITCH, VD_SLICE_SPEED, VD_SLICE_GATE, VD_SLICE_PERMUTE, VD_SLICE_SCRATCH, VD_SLICE_ECHO, VD_SLICE_ACTION_COUNT
} vd_slice_action;
typedef enum { VD_MOD_LFO1 = 0, VD_MOD_LFO2, VD_MOD_LFO3, VD_MOD_ENVELOPE, VD_MOD_CHAOS, VD_MOD_SOURCE_COUNT } vd_mod_source;
enum { VD_SLICER_SLOTS = 32, VD_MOD_WIRES = 32, VD_RING_OSCILLATOR = 12 /* ring master: 0–11 a track, 12 the sine oscillator (0.9; was 9) */ };
#define VD_PARAM_NONE 0xFFFFFFFFu

typedef enum { VD_ENGINE_ANALOG = 0, VD_ENGINE_SAMPLE = 1, VD_ENGINE_FM = 2 } vd_track_engine;

#if defined(__GNUC__) || defined(__clang__)
#define VD_INLINE static inline __attribute__((unused))
#else
#define VD_INLINE static inline
#endif
VD_INLINE vd_param_id vd_track_param_id(uint32_t track, uint32_t index) {
    return VD_PARAM_TRACK_BASE + track * VD_PARAM_TRACK_STRIDE + index;
}

/* ---------------------------------------------------------------------------------------------- commands
 * Structural edits (not automatable): sent through a lock-free single-producer queue, applied by the audio thread
 * at the start of the next render block, in order. POD, fixed size: no allocation on either side. */
typedef enum {
    VD_CMD_SET_STEP = 1,        /* pattern, track, step, step fields */
    VD_CMD_SET_TRACK_LAYOUT,    /* pattern, track, length 1…16, division 0…9 */
    VD_CMD_SET_BARS,            /* pattern, bars 1|2|4 */
    VD_CMD_SET_CHAIN,           /* chain_on, n, pats[] */
    VD_CMD_SELECT_PATTERN,      /* pattern (switches at pattern end while playing) */
    VD_CMD_TRANSPORT,           /* value: 1 play (starts on next beat), 0 stop */
    VD_CMD_RECORD_ARM,          /* value: 0|1 */
    VD_CMD_SET_TRACK_COUNT,     /* value: VD_TRACKS_MIN…VD_TRACKS_MAX */
    VD_CMD_NOTE,                /* track, velocity 0…1 — pads (MIDI arrives with render events instead) */
    VD_CMD_PANIC,               /* all voices off, effect tails cleared */
    VD_CMD_ENABLE,              /* value: 0|1 (Vektur Pulse's on/off) */
    VD_CMD_SYNC_BEGIN,          /* full resync follows; engine mutes until VD_CMD_SYNC_END */
    VD_CMD_SYNC_END,
    VD_CMD_SET_WIRE,            /* NEW: u.wire — slot 0…31; param VD_PARAM_NONE empties the slot */
    VD_CMD_SET_SLICE,           /* NEW: u.slice — slot 0…31, action, permute source */
    VD_CMD_SET_STEP_FX,         /* NEW 0.8: u.step_fx — pattern, track, step: pitch shift + spectral, and (0.9) Metalise, slice, chances (SET_STEP leaves them as they are) */
    VD_CMD_SET_PATTERN_SLICER,  /* NEW 0.9: pattern, value −1 follow SLICER · 0 off · 1 on */
    VD_CMD_NOTE_SLICE,          /* NEW 0.9: track, step = slice 1…32, value velocity 0…1 — a Break Lab pad (records the slice while REC is lit) */
    VD_CMD_SET_LFO_POINTS       /* NEW 0.9.1: u.lfo_points — points start…start+count−1 (≤ 8) of LFO 0…2's drawn shape (16 points, −1…1; shape 5 = Draw) */
} vd_command_type;

typedef struct {   /* Vektur Pulse's 9 step fields */
    uint8_t on;
    uint8_t ratchet;            /* 1…4 */
    int8_t pitch;               /* −12…12 semitones */
    uint8_t _pad;
    float velocity;             /* 0…1 */
    float pan;                  /* −1…1, added to the track pan */
    float crush;                /* 0…1 (0 = off) */
    float delay_send, reverb_send; /* 0…1, added to the track sends */
    float chance;               /* 0…1 probability */
    float fm_ratio;             /* NEW: FM modulator ratio for this step, 0.25…16; 0 = the track's ratio */
    uint8_t ring_on;            /* NEW: ring modulation for the length of this step */
    uint8_t ring_master;        /* 0–11 track, VD_RING_OSCILLATOR = sine */
    uint16_t ring_slaves;       /* bit t = track t+1 is multiplied by the master */
    float ring_amount;          /* 0…1 */
    float ring_hz;              /* oscillator 20…5000 Hz */
    float fold;                 /* NEW: this step's wavefolder 0…1 (0 = off) */
} vd_step;

typedef struct {   /* NEW 0.8: a step's pitch shifter and spectral processor (kept apart so a command stays ≤ 64 bytes) */
    float shift_semitones;      /* −24…24 (0 = off) */
    float shift_mix;            /* 0…1 (1 = the shifted sound alone; 0 = off) — default 1 */
    float spectral;             /* spectral amount 0…1 (0 = off) */
    float spectral_colour;      /* 0…1: Smear · Shift · Harmonic · Robot · Whisper · Freeze, each with its own setting */
    float spectral_mix;         /* 0…1 (0 = off) — default 1 */
    /* NEW 0.9 (all zero = the track's): */
    uint8_t slice;              /* 0 = the track's Slice · 1…32 this slice of the track's sample */
    uint8_t metal_set;          /* 1: `metal` is this step's own Metalise · 0: the slice's, else the track's */
    uint8_t _pad2[2];
    float metal;                /* 0…1 */
    float reverse_chance;       /* 0…1: chance the hit plays its slice backwards (flips a reversed slice) */
    float stutter_chance;       /* 0…1: chance of a 1/32 stutter (2–3 repeats) */
} vd_step_fx;

typedef struct { uint8_t source, _pad[3]; vd_param_id param; float amount; } vd_mod_wire;   /* NEW: amount −1…1 of the dial's travel */
typedef struct { uint8_t action, source; } vd_slice;                                         /* NEW: source = the slice a PERMUTE plays */

typedef struct {
    uint16_t type;              /* vd_command_type */
    uint8_t pattern, track, step;
    uint8_t _pad[3];
    union {
        vd_step step;
        vd_step_fx step_fx;
        struct { uint8_t length, division; } layout;
        uint8_t bars;
        struct { uint8_t chain_on, n, pats[VD_CHAIN_MAX]; } chain;
        struct { uint8_t slot; vd_mod_wire w; } wire;
        struct { uint8_t slot; vd_slice s; } slice;
        struct { uint8_t lfo, start, count, _pad; float points[8]; } lfo_points;   /* NEW 0.9.1: VD_CMD_SET_LFO_POINTS */
        float value;
    } u;
} vd_command;

/* ---------------------------------------------------------------------------------------------- render
 * Musical time comes from the caller: the standalone app's own clock, the AU host's musical context, or MIDI clock.
 * When `host_beat_valid` is set the engine follows it (Vektur Pulse's hostBeat correction); otherwise it runs free
 * at `tempo`. MIDI arrives already sample-stamped (AU render events / CoreMIDI timestamps converted by the caller). */
typedef struct {
    uint32_t sample_offset;     /* within this render call */
    uint8_t status, data1, data2, _pad;
} vd_midi_event;

typedef struct {
    double tempo;               /* BPM, 20…400 */
    double host_beat;           /* beat position at the first frame, if valid */
    bool host_beat_valid;
    bool host_playing_valid;    /* when set, host transport start/stop drives PLAY/STOP */
    bool host_playing;
    const vd_midi_event *midi;  /* sorted by sample_offset */
    uint32_t midi_count;
    const float *input_left;    /* NEW 0.8: the insert input (AUv3 effect), `frames` samples; NULL = none (instrument) */
    const float *input_right;   /*          NULL = mono (input_left used for both) */
} vd_render_context;

/* ---------------------------------------------------------------------------------------------- telemetry
 * Snapshot for the UI (playhead, LEDs, meters). Written once per render block, read with a sequence lock:
 * the reader never blocks the audio thread and never sees a torn snapshot. Mirrors Vektur Pulse's tel[] array. */
typedef struct {
    uint32_t sequence;          /* internal */
    uint8_t transport;          /* 0 stopped, 1 waiting for the next beat, 2 running */
    uint8_t current_pattern, chain_position, track_count;
    float output_level;         /* 0…1 */
    double beat;
    int8_t current_step[VD_TRACK_CAPACITY];      /* −1 = none */
    uint32_t hit_count[VD_TRACK_CAPACITY];       /* increments on every trigger */
    float envelope[VD_TRACK_CAPACITY];           /* 0…1 */
    float lfo[3];                                /* glitch LFOs −1…1 (0 while the glitch is off) */
    float mod_source[VD_MOD_SOURCE_COUNT];       /* NEW: LFO 1–3, envelope (0…1), chaos — always live */
    int8_t slicer_slice;                         /* NEW: the slice playing, −1 = Slicer off */
    uint8_t slicer_action;                       /* NEW: its action (after density / evolve / hold) */
    uint8_t mod_count;                           /* NEW: modulated dials, for the moving light on each dial: */
    vd_param_id mod_param[VD_MOD_WIRES];         /*      which parameter (stable address) … */
    float mod_position[VD_MOD_WIRES];            /*      … and where modulation has it now, 0…1 of its travel */
} vd_telemetry;

typedef struct {   /* REC: a live hit written into the pattern by the audio thread */
    uint8_t pattern, track, step, slice;   /* slice: 0 = the track's (a pad / MIDI note), 1…32 a Break Lab slice pad (0.9) */
    float velocity;
} vd_recorded_hit;

/* ---------------------------------------------------------------------------------------------- whole sequence
 * Restoring a song (AUAudioUnit.fullState), loading a kit or opening a project replaces the whole sequence at once:
 * the main thread fills a vd_sequence, vd_engine_load_sequence() copies it, and the audio thread swaps it in at the
 * start of its next render call — never half of one song and half of another, never a full command queue, whether
 * or not audio is running. Loads made before the audio thread takes one simply replace it (latest wins). */
typedef struct {
    uint8_t length, division;   /* 1…16, 0…9 */
    uint8_t _pad[2];
    vd_step steps[VD_STEPS];
    vd_step_fx steps_fx[VD_STEPS];   /* NEW 0.8 (all zero = off) */
} vd_track_sequence;
typedef struct {
    uint8_t bars;               /* 1|2|4 */
    uint8_t slicer;             /* NEW 0.9: 0 follows SLICER · 1 on · 2 off */
    uint8_t _pad[2];
    vd_track_sequence tracks[VD_TRACK_CAPACITY];
} vd_pattern;
typedef struct {
    vd_pattern patterns[VD_PATTERNS];
    uint8_t chain[VD_CHAIN_MAX], chain_length, chain_on;
    uint8_t selected_pattern, track_count;
    uint8_t stop_transport;     /* 1: stop playback (opening another song); 0: keep playing (a kit change mid-song) */
    uint8_t _pad[3];
    vd_slice slicer[VD_SLICER_SLOTS];           /* NEW: the Slicer program */
    vd_mod_wire wires[VD_MOD_WIRES];            /* NEW: the modulation matrix (param VD_PARAM_NONE = empty) */
} vd_sequence;

/* ---------------------------------------------------------------------------------------------- samples
 * Sample buffers are built off the audio thread and handed over by pointer. The engine never frees one on the
 * audio thread: replaced buffers go to a release queue emptied by vd_engine_collect_garbage(). */
typedef struct vd_sample vd_sample;
vd_sample *vd_sample_create(const float *const *channels, uint32_t channel_count, uint32_t frames, double sample_rate); /* [main] copies; at most 60 s */
/* NEW 0.9: the sample's slices (before vd_engine_set_sample hands it over). VD_SLICE_FIELDS floats per slice:
   start, length (frames), pitch (st), gain, pan, attack (s), gate 0…1, reverse 0|1, stutter repeats, stutter length (s),
   Metalise (−1 = the track's). The app prepares the buffer (each slice cut out and stretched, joined) — see
   web/src/slices.js — and the table points into it. Copied; positions clamped to the buffer. false = bad arguments. */
enum { VD_SLICE_FIELDS = 11, VD_SLICES_MAX = 64 };
bool vd_sample_set_slices(vd_sample *s, const float *table, uint32_t slice_count);                                      /* [main] */
void vd_sample_release(vd_sample *s);                                                                                  /* [main] */

/* ---------------------------------------------------------------------------------------------- engine */
typedef struct vd_engine vd_engine;

vd_engine *vd_engine_create(double sample_rate, uint32_t max_frames);             /* [main] allocates everything */
void vd_engine_destroy(vd_engine *e);                                              /* [main] */
bool vd_engine_prepare(vd_engine *e, double sample_rate, uint32_t max_frames);    /* [main] audio stopped; keeps music */
void vd_engine_render(vd_engine *e, const vd_render_context *ctx,                 /* [audio] adds nothing: overwrites */
                      float *const *bus_left, float *const *bus_right, uint32_t bus_count, uint32_t frames);

void vd_engine_set_param(vd_engine *e, vd_param_id id, float value);              /* [any] clamps; smoothed in engine */
float vd_engine_get_param(const vd_engine *e, vd_param_id id);                    /* [any] last value set */
bool vd_engine_send(vd_engine *e, const vd_command *c);                           /* [main] single producer; false = queue full */
bool vd_engine_set_sample(vd_engine *e, uint32_t track, vd_sample *s);            /* [main] engine takes ownership; NULL removes */
void vd_engine_collect_garbage(vd_engine *e);                                     /* [main] frees released samples */
bool vd_engine_load_sequence(vd_engine *e, const vd_sequence *s);                 /* [main] copies; whole sequence swapped in at the next block */

/* ---------------------------------------------------------------------------------------------- offline export (NEW 0.8)
 * Use a dedicated engine created at the export sample rate and loaded with the song (parameters, vd_engine_load_sequence,
 * samples) — never the one that is playing. What is rendered: the whole chain once when CHAIN is on (and set), otherwise
 * the selected pattern once — the same as the web app's EXPORT, sample for sample. [main] (it is the "audio thread"
 * of its own engine: nothing may render that engine at the same time). */
typedef struct {
    double tempo;               /* BPM */
    int32_t solo_track;         /* −1: the master · 0…11: this track alone (every other muted, solos ignored) — a stem */
    uint8_t ring_out;           /* 1: after the music the effects ring until 0.5 s of silence (−80 dBFS), at most tail_max_seconds · 0: cut (loop-ready) */
    uint8_t _pad[3];
    float tail_max_seconds;     /* 30 in the apps */
} vd_offline_config;
uint64_t vd_engine_offline_length(vd_engine *e, double tempo);                     /* frames of the music itself (no tail) */
uint64_t vd_engine_render_offline(vd_engine *e, const vd_offline_config *cfg,     /* frames written into left / right */
                                  float *left, float *right, uint64_t capacity);   /* capacity ≥ length + tail_max · rate */

bool vd_engine_read_telemetry(const vd_engine *e, vd_telemetry *out);             /* [main] false if no block rendered yet */
uint32_t vd_engine_pop_recorded(vd_engine *e, vd_recorded_hit *out, uint32_t max);/* [main] single consumer */

#ifdef __cplusplus
}
#endif
#endif /* VD_ENGINE_H */
