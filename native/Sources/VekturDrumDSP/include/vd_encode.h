/* Vektur Drum — audio file encoders (NEW 0.8). WAV (16/24-bit PCM, 32-bit float), FLAC (16/24-bit), MP3 (MPEG-1
 * Layer III CBR 32–320 kbps at 32 / 44.1 / 48 kHz, with a LAME "Info" tag for gapless, sample-exact decoding).
 * The same algorithms as the web app (web/src/encoders.js): WAV and FLAC files are byte-identical. Main thread only. */
#ifndef VD_ENCODE_H
#define VD_ENCODE_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef enum { VD_FILE_WAV = 0, VD_FILE_FLAC = 1, VD_FILE_MP3 = 2 } vd_file_format;
/* channels: 1 or 2 planar float buffers of `frames` samples (−1…1). quality: WAV 16|24|32 (float), FLAC 16|24,
 * MP3 the bitrate in kbps. Returns the file size and a malloc'd buffer in *out (free with vd_encode_free); 0 on error. */
size_t vd_encode(vd_file_format format, const float *const *channels, uint32_t channel_count, uint32_t frames,
                 uint32_t sample_rate, uint32_t quality, uint8_t **out);
void vd_encode_free(uint8_t *p);
#ifdef __cplusplus
}
#endif
#endif
