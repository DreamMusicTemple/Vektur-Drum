// Encodes a raw stereo float file with the C++ encoders: encode_cpp in.f32 rate outdir
#include "vd_encode.h"
#include <cstdio>
#include <string>
#include <vector>
int main(int argc, char **argv) {
    if (argc < 4) return 2;
    FILE *f = std::fopen(argv[1], "rb"); if (!f) return 1; std::vector<float> in; float b[2];
    while (std::fread(b, 4, 2, f) == 2) { in.push_back(b[0]); in.push_back(b[1]); } std::fclose(f);
    const uint32_t n = uint32_t(in.size() / 2), sr = uint32_t(std::atoi(argv[2])); std::vector<float> L(n), R(n);
    for (uint32_t i = 0; i < n; ++i) { L[i] = in[2 * i]; R[i] = in[2 * i + 1]; }
    const float *ch[2] = {L.data(), R.data()};
    struct { vd_file_format fm; uint32_t q; const char *name; } jobs[] = {{VD_FILE_WAV, 16, "w16.wav"}, {VD_FILE_WAV, 24, "w24.wav"}, {VD_FILE_WAV, 32, "w32.wav"}, {VD_FILE_FLAC, 16, "f16.flac"}, {VD_FILE_FLAC, 24, "f24.flac"}, {VD_FILE_MP3, 128, "m128.mp3"}, {VD_FILE_MP3, 320, "m320.mp3"}};
    for (auto &j : jobs) { uint8_t *o = nullptr; const size_t sz = vd_encode(j.fm, ch, 2, n, sr, j.q, &o); if (!sz) { std::printf("FAIL %s\n", j.name); return 1; }
        FILE *w = std::fopen((std::string(argv[3]) + "/cpp_" + j.name).c_str(), "wb"); std::fwrite(o, 1, sz, w); std::fclose(w); vd_encode_free(o); }
    std::printf("C++ encoders: %u frames\n", n); return 0;
}
