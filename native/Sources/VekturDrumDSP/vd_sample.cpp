// Vektur Drum — sample buffers handed to the engine (vd_engine.h). Built and freed off the audio thread only.
#include "vd_sample_impl.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <new>

namespace {
constexpr double kMaxSeconds = 60.0;   // 0.9: a whole break (Vektur Pulse capped samples at 30 s)
}

extern "C" vd_sample *vd_sample_create(const float *const *channels, uint32_t channel_count, uint32_t frames, double sample_rate) {
    if (!channels || channel_count < 1 || channel_count > 2 || frames < 2 || sample_rate < 1000.0) return nullptr;
    const auto cap = static_cast<uint32_t>(sample_rate * kMaxSeconds);
    if (frames > cap) frames = cap;
    auto *s = new (std::nothrow) vd_sample;
    if (!s) return nullptr;
    s->data = new (std::nothrow) float[static_cast<size_t>(frames) * channel_count];
    if (!s->data) { delete s; return nullptr; }
    for (uint32_t c = 0; c < channel_count; ++c) {
        if (!channels[c]) { delete[] s->data; delete s; return nullptr; }
        std::memcpy(s->data + static_cast<size_t>(c) * frames, channels[c], sizeof(float) * frames);
    }
    s->channels = channel_count; s->frames = frames; s->rate = sample_rate;
    return s;
}

extern "C" bool vd_sample_set_slices(vd_sample *s, const float *table, uint32_t count) {   // = web setSample(t, d, rate, table)
    if (!s || (count && !table)) return false;
    delete[] s->slices; s->slices = nullptr; s->sliceCount = 0;
    if (!count) return true;
    count = std::min<uint32_t>(count, VD_SLICES_MAX);
    auto *sl = new (std::nothrow) double[size_t(count) * VD_SLICE_FIELDS];
    if (!sl) return false;
    const double n = double(s->frames);
    for (uint32_t i = 0; i < count; ++i) {
        double *o = sl + size_t(i) * VD_SLICE_FIELDS;
        for (int j = 0; j < VD_SLICE_FIELDS; ++j) o[j] = double(table[size_t(i) * VD_SLICE_FIELDS + size_t(j)]);
        o[0] = std::min(std::max(std::floor(o[0] + 0.5), 0.0), n - 2.0);
        o[1] = std::min(std::max(std::floor(o[1] + 0.5), 2.0), n - o[0]);
    }
    s->slices = sl; s->sliceCount = count;
    return true;
}

extern "C" void vd_sample_release(vd_sample *s) {
    if (!s) return;
    delete[] s->slices;
    delete[] s->data;
    delete s;
}
