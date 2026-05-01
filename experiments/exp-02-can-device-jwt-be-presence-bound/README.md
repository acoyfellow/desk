# exp-02 · Can a device JWT be presence-bound and revokable in ≤60s without polling?

## Why this matters

A desk client is a credential carrier. If it's stolen, lost, or compromised,
revocation must be **fast** and **doesn't require the device to cooperate**
(the attacker holds the device). Standard JWTs solve "stateless auth"
elegantly but make revocation hard. Standard session tokens make revocation
trivial but require constant network. We want both: a credential that
**dies on its own** when the legitimate device stops being present.

The hypothesis: tie JWT validity to a fabric-side "last heartbeat" record.
Worker rejects any token whose paired heartbeat is >60s old. Device's
existing transport keepalive provides the heartbeat for free.

## The acceptance criteria

1. After a graceful unplug, the next attacker-side request using the
   stolen token is rejected within **60s**, measured from unplug.
2. Hostile path: attacker who *also* sees the heartbeat traffic cannot
   replay heartbeats to keep the token alive (heartbeats must be bound
   to the same TLS session / per-message MAC, not just "any HTTP hit").
3. Legitimate path: a 60s network blip on the legitimate device does
   **not** revoke the token; the heartbeat resumes and the token is
   still valid.

## Adversary model

- Attacker has the device + its current token.
- Attacker is on the same network as the legitimate user.
- Attacker does **not** have the user's Cloudflare account access.

## Decision unblocked by this

Whether desk uses **presence-bound JWTs** or **DO-tracked sessions**, or
both layered. If presence-bound JWTs hold up, they're cheaper (no DO read
on every request).

## State

🔴 not started
