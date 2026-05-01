# PARKED — needs a fresh question

The original framing here ("how does an unpaired M5 discover and
authenticate to a desk fabric?") assumed multi-tenant pairing was
the next thing on the path. That's not where v0 went.

v0 ships with a single-operator install model: the operator flashes
the M5 with a pre-baked `secrets.py` containing the bearer token
and Wi-Fi credentials. There is no "pairing flow" because there's
no second user to pair with.

This question becomes important again when:

- desk goes multi-user (a public app store needs OAuth + per-device
  tokens, not a shared bearer)
- the M5 needs to be portable between desk fabrics (e.g. a guest
  picks up someone else's M5 and pairs it temporarily)

For v0 / public release, the question stays parked. When it's time
to revisit, write a fresh experiment scoped against the multi-user
threat model — the v0 framing is too thin.
