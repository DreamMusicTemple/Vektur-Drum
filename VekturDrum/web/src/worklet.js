/* Vektur Drum — AudioWorklet processor. host.js prepends the parameter table and drumsMakeEngine(), so this file
   holds only the processor around the engine. Drum ops are Vektur VJ's protocol plus 'n' (track count) and the
   step's FM ratio ('s' field 13), NEW ring fields ('s' 14–18), step fold ('s' 19), shift + spectral ('s' 20–24), 0.9 Metalise / slice / reverse / stutter chance ('s' 25–28; 'P' = [bars, Slicer, then 25 fields per step for 12 tracks]); 'hs' slice pads, 'B' a pattern's Slicer,
   NEW 'W' mod wire [slot, src, dense param index, amount] and 'L' slicer slot [slot, action, permute source].
   In Vektur VJ the drums render inside the Vektur Spectra synth's worklet; here they are the only thing in it.
   Messages in: {dr:[op,...]} (Vektur VJ's own drum protocol, extracted) · {m:[st,d1,d2]} MIDI · {tempo:bpm}
   Messages out, every 4 blocks: {dtel, drec} — the same telemetry the Vektur VJ panel reads. */
class VekturDrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const Drums = drumsMakeEngine(DRUM_PARAMS, DRUM_DIV_BEATS, DRUM_NOTES, DRUM_DEF_DIV);
    this.r = new Drums(sampleRate); this.n = 0;
    this.port.onmessage = e => { const d = e.data;
      if (d.m) { if (this.r.takes(d.m[0])) this.r.midi(d.m[0], d.m[1], d.m[2]); }
      // Standalone clock: the engine's beat runs free at this tempo, sample by sample. (Vektur VJ instead sends
      // setTempo(bpm, beat), which also pulls the engine's beat toward the VJ clock.)
      if (d.tempo) this.r.tempo = Math.fround(d.tempo);
      if (d.panic) { for (const w of this.r.v) w.active = false; this.r.clearFx(); }
      if (d.dr) this.r.op(d.dr);   // the drum protocol lives in the engine (Drums.op): the offline export uses it too
    };
  }
  process(inputs, outputs) {
    const o = outputs[0]; if (!o || !o[0]) return true;
    const L = o[0], R = o[1] || o[0];
    L.fill(0); if (R !== L) R.fill(0);   // the engine adds into its buffers
    const ip = inputs && inputs[0], iL = ip && ip[0];   // NEW (0.8): the insert input, when an audio input is connected
    if (iL && iL.length === L.length) this.r.render(L, R, L.length, iL, ip[1] || iL); else this.r.render(L, R, L.length);
    if (++this.n >= 4) { this.n = 0; const r = this.r;
      this.port.postMessage({ dtel: r.enabledFlag ? r.tel : null, drec: r.recQ.length ? r.recQ.splice(0) : null }); }
    return true;
  }
}
registerProcessor('vektur-drum', VekturDrumProcessor);

