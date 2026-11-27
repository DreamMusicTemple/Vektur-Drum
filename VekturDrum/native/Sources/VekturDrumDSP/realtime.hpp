// Vektur Drum — real-time plumbing between the UI/main thread and the audio thread.
// SpscRing: wait-free single-producer / single-consumer queue of trivially copyable items (commands, recorded hits,
//           released samples). Fixed capacity, allocated up front.
// SeqlockSnapshot: one writer (audio thread) publishes a POD snapshot; readers copy it without ever blocking the
//           writer, retrying if a write happened during the copy (telemetry).
#pragma once
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

namespace vd {

template <typename T, std::size_t Capacity>
class SpscRing {
    static_assert(std::is_trivially_copyable_v<T>, "ring items must be POD");
    static_assert(Capacity >= 2 && (Capacity & (Capacity - 1)) == 0, "capacity must be a power of two");

public:
    // producer thread only
    bool push(const T &item) noexcept {
        const auto w = write_.load(std::memory_order_relaxed);
        if (w - read_.load(std::memory_order_acquire) == Capacity) return false;   // full
        slots_[w & (Capacity - 1)] = item;
        write_.store(w + 1, std::memory_order_release);
        return true;
    }
    // consumer thread only
    bool pop(T &out) noexcept {
        const auto r = read_.load(std::memory_order_relaxed);
        if (r == write_.load(std::memory_order_acquire)) return false;             // empty
        out = slots_[r & (Capacity - 1)];
        read_.store(r + 1, std::memory_order_release);
        return true;
    }
    std::size_t size_approx() const noexcept {
        return write_.load(std::memory_order_acquire) - read_.load(std::memory_order_acquire);
    }
    static constexpr std::size_t capacity() noexcept { return Capacity; }

private:
    alignas(64) std::atomic<std::uint64_t> write_{0};
    alignas(64) std::atomic<std::uint64_t> read_{0};
    alignas(64) std::array<T, Capacity> slots_{};
};

template <typename T>
class SeqlockSnapshot {
    static_assert(std::is_trivially_copyable_v<T>, "snapshot must be POD");

public:
    // single writer (audio thread): never waits
    void publish(const T &value) noexcept {
        const auto s = seq_.load(std::memory_order_relaxed);
        seq_.store(s + 1, std::memory_order_relaxed);                  // odd: write in progress
        std::atomic_thread_fence(std::memory_order_release);
        copyIn(value);
        std::atomic_thread_fence(std::memory_order_release);
        seq_.store(s + 2, std::memory_order_release);                  // even: stable
    }
    // any reader: returns false if nothing was published yet, or the writer kept it busy for every attempt
    bool read(T &out, int attempts = 8) const noexcept {
        for (int i = 0; i < attempts; ++i) {
            const auto a = seq_.load(std::memory_order_acquire);
            if (a == 0) return false;
            if (a & 1u) continue;
            copyOut(out);
            std::atomic_thread_fence(std::memory_order_acquire);
            if (seq_.load(std::memory_order_relaxed) == a) return true;
        }
        return false;
    }

private:
    // word-wise relaxed atomic copies: no data race in the C++ memory model, no tearing within a word
    static constexpr std::size_t kWords = (sizeof(T) + sizeof(std::uint32_t) - 1) / sizeof(std::uint32_t);
    void copyIn(const T &v) noexcept {
        std::uint32_t tmp[kWords] = {};
        std::memcpy(tmp, &v, sizeof(T));
        for (std::size_t i = 0; i < kWords; ++i) words_[i].store(tmp[i], std::memory_order_relaxed);
    }
    void copyOut(T &v) const noexcept {
        std::uint32_t tmp[kWords];
        for (std::size_t i = 0; i < kWords; ++i) tmp[i] = words_[i].load(std::memory_order_relaxed);
        std::memcpy(&v, tmp, sizeof(T));
    }
    std::atomic<std::uint32_t> seq_{0};
    std::array<std::atomic<std::uint32_t>, kWords> words_{};
};

}  // namespace vd
