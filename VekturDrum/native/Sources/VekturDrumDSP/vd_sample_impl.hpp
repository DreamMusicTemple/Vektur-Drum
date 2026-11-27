// Vektur Drum — the sample buffer behind vd_sample (vd_engine.h). Planar float, 1–2 channels, capped at 60 s (0.9), with its slices.
#pragma once
#include "vd_engine.h"
#include <cstdint>
struct vd_sample {
    float *data = nullptr;          // planar: channel c at data + c * frames
    uint32_t channels = 0, frames = 0;
    double rate = 0;
    double *slices = nullptr;       // NEW (0.9): sliceCount × VD_SLICE_FIELDS (as the web engine's Float64Array)
    uint32_t sliceCount = 0;
};
