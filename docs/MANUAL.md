# Vektur Drum — User Manual

_Generated from web/src/manual.js (the same text as SETTINGS → MANUAL in the web and native apps)._

## Welcome

Vektur Drum is a twelve-track drum machine and breakbeat sampler. Every track can be a **drum synth** (eight analogue-style models), a **sample** you load — sliced in the **BREAK LAB**, so any step can play any slice — or a dedicated **FM percussion** voice. Each track has a vintage-sampler character: **METALISE** and **RESAMPLE** with six sampler models. **GENERATE** writes whole songs in seven genres. A step sequencer with eight patterns, per-step **ring modulation** and **fold**, a **4-band EQ** on every track, per-step **pitch shift** and **spectral** effects, **Metalise** (in the Slicer window), the **Slicer**, delay, four **reverbs** (Room, Spring, Gate, Expanse), **tape & vinyl**, **TEMPER** and **HUMANISE** complete it — the App Store app also runs as an **AUv3 effect** on any track — and a **modulation matrix** lets three LFOs, an envelope follower and a chaos generator move any dial, with a light on each dial showing where it is.

**First sound:** tap anywhere to start the audio, then press **PLAY**. Pattern 1 has a starter groove. Load a kit from **PRESETS** to hear what it can do — there are 88, among them 10 each of IDM, Techno, Lo-Fi & Downtempo, Hard Trance & Psytrance, 80s Electro, Breakbeat and Ambient — or start from **INIT**, a blank kit — then open **SLICER**, tap JUNGLE and turn it ON.

## What's new in 0.9.1

- **Touch and hold any dial** to modulate it: add LFO 1–3, the env follower or chaos, set each wire's depth, invert or remove it. The MOD list updates with it (*Modulation*).
- The **Metalise ON** switch can be automated: hold it to wire an LFO to it, or give it a **CHANCE** per 1/16, 1/8, 1/4 or bar (*Metalise and LFOs*).
- **Draw your own LFO shape**: the LFOs' new **Draw** shape, 16 points you draw with a finger (*Metalise and LFOs*).
- **LONG** beside Decay: sounds ring for up to 60 s, for drones and slow textures (*Tracks and engines*).
- **UNDO / REDO** (↶ ↷ left of ON, or Ctrl/⌘-Z and Shift-Ctrl/⌘-Z) for every edit, without stopping the music.
- The Slicer window chooses which **patterns 1–8** it slices (*The Slicer*).
- Better **transient types** in the BREAK LAB: each hit is judged against the others, so a break's kicks, snares, hats and ghosts are told apart (*BREAK LAB*).
- Imported samples get a short, readable **name on their pad and track** (the full name shows when you point at it).
- Two new **step designs**, Glass and Neon ring (Settings → APPEARANCE); **Interstellar** is now the default dial design.
- The track **EQ** now sits above **TAPE** in the effects column, and the DMT Cymatics logo is in the top strip and About.

## What's new in 0.9

- **12 tracks and 12 pads** (TRACKS 6–12), with MIDI notes for tracks 10–12 (*MIDI*).
- **BREAK LAB** — a sample editor for every track: transients found automatically (and placed, moved, accepted or rejected by hand, with undo), tempo detection, slices by transient, equal parts, beat, bar or grid, and each slice's own pitch, gain, pan, attack, gate, reverse, stretch, stutter and Metalise (*BREAK LAB*).
- Any step can play **any slice**; per-step **reverse** and **stutter chance**; slice pads that record into the pattern; slices sent across tracks or split into kick / snare / hat / ghost lanes (*Slices on steps, pads and tracks*).
- The **groove generator** — 16 variations at a time from the break's own hits: lock the kick, randomise the snares, mutate only the ghosts, and choose how extreme (*Groove generator*).
- **TEMPO LOCK** and **STRETCH**: a sample follows the master tempo by time-stretching that keeps its attacks (*Tune modes and time-stretch*).
- **METALISE** and **RESAMPLE** per track and per step, six **sampler models** and four **transient modes**; RESAMPLE TRACK renders a track into a new sample you can slice again (*Vintage sampler: METALISE and RESAMPLE*).
- Each pattern can turn the **Slicer** on or off for itself (*The Slicer*).
- **GENERATE** — whole songs in DnB, Jungle, Dub Techno, TripHop, Hip Hop, Trance and House (*Generate a song*). **EXPORT MIDI** writes the pattern or chain as a MIDI file.

## What's new in 0.8

