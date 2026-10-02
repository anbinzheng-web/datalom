# TikTok SDK deployment assets

These public site scripts are the archived bytes already used by the server SDK
session. They contain no account cookies or captured browser storage. Keep the
files byte-for-byte unchanged: `manifest.json` pins their SHA-256 digests and load
order, and the build verifies them before copying them beside `server.cjs`.

- `bce88a…eafae.js`: webmssdk 2.0.0.561, 245096 bytes. The original capture passed
  through diagnostic redaction; one `[REDACTED]` marker remains inside a Slardar
  error message. This is the existing archived version, not an assertion of
  byte-for-byte equality with the CDN original.
- `ef6857…cf75.js`: webmssdk_ex 2.0.0.1667, 346313 bytes. Its observed resource URL
  is recorded in the manifest for dynamic script reuse.

Initialization is `loader-derived-experiment`, not captured native init arguments.
`$bootstrap.wid` is a placeholder resolved from the selected account in memory.
Do not replace it with account data. SDK version upgrades need separate offline
and real-site validation; deployment must not fetch an unpinned latest SDK.

For deployment lookup and override behavior, inspect
[the SDK session implementation](../../api/server-keyword-session.ts).
Protocol background and sources are in [research notes](../../../research/README.md).
