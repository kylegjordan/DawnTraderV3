#!/usr/bin/env python3
"""RED control for Coltrane r3 window 2 (2026-10-16), run as root against an installer path given as argv[1]:
patch os.mkdir so that right after the installer makes "telegram", an attacker swaps a substituted REAL directory into
that name before the installer opens it - the by-name window between mkdirat and openat. The r2 installer
(bd1bb1b83) has the window and writes into the decoy; the current one builds in root-only staging and has no mkdir of
"telegram" inside the other account's tree, so the swap never lands on anything it writes."""
import os, runpy, sys

real_mkdir = os.mkdir
SWAPPED = []


def mkdir(name, mode=0o777, *, dir_fd=None):
    real_mkdir(name, mode, dir_fd=dir_fd)
    if name == "telegram" and dir_fd is not None and "/staging" not in os.readlink("/proc/self/fd/%d" % dir_fd):
        os.rename(name, name + ".orig", src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        real_mkdir(name, 0o700, dir_fd=dir_fd)                  # the decoy: a REAL root-owned 0700 dir, not a link
        SWAPPED.append(os.readlink("/proc/self/fd/%d" % dir_fd))


os.mkdir = mkdir
target = sys.argv[1]
sys.argv = [target] + sys.argv[2:]
try:
    runpy.run_path(target, run_name="__main__")
finally:
    print("SWAP-PERFORMED-IN:", SWAPPED)
