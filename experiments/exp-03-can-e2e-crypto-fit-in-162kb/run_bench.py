# run_bench.py — exp-03 benchmark, runs ON the device.
#
# Measures:
#   - X25519 keygen + DH time (pure Python, RFC 7748 ladder)
#   - AES-256-CBC encrypt/decrypt time (cryptolib native)
#   - HMAC-SHA256 time (manual polyfill, since hmac module missing)
#   - RAM peak via gc.mem_alloc snapshots
#
# NOT measured here (intentionally):
#   - ChaCha20-Poly1305 (no native, pure-Python is so slow it would skew)
#     We surface that as a finding instead of running it.

import gc, time, os, hashlib, cryptolib
from x25519_pure import x25519, keypair, BASE9

def now_ms(): return time.ticks_ms()
def mem(): gc.collect(); return gc.mem_alloc()

results = {}

# ----- X25519 keygen + DH -----
gc.collect()
mem_before = mem()
t0 = now_ms()
sk_a = os.urandom(32); pk_a = x25519(sk_a, BASE9)
t_keygen = time.ticks_diff(now_ms(), t0)

t0 = now_ms()
sk_b = os.urandom(32); pk_b = x25519(sk_b, BASE9)
shared_a = x25519(sk_a, pk_b)
shared_b = x25519(sk_b, pk_a)
t_full_handshake = time.ticks_diff(now_ms(), t0)
mem_after_x25519 = mem()

assert shared_a == shared_b, 'X25519 ECDH mismatch'

results['x25519_keygen_ms'] = t_keygen
results['x25519_full_handshake_ms'] = t_full_handshake
results['x25519_ram_delta_bytes'] = mem_after_x25519 - mem_before

# ----- HMAC-SHA256 polyfill (for HKDF and message MACs) -----
def hmac_sha256(key, msg):
    block = 64
    if len(key) > block:
        key = hashlib.sha256(key).digest()
    if len(key) < block:
        key = key + b'\x00' * (block - len(key))
    o_pad = bytes((b ^ 0x5c) for b in key)
    i_pad = bytes((b ^ 0x36) for b in key)
    inner = hashlib.sha256(i_pad + msg).digest()
    return hashlib.sha256(o_pad + inner).digest()

# Sanity: known HMAC-SHA256 test vector (RFC 4231 case 1)
tv_key = b'\x0b' * 20
tv_msg = b'Hi There'
tv_expect = b'\xb0\x34\x4c\x61\xd8\xdb\x38\x53\x5c\xa8\xaf\xce\xaf\x0b\xf1\x2b\x88\x1d\xc2\x00\xc9\x83\x3d\xa7\x26\xe9\x37\x6c\x2e\x32\xcf\xf7'
assert hmac_sha256(tv_key, tv_msg) == tv_expect, 'HMAC-SHA256 polyfill broken'

# Bench HMAC over 1KB messages
key = os.urandom(32)
msg = os.urandom(1024)
N = 50
t0 = now_ms()
for _ in range(N):
    hmac_sha256(key, msg)
t_hmac = time.ticks_diff(now_ms(), t0)
results['hmac_sha256_per_1kb_ms'] = t_hmac / N

# ----- AES-256-CBC roundtrip (native via cryptolib) -----
key = os.urandom(32)
iv = os.urandom(16)
plain = os.urandom(1024)  # 1KB
N = 100

t0 = now_ms()
for _ in range(N):
    cipher = cryptolib.aes(key, 2, iv)  # 2 = CBC
    ct = cipher.encrypt(plain)
t_aes_enc = time.ticks_diff(now_ms(), t0) / N

t0 = now_ms()
for _ in range(N):
    cipher = cryptolib.aes(key, 2, iv)
    pt = cipher.decrypt(ct)
t_aes_dec = time.ticks_diff(now_ms(), t0) / N

assert pt == plain, 'AES roundtrip mismatch'
results['aes256cbc_encrypt_per_1kb_ms'] = t_aes_enc
results['aes256cbc_decrypt_per_1kb_ms'] = t_aes_dec

# ----- Final RAM snapshot -----
gc.collect()
results['ram_peak_alloc_bytes'] = mem()
results['ram_free_bytes'] = gc.mem_free()
results['ram_total_bytes'] = gc.mem_alloc() + gc.mem_free()

print('===EXP-03 RESULTS===')
import ujson
print(ujson.dumps(results))
print('===END===')
