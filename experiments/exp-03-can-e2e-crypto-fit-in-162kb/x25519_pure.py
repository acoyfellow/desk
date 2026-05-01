# x25519_pure.py — Minimal pure-Python X25519 ECDH for benchmarking on MicroPython.
# Adapted from RFC 7748 reference. ~30 lines of math; no ext deps.
#
# This is a TEST ARTIFACT for exp-03 — measuring whether the abstraction
# fits in our RAM/CPU budget. NOT for production use until audited.

P = (1 << 255) - 19
A24 = 121665

def _clamp(b):
    b = bytearray(b)
    b[0] &= 248
    b[31] &= 127
    b[31] |= 64
    return bytes(b)

def _decode(b):
    return int.from_bytes(b, 'little') & ((1 << 255) - 1)

def _encode(n):
    return (n % P).to_bytes(32, 'little')

def _cswap(swap, x2, x3):
    if swap:
        return x3, x2
    return x2, x3

def x25519(k_bytes, u_bytes):
    k = _decode(_clamp(k_bytes))
    x1 = _decode(u_bytes)
    x2, z2, x3, z3 = 1, 0, x1, 1
    swap = 0
    for t in range(254, -1, -1):
        kt = (k >> t) & 1
        swap ^= kt
        x2, x3 = _cswap(swap, x2, x3)
        z2, z3 = _cswap(swap, z2, z3)
        swap = kt
        A = (x2 + z2) % P
        AA = (A * A) % P
        B = (x2 - z2) % P
        BB = (B * B) % P
        E = (AA - BB) % P
        C = (x3 + z3) % P
        D = (x3 - z3) % P
        DA = (D * A) % P
        CB = (C * B) % P
        x3 = pow(DA + CB, 2, P)
        z3 = (x1 * pow(DA - CB, 2, P)) % P
        x2 = (AA * BB) % P
        z2 = (E * (AA + A24 * E)) % P
    x2, x3 = _cswap(swap, x2, x3)
    z2, z3 = _cswap(swap, z2, z3)
    return _encode((x2 * pow(z2, P - 2, P)) % P)

BASE9 = b'\x09' + b'\x00' * 31

def keypair(rand_bytes):
    sk = rand_bytes
    pk = x25519(sk, BASE9)
    return sk, pk