- **EXPORT** — the master or stems as WAV, FLAC or MP3: the whole chain when CHAIN is on, otherwise the selected pattern (*Export*).
- **TEMPER** (warm ↔ neutral ↔ cold, replaces Warmth) and **HUMANISE** (timing, ghost notes, embellishments) on the master (*Master: TEMPER and HUMANISE*).
- Per-step **PITCH SHIFT** and **SPECTRAL** effects on any engine (*Programming steps*).
- Reverb types **Room, Spring, Gate, Expanse** — Expanse washes at 90–95 % and freezes at 95–100 % (*Reverb types*).
- **METALISE** (the old glitch's metallic stretch) now lives in the Slicer window; the main screen's Glitch section is gone and the LFOs move Metalise (*Metalise and LFOs*).
- The **chain** moved to the BARS row as coloured chips you drag to reorder; drag pattern buttons in to insert (*Playing and patterns*).
- The **pads window** (⤢): movable, resizable, full screen. Clearer section titles; the effects in their own dark grey area, every other section its own shade.
- **INIT** (a blank kit) and 30 new kits: 10 80s Electro, 10 Breakbeat, 10 Ambient — 88 in all, the new ones with their own tempo.
- 10 more **dial designs** (Settings → APPEARANCE) and the **AUv3 effect** Vektur Drum FX in the App Store app (*Insert effect*).

## The panel at a glance

- **Top strip** — the logo and name, TRACKS 6–12 (how many tracks this project uses), **↶ ↷** (undo and redo), ON (power), PRESETS, **SLICER** (its own window, with **Metalise**; lit when either is on), **MOD** (the modulation window), **BREAK LAB** (the sample editor), **GENERATE** (a whole song), **EXPORT** (audio files), SETTINGS.
- **Transport** — PLAY (starts on the next beat), STOP, REC (records pad hits and MIDI notes into the pattern while playing).
- **Display** — pattern, loop or chain position, tempo, current step, selected track.
- **Pattern** — patterns 1–8; COPY, PASTE, CLEAR and **SLICER: SONG / ON / OFF** for the selected pattern; then **BARS** (1, 2 or 4) and the **CHAIN** on one row.
- **Master** — Tempo, Swing, **TEMPER** (warm ↔ cold), **HUMANISE**, Level.
- **Sequencer** — one row per track: name, M (mute), S (solo), 16 steps, length and timing division.
- Below the sequencer, four columns: **Performance** (a pad per track — 4 × 3 with 12 tracks; **⤢** opens them in their own window); **Sound** — the selected track; **Step** (the selected step, and its RING MOD) over the track's **EQ**; **Effects** (delay, reverb, MIDI channel) over **Tape**. Every section has a clear title with a coloured bar; the effects sit in a dark grey area of their own; every other kind of section has its own shade of grey.
- **LFO 1–3** along the bottom. The small coloured chip on each LFO is a modulation source you can drag onto any dial.

The signal runs: tracks (EQ, then ring modulation) → delay and reverb → **Metalise** → **Slicer** → **tape & vinyl** → **TEMPER** → level. (Each step's pitch shift and spectral effect work inside its track, before the EQ.) On narrow screens the columns stack.

## Playing and patterns

**Pads:** higher on a pad plays harder. Tapping a pad also selects its track. **⤢** (top right of PERFORMANCE) opens the pads in a window of their own: drag its title bar to move it, its corner to resize it, **⛶** to fill the screen. The pads grow with the window and play several at once; the window remembers where it was.

**Patterns:** tap 1–8 to select. While playing, the new pattern starts when the current one ends. **BARS** sets the pattern's length; each track repeats its own steps inside it.

**Chain** (on the BARS row): the chain is a strip of coloured chips, one colour per pattern. **+ n** adds the selected pattern at the end, or **drag a pattern button** (1–8) onto the strip to insert it exactly where you drop it. **Drag a chip** sideways to move it, tap its **×** to remove it, tap the chip to edit that pattern; CLEAR empties the chain. Up to 16 positions. **CHAIN** switches between playing the chain and looping one pattern; while it plays, the chip playing now lights up.

**Recording:** light **REC**, press PLAY, and play pads or MIDI notes: each hit is written to the nearest step.

## Programming steps

Tap a step to switch it on or off. **Hold** a step (or turn **EDIT** on and tap) to edit it in the STEP section:

- **Velocity, Pan, Pitch** (±12 semitones), **Ratchet** ×1–×4 (repeats inside the step).
- **Crush** (bit depth), **Delay** and **Reverb** sends (added to the track's), **Fold** (this step's own wavefolder: from a little warmth to a buzzing, metallic edge — any engine), **Chance** (probability of playing each time round).
- **FM ratio** (FM tracks only): this step's own modulator ratio — melodic and metallic variations from one sound. TRACK = use the track's Ratio.
- **RING MOD…** — opens the ring modulator for this step (see *Ring modulation*).
- **PITCH SHIFT** — *Shift* (±24 semitones) and *Mix*: a pitch-shifted copy of this step's sound, any engine (synth, sample, FM). Mix 100 % is the shifted sound alone; lower mixes it with the original — +12 or +7 at 30 % is a shimmer.
- **SPECTRAL** — *Spectral* (amount), *Colour* and *Mix*. Colour is six manipulations in one dial, and where it sits inside each sets that manipulation's own setting: **SMEAR** (blurs the spectrum over time), **SHIFT** (moves every partial up — metallic, inharmonic), **HARMONIC** (keeps only a harmonic comb), **ROBOT** (flattens the phases into a buzzing monotone), **WHISPER** (keeps the spectrum, randomises the phases — breath and noise), **FREEZE** (holds the spectrum and lets it decay slowly). The display under the dial names the zone and its setting. Spectral then sets how far it goes.

Small marks on a step show its ratchet, pitch, chance and FM ratio; a cyan dot means it has its own effects; an amber ring means it ring-modulates.

**Length & DIV** (right of each row): each track can have 1–16 steps and its own timing (1/4 to 1/32, triplets, dotted) — for polyrhythms and shifting loops. **Swing** delays every second step.

## Ring modulation

Every step can ring-modulate other tracks. Select a step and tap **RING MOD…**:

- **RING ON** — when this step plays, the ring is active for the length of the step.
- **Master** — the modulator: one of the tracks (T1–T9) or **OSC**, a pure sine oscillator. A master track is level-normalised, so even a quiet hat modulates fully; the master itself is not changed.
- **Slaves** — the tracks that get multiplied by the master. ALL and NONE set them quickly.
- **Amount** — from dry to fully ringed. **Osc** (with OSC master) — 20 Hz–5 kHz: low is tremolo, high is the classic clangy ring-mod.
- **COPY TO TRACK** — the same ring settings on every active step of this track.

Try: master T1 (kick) with slaves the hats — the hats take on the kick's body and pitch; or OSC at 700–1500 Hz on a snare for metallic jungle snares. Ring steps on different steps make the effect move through the bar.

## Tracks and engines

Select a track (its name or pad); the SOUND section shows it. Choose its engine: **SYNTH**, **SAMPLE** or **FM**.

- **SYNTH** — Kick, Snare, Closed hat, Open hat, Clap, Tom, Rim, Bell. *Tone* and *Snap* shape each model (snap is the click / noise).
- **SAMPLE** — touch and hold a track name or pad (or LOAD SAMPLE…) to load a WAV or FLAC (up to 30 s). Tune, Decay (full = play to the end), Tone (low-pass), Sweep, Bits, Rate and the sends shape it. Samples are saved with the project. Its pad and track show a short form of the file name ("Amen Brother Break.wav" → AMEN BRT); point at it for the full name.
- **FM** — see below.

Every engine has: **Tune**, **Decay**, **Level**, **Pan**, **Bits** and **Rate** (lo-fi), **Delay/Reverb** sends, **Sweep** and **Bend**.

**LONG** (beside Decay) multiplies Decay by 20: a hit can ring for up to **60 s** — drones, slow swells, long bells and 808 tails. The dial then reads *Decay ×20* in seconds; on a sample at its top it plays to the end however long the sample is. LONG is saved per track and can sit on any engine.

**Pitch sweep:** each hit starts *Sweep* semitones away (up to ±48) and glides home over *Sw time* — punchy kicks, zappy toms, laser percussion. **Bend** is a fixed offset, or a wobble at *Bend rate*.

**Choke groups A–D:** tracks in the same group cut each other off — put a closed and an open hat in the same group. Tracks 3 and 4 start in group A.

**EQ:** every track has a 4-band EQ (in the EQ section, for the selected track): **LO** shelf 20–500 Hz, **LO-MID** and **HI-MID** peaks (80 Hz–5 kHz, 400 Hz–12 kHz), **HI** shelf 1.5–18 kHz, each ±18 dB. A band at 0 dB is off; the curve shows the result, FLAT resets it. Every frequency and gain is a modulation destination — an LFO on a mid band's frequency makes a moving, phaser-like tone; the envelope follower on a hat's HI gain makes it open up with the kick.

## The FM engine

Three sine operators for percussion: a **carrier** at *Freq* (× Tune), a **modulator** at *Ratio* × the carrier, and a second operator at *Ratio 2*.

- **Algorithms** — CLASSIC (modulator → carrier: kicks, toms, bells), STACK (op 2 → modulator → carrier: richer, more aggressive), PARALLEL (both modulators → carrier: complex, noisy), METAL (classic × a ring-modulating op 2: inharmonic cymbals and hits).
- **Index** — how strongly the modulator bends the carrier (brightness); **Mod decay** — how fast that brightness falls after the hit.
- **Feedback** — the modulator modulates itself: from grit to noise.
- **Fold** — a wavefolder after the carrier: adds harmonics, from warmth to buzz.
- **Noise** — a noise layer following the envelope (snares, hats); **Click** — a short noise transient; **Bright** scales the index.

Non-whole ratios (1.41, 2.76, 3.5) give metallic, bell-like and inharmonic tones; whole numbers sound tuned.

## Metalise and LFOs

**METALISE** lives in the **Slicer window**, to the right of the Stutter dial. It is the classic metallic sampler time-stretch: short grains replayed from a source that keeps falling behind, at 12-bit. Its **Character** dial adds the vintage-sampler grain of the track METALISE to it (*Vintage sampler*). The grain length rings as a metallic pitch. Turn it **ON** and set **Mix**, **Grain** (3–60 ms: short grains are higher and harsher) and **Stretch** (lower smears more). It works on the whole kit after the delay and reverb, before the Slicer. (Older kits that used the earlier glitch's Stutter or Reverse modes still play them; pressing Metalise switches them to Metalise.)

**LFO 1–3** (the row along the bottom) each move Metalise's Mix, Grain or Stretch: choose a shape (sine, triangle, saw, square, S&H random), a Depth (it starts at 0 — turn it up), and a Rate in Hz or — with SYNC — a beat division from 4 bars to 1/16. The light shows the LFO moving. The LFOs always run, and are also sources in the modulation matrix: drag the LFO's chip onto any dial (its Metalise Depth doesn't affect the wires).

**Draw:** choose the shape **Draw** and a small canvas appears under the LFO (here and in the MOD window): drag across it to draw 16 points; the LFO glides between them. SINE, RAMP, STEPS, RANDOM and FLAT start you off. The drawn shapes are saved with the song and the kit.

**Automating Metalise ON:** touch and hold the Metalise **ON / OFF** button. Add an LFO (or the env follower or chaos): Metalise switches on while it is above the middle — invert it to switch off instead. **CHANCE** makes Metalise come and go by itself while it is ON: each 1/16, 1/8, 1/4 or bar it plays with that chance, with short fades so nothing clicks. A wired or chanced button shows a ring.

## Vintage sampler: METALISE and RESAMPLE

The **SAMPLER** row of the SOUND section gives every track the character of a vintage sampler. Both dials start at **OFF**, where the track's sound passes untouched.

- **Metalise** — 16-bit sampler grit that grows as you turn it: transient-dependent saturation, pre-emphasis, sample-rate and bit reduction (smooth interpolation at first, then hard sample-and-hold), converter curvature, de-emphasis, two short metallic resonances and a soft clip. Low settings add bite and air; the top end is hard, ringing and aliased. A step can have its own amount (STEP → SAMPLER → Metalise; TRACK follows the slice or the track), and so can a slice; changes glide over 2 ms, without clicks.
- **Resample** — the track through a sampler's converter: anti-alias filter, emphasis, a lower rate with sub-sample timing, quantisation, converter curve and noise, reconstruction and output filter. 25 % is a gentle 16-bit pass, 50 % the model's own rate and bits, 75 and 100 % lower still.
- **Model** — six converters: *12-bit 26k* (sample-and-hold, dark and gritty), *12-bit 40k*, *16-bit 44k* (clean), *16-bit 32k*, *8-bit 22k* (drop-sample, no input filter: aliasing) and *8-bit 11k*.
- **Transient** — what RESAMPLE does to attacks: **Preserve** lets them through clean, **Round** softens them, **Crush** crushes them harder, **Rebuild** lets each attack through and fades the resampled sound back in over 8 ms. **T.Sens** sets how readily an attack is detected. There is no lookahead: nothing is delayed.

**RESAMPLE TRACK → NEW SAMPLE** (in the BREAK LAB) renders the track as it sounds now — engine, Metalise, Resample, EQ and slices, without the sends — over the pattern or chain into a new sample, loads it on the track and slices it. Its Metalise and Resample are then set to off, so nothing is applied twice; resample again for more. It is rendered offline: no feedback, nothing builds up.

## BREAK LAB

**BREAK LAB** (top strip, or the button in a sample track's SOUND section) is a sample editor for each track. Choose the track with the numbers along the top; **LOAD SAMPLE…** loads a WAV or FLAC (up to 60 s). Its transients are found at once and given a type: every hit is compared with the others, so the darkest group is called kick, the brightest hat, the rest snare (or ghost when quiet) — a full break gets all four.

- **Waveform** — zoom with − / + / FIT, the mouse wheel or a pinch; scroll with the bar below. Markers are coloured by type (kick, snare, hat, ghost); dashed ones are rejected. **Drag** a marker to move it; **double-tap** (or touch and hold) to add one; **+ MARK**, **DELETE**, **REJECT / ACCEPT** and **ACCEPT ALL** edit them, and a marker's type can be changed. **UNDO / REDO** cover every edit.
- **DETECT** finds transients again from **Sens** (more or fewer) and **Threshold** (the shortest gap): your own markers stay. Detection looks at loudness, onsets, energy and spectral change, then moves each marker back to where its attack starts.
- **BPM** — the sample's tempo, found from its pulse (FIND BPM), or type it. It makes Beat, Bar and Grid slicing and TEMPO LOCK work.
- **Slice by** — **Transient** (the accepted markers), **Equal** parts, **Beat**, **Bar** or **Grid** (1/4, 1/8, 1/16, 1/32, 1/8T, 1/16T). Up to 32 slices; a slice that starts where one started before keeps its settings.
- **The selected slice** — Pitch, Gain, Pan, Attack, **Gate** (how much of it plays), **Stretch** (its length without changing pitch), **Stutter** (repeats of its start) and its length, **Metalise**, **REVERSE** and its type. ▶ AUDITION plays it.

## Slices on steps, pads and tracks

- **SLICE PADS** — one per slice: tap to play (higher = harder). With **REC** lit and the pattern playing, the slices you play are written into the steps.
- **Steps** — on a sample track, STEP → SAMPLER → **Slice** chooses the slice a step plays (TRACK = the track's **Slice** dial). **Rev %** and **Stut %** are the chance the hit plays backwards or stutters (2–3 × 1/32).
- **SEND → TO STEPS** lays the slices out on the track's steps in order. **ACROSS TRACKS** gives one slice to each track from this one (**APPEND**: only into empty tracks); **SELECTED → NEXT TRACK** sends one; or **drag a slice pad onto a track number**. **BY TYPE → 4 LANES** puts kicks, snares, hats and ghosts on four tracks, each playing its own slices.
- **EXPORT MIDI** writes the pattern (or the chain) as a MIDI file: drum notes on channel 10; a slice lane as notes 36 + slice, so a sampler can play the same chops. **EXPORT WAV…** opens Export.

## Groove generator

Under the slice pads, the **GROOVE GENERATOR** makes new rhythms from the break's own hits — the starting point is always where they fall in the break, so it keeps its character.

- **GENERATE 16** — sixteen variations at once, from close to the original to far away; press again for sixteen more. Tap one to put it in the selected pattern.
- **Extreme** — how far they wander. **LOCK KICK** keeps every kick where it is; **RANDOM SNARES** swaps and slides the snares; **MUTATE GHOSTS** adds, removes and changes ghost notes. At high settings any hit can borrow another slice.
- **Reverse %** and **Stutter %** give every step of a variation a chance of reversing or stuttering.
- **TO THIS LANE** plays the variation on this track alone (each step its slice); **TO 4 LANES** splits it into kick / snare / hat / ghost tracks.

## Tune modes and time-stretch

A sample track's **Tune mode** (SOUND → SAMPLER) decides what Tune does:

- **Rate** — like a tape: higher is shorter and faster (the classic sampler way).
- **Stretch** — Tune changes the pitch only; the length stays, times the **Stretch** dial (×0.5–×2).
- **Tempo lock** — the sample follows the master tempo from its own BPM (set in the BREAK LAB): a 170 BPM break at 85 BPM plays at half speed, at the same pitch.

Stretching keeps attacks intact: the first 12 ms of every slice play exactly as recorded and the rest is time-stretched in short overlapping grains aligned to the waveform. Each slice can also have its own Stretch. The stretched slices are prepared outside the audio — moving Tune or the tempo updates them within a second.

## Generate a song

**GENERATE** (top strip) writes a whole song: pick a genre — **DnB, Jungle, Dub Techno, TripHop, Hip Hop, Trance or House** — and it sets the tempo, voices the kit for it, writes eight patterns (intro, groove, variation, fill, breakdown, build, drop, outro) and a chain that plays them as an arrangement. Every press rolls a new **seed**; **AGAIN** repeats the last one, **NEW SEED** makes another. If a track has a sliced break, DnB, Jungle, TripHop and Hip Hop chop it in, tempo-locked (**USE BREAK**). Your samples stay in the project.

## Tape and vinyl

The **TAPE** section ages the whole mix, after the Slicer. All three start at OFF.

- **Wow** — slow pitch drift, like a stretched cassette (a slow wave plus a random wander, so it never repeats exactly).
- **Flutter** — fast, fine wobble from an uneven tape transport.
- **Dust** — vinyl crackle and a warm hiss; more Dust means more and louder crackles. It keeps crackling even when nothing plays.

Lo-fi starting point: Wow 30 %, Flutter 25 %, Dust 40 %, Warmth up, track Bits 10–12 and the HI EQ band down a few dB. All three can be modulated — chaos (Drift) on Wow gives a tape that slowly loses its way.

## Master: TEMPER and HUMANISE

**TEMPER** changes the character of the whole kit with one dial. At its centre, **NEUTRAL**, it does nothing at all — the sound passes untouched and it uses no processing. Turn it left for **WARM**: a gentle, slightly asymmetric saturation (vintage colour), a softer top end and rounder attacks. Turn it right for **COLD**: a cleaner, harder, more mechanical sound — sharper attacks and a brighter top; near the far right a faint metallic edge. It is not a distortion: even at the ends it stays a colour. Old projects and kits that used **Warmth** open with the same amount of warm TEMPER.

**HUMANISE** makes the sequencer play like a person. At **OFF** (0 %) the sequencer plays exactly as written. Up to 25 %: tiny timing differences, felt more than heard. Around 50 %: a relaxed, clearly human feel. From 50 % quiet **ghost notes** begin to appear on free steps next to your hits; around 75 % the timing is loose and obvious and ghosts are frequent; towards 100 % some ghosts become quick doubles and triples. Your pattern is never changed and ghosts are never recorded; the rhythm always stays recognisable. Mute, solo, chokes and ratchets all still apply.

## Reverb types

EFFECTS → **Reverb** chooses the reverb every track's Reverb send goes to:

- **Room** — the original reverb.
- **Spring** — a tank of springs: drippy, twangy, dub.
- **Gate** — a dense room cut off after a hold (Size sets it, 60–560 ms): the 80s snare.
- **Expanse** — a huge space for slow, ambient and downtempo music. Size sets its length; from 90 % to 95 % (**WASH**) the tails become long, overlapping, evolving washes; from 95 % to 100 % it approaches a **FREEZE**, which holds whatever is in the reverb indefinitely (stop sending to it and it hangs in the air).

## Insert effect (AUv3) and audio input

In the App Store app, Vektur Drum also appears as an **effect** (Vektur Drum FX) you can insert on any track or bus in GarageBand, Logic, Cubasis, AUM… The incoming audio goes through the delay and reverb sends, Metalise, the **Slicer**, tape and TEMPER — with the drums playing too, or with DRUMS OFF as a pure effect. In this web app, **Settings → INSERT INPUT** does the same with an audio input (use headphones with a microphone). Input sets its level, Delay and Reverb its sends.

## The Slicer

The Slicer is the last effect on the master: it records everything you hear and rearranges it in time. Open it with **SLICER** in the top strip and turn it **ON**. Each pattern can decide for itself: **SLICER: SONG** (in the PATTERN section) follows the switch, **ON** slices that pattern even when SLICER is off, **OFF** keeps it dry when SLICER is on — so a chain can drop in and out of the Slicer part by part. The **PATTERNS** row at the top of the Slicer window does the same for all eight at once: tap a pattern to cycle SONG → ON → OFF; a lit pattern is being sliced.

**Cycle and slices:** the cycle is **1 or 2 bars**, cut into slices of **1/32, 1/16, 1/8 or 1/4** (at most 32). The program has one action per slice; the lit slice is the one playing.

- **THRU** — unchanged. **REPEAT** — plays the slice before again. **STUTTER** — re-triggers the start of the slice ×2 to ×8 (*Stutter*).
- **REVERSE** — the same slice of the previous cycle, backwards. **TAPE STOP** — slows to a halt over *Tape* of the slice. **TAPE START** — spins up from stopped.
- **PITCH** — transposes by *Pitch* semitones (−24…+24; down slows, up reads ahead from the slice before). **SPEED** — plays at *Speed* ×0.25–×2.
- **GATE** — silence. **PERMUTE** — plays another slice in its place (choose which below the palette; an earlier slice comes from this cycle, the same or a later one from the cycle before). **SCRATCH** — back and forth through the slice before. **ECHO** — the slice plus the one before, layered.

**Editing:** tap a slice to select it, then tap an action — the selection moves on, so you can type a program. **GENERATE** fills the program in a style: SUBTLE (mostly through, small moves at bar ends), JUNGLE (repeats, stutters and permutations at 1/16), GLITCH (1/32 stutters, gates, scratches), TAPE (stops at the bar end, spin-ups), CHAOS (anything). SHIFT rotates it, MIRROR reverses its order, CLEAR resets.

**Mix** blends the sliced sound with the original. **Density** plays only some of the actions (the rest pass through); **Evolve** replaces some slices with random actions. Both are rolled again every cycle from **Seed**, so the same seed always gives the same variations — NEW SEED picks another.

**Hold pads** (1–6: Stutter, Reverse, Tape stop, Pitch, Gate, Scratch) take over from the moment you press them until you let go — for live drops and fills. Pressing one also turns the Slicer on.

**Modulation:** every Slicer dial is a destination — drag a source chip onto it. Ideas: a synced LFO on Density for slicing that breathes; Chaos on Evolve for programs that never settle; the envelope follower (kick) on Mix; an S&H LFO on Seed for a new variation every cycle; an LFO on Pitch for tape warble.

## Modulation

Five sources can move any dial: **LFO 1–3**, the **Env follower** and **Chaos**. Open the MOD window with **MOD**.

- **The MOD window** floats over the panel: drag its title bar to move it anywhere, drag its bottom corner to resize it, **A−** / **A+** scale its contents, **—** folds it down to just the five source chips (a palette you can park anywhere), **◧** / **◨** dock it to the left or right edge and **❐** floats it again. It remembers where you left it. It also holds the settings of all five sources, LFOs included.
- **Drag and drop** — drag a source chip (in the window, on each LFO, or in the Slicer window) onto any dial in the panel or onto a destination in the window's list. Move the window out of the way of the dial you want. The wire appears in the **wire list**.
- **Touch and hold** any dial (or the Metalise ON button) — a small window opens for that dial: tap a source to add it, set its Depth, INV or ✕ it; OPEN MOD LIST shows the whole matrix. Everything you do there appears in the wire list.
- **Tap, then tap** — tap a chip, then tap any dial. Tap the chip again or press Esc to cancel. (Docked, the window steps aside while a source is picked.)
- **Wire list** — each wire has its source (change it there), its destination, a **Depth** (−100…+100 %), **INV** (invert) and ✕ (delete). Up to 32 wires; CLEAR ALL removes them.
- **Destinations** — every continuous dial: all track sounds (tune, decay, FM index, fold, EQ…), master, effects, Metalise, the Slicer, tape, the LFOs themselves (LFO rate by chaos!) and the env follower. Wired dials show a pink ring.
- **See it move** — every dial a source is moving carries a light on its rim, in the source's colour, showing where the modulation has it right now. The Metalise dials show their own LFOs (Mix, Grain, Stretch) the same way while Metalise is on.

A wire moves a dial by Depth × the source, as a share of the dial's whole travel — so it feels the same on every dial, and never goes past its ends. The dial you see stays where you set it; the modulation is added in the engine. Several wires on one dial add up.

**Env follower:** follows the level of the master or one track (*Input*), with *Attack*, *Release* and *Gain*. Use it for ducking (negative depth on a pad's level, input the kick), or to make hits push effects. **Chaos:** LORENZ (smooth, never repeats), LOGISTIC (stepped jumps at *Rate*), DRIFT (a slow random walk).

## Kits, presets and banks

**PRESETS** holds 88 factory kits, **INIT · blank kit** (every parameter at its default, empty patterns, no samples) and your own. Filter the factory kits by style: IDM, TECHNO, LO-FI & DOWNTEMPO, HARD TRANCE, PSYTRANCE, 80s ELECTRO (808 grooves through the Gate reverb), BREAKBEAT (funk breaks, ghost notes, the Slicer), AMBIENT (slow and sparse, the Expanse reverb, spectral smears and shimmer), or MORE (house, breaks, jungle, D&B, trap and others). The genre kits show off everything: polymeter, ring and fold steps, EQ, Slicer programs, tape and modulation wires — set the tempo to taste (around 125–135 for IDM and techno, 75–90 for lo-fi, 138–150 for trance). The 80s Electro, Breakbeat and Ambient kits bring their own tempo (Ambient 58–84 BPM); in a host the plug-in follows the host's tempo.

A kit is the sound of all tracks, Metalise, the Slicer, modulation wires and effects, the 8 patterns (with their ring steps) and the chain. Tap a kit to load it; tap an empty slot to save the current kit. Kits from Vektur VJ (Vektur Pulse) load into tracks 1–6.

**YOURS** has two kinds of storage:

- **Set** — 16 slots saved with the project (they travel with it).
- **Banks 01–20** — 20 banks of 99 presets each, kept on this device and available in every project (in the iOS app, shared between the app and the plug-in). Pick a bank in the list or with ◀ ▶; RENAME BANK, EXPORT BANK, SET → BANK (copies the set's kits in), CLEAR BANK. A selected preset can be copied between the set and a bank.

**Export** saves kits (with their samples) as a .json file; **Import** adds a file's kits to the empty slots of the set or the bank on show. Your MIDI channel is never changed by a kit.

## MIDI

Notes on the drum channel (default 10) play the tracks: 36, 38, 42, 46, 39, 45, 37, 56, 49, 50, 51, 54 for tracks 1–12. Every parameter can be moved by a MIDI CC — including the Slicer (its Hold is great on a footswitch), the env follower and chaos: see **Settings → Parameters & CC** for the full list and the factory map (for example CC 20–28 track levels, CC 51 Metalise mix).

**MIDI learn:** Settings → MIDI → Enable MIDI learn, then tap a knob and move a control on your device. Or press LEARN next to any parameter in the list. Web MIDI works in Chrome and Edge; Safari has none — the App Store app supports MIDI and Bluetooth MIDI.

## Export: master and stems

**EXPORT** (top strip, or Settings → PROJECT → EXPORT AUDIO) renders your music to audio files — offline, faster than real time, while the music keeps playing.

- **What is exported:** with **CHAIN** on (and a chain set), the **whole chain** once, position by position; with CHAIN off, the **selected pattern** once. The window shows exactly what, how many bars and how long at the current tempo.
- **MASTER** — the full mix, as you hear it. **STEMS** — one file per track that plays in those patterns (muted tracks are left out), each with every other track muted, so each stem carries its own share of the delay, reverb, Metalise, Slicer, tape and TEMPER. All stems have the same length and start together, so they line up in any DAW; with a neutral TEMPER and no Metalise, Slicer or tape they add up to the master exactly. Stems are saved together in a .zip (the App Store app writes a folder).
- **Format:** **WAV** (16-bit, 24-bit or 32-bit float), **FLAC** (16 or 24-bit, lossless — about half the size of WAV) or **MP3** (128, 192, 256 or 320 kbps). **Rate:** 44.1 or 48 kHz. MP3 files carry a gapless tag, so players that read it start and stop on the exact sample.
- **Tail:** **RING OUT** lets the delay, reverb and effects die away after the last bar (until silence, at most 30 s — an Expanse freeze is cut at 30 s); **CUT** stops exactly at the end, for loops.

Tempo, swing, HUMANISE, chance, modulation and every effect are rendered as you hear them; the random parts are seeded, so a re-export and the stems match the master. In the Claude preview, audio files are delivered inside a .zip.

## Saving your work

Everything autosaves in this browser. To make audio files, see *Export*. **Settings → PROJECT** saves a project file (all sounds (EQ and tape included), patterns with ring and fold steps, chain, tempo, Slicer program, modulation wires, samples and your CC map) and opens one. Turn **Include samples** on to carry the song complete to another device. Project files from earlier versions open too.

**In a host** (the App Store app's plug-in in GarageBand, Cubasis, AUM, Logic, Drambo…), Vektur Drum saves the same song inside your project: reopening the project brings back every sound, pattern, recorded step, Slicer program, wire, automation value and MIDI CC mapping, and its samples. Each instance keeps its own song. Your banks are shared between the app and the plug-in.

## Settings

- **Sample rate** — the engine's rate; Device default suits most uses.
- **Latency** — LOW for the tightest response, BALANCED, or STABLE if you hear crackles or want to save battery.
- **Battery saving** — fewer light updates; the engine sleeps after 20 s stopped and silent.
- **Don't sleep** — keeps the screen on while performing.
- **Background audio** — keep playing in the background (as far as the browser allows).
- **MIDI input**, **MIDI learn**, and the **Parameters & CC** list.

**APPEARANCE** — 13 colour themes (Amber, Cyan Lab, Magenta, Lime Acid, Ice, Sunset, Ocean, Ruby, Gold & Ink, Neon Night, Forest, Mono, Dream Temple), or your own: pick the LED colour (lit buttons, steps, pads), the display colour (the displays and selections), the dial arc colour, the chassis tone (graphite, black, midnight blue, warm walnut, plum, moss) and the top strip (brushed aluminium, dark anodised, copper, gold). RESET returns to the theme's own colours. **Dial design**: Classic, six from Vektur Vocal (Machined, Chrome, Wood, Mecha, Porcelain, Blueprint) and four from Vektur Vortex (Interstellar — the default — Aqua, Scientific, Holo ring). **Step design**: Classic (an LED strip on a key), Glass (lit glass tiles) or Neon ring (glowing rings). Saved on this device.

## Tips

- Made a mess? ↶ undoes it (up to 60 steps), ↷ brings it back.
- Double-tap a knob to reset it. Drag up and down to turn it; arrow keys work too.
- Different track lengths (e.g. 16, 12 and 7) make grooves that evolve over many bars.
- Low Chance on hats plus a little Swing keeps a loop alive.
- Ratchets ×3 / ×4 on the last hat of a bar make rolls.
- For jungle: Slicer JUNGLE at 1/16 with Density 60 % and an S&H LFO on Seed; Metalise at 30–50 % mix; per-step FM ratios on a metal track; a ring step with OSC ≈ 900 Hz on the snare.
- Keep the Slicer's Mix below 100 % for a parallel, "doubled" feel; at 100 % it replaces the beat.
- Chaos (Drift, slow) on a few track Tunes and Decays makes a loop feel played by hand.
- Fold on just the accents of a hat or FM track adds bite exactly where you want it; Fold on a kick step gives a distorted downbeat.
- Cut the LO band of hats and percussion (−12 dB around 400 Hz) to leave room for the kick — the Techno kits do this.
- On iPad: Share → Add to Home Screen gives Vektur Drum its own full-screen icon.

Questions or bugs: [DMTcymatics@humanoid.net](mailto:DMTcymatics@humanoid.net)

