// SPDX-License-Identifier: MIT
// Force-included (/FI) into upstream src/llama-moe-slot.cpp on Windows only.
// The pinned revision already has a Windows read path (_lseeki64 + _read on
// iov_base/iov_len) but declares struct iovec and ssize_t only through POSIX
// headers. This supplies the two missing declarations without patching the
// locked upstream checkout. VoxCPM2 does not use the MoE slot code.
#pragma once
#ifdef _WIN32
#include <cstddef>
#include <cstdint>
struct iovec {
    void * iov_base;
    size_t iov_len;
};
typedef intptr_t ssize_t;
#endif
