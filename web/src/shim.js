/* Main-thread stand-ins for the AudioWorklet globals, so the same processor can also run on a ScriptProcessorNode
   when a page's security policy blocks AudioWorklet modules (host.js decides which one runs). */
var sampleRate = 48000, VD_PROCESSOR = null;
class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage: m => { if (this.port.toHost) this.port.toHost(m); } }; } }
function registerProcessor(name, cls) { VD_PROCESSOR = cls; }
