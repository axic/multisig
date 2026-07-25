# EIP-712 Preimage Sidecar — Wallet Compatibility Demo

Minimal, empirical test of whether an EIP-712 **preimage sidecar** survives real
wallets. The idea: a signing request commits to `bytes32 payloadHash`, and the
`payload` preimage is shipped *alongside* the request (a top-level sibling key,
or extra keys inside `types` members) — not inside the digest. Because those
extras are hash-neutral, transport is untrusted: verification is a hash check.

This build is **dapp-only** (no MetaMask snap, no forge contract). It answers the
two questions that need no extension surface, across all three wallets:

- **A.** Does adding a top-level `preimages` key / a `types`-member annotation
  change the signature? (It must not.)
- **B.** Does the wallet **reject** typed data with an unknown top-level key, or
  with unknown keys inside `types` members?

Questions C–F require a MetaMask snap and are out of scope for this build.

## Run (≈2 min)

```bash
cd dapp
npm install
npm run dev        # → http://localhost:5173
```

No Anvil, no RPC keys needed — `chainId: 31337` is just data inside the domain,
and `eth_signTypedData_v4` doesn't require a matching connected chain.

## What the buttons do

| Button | What it proves |
|--------|----------------|
| **7. Digest-invariance check** | **No wallet.** Computes `hashTypedData` over all four variants (plain / sidecar / annotation / mismatch) and asserts the digests are byte-identical. This proves the property locally before any wallet is opened. Run it first. |
| **1. Sign — plain** | Baseline signature over the bare typed data. |
| **2. Sign — top-level sidecar** | Sends the full JSON *with* a top-level `preimages` key straight to the wallet (bypassing viem's serializer, so the key really reaches the wallet). |
| **3. Sign — types annotation** | Same, but the extra keys live inside the `QueueItem` type members. |
| **4. Sign — mismatched preimage** | Sidecar `value` that does **not** hash to `payloadHash`. `message.payloadHash` is unchanged, so the signature is *still* identical — demonstrating the wallet signs blind. |

After 1–3 the page asserts the three signatures are identical (**PASS/FAIL**) and
prints the recovered signer. Every request, response, and thrown error is logged
verbatim to the on-page `<pre>` — the error text is the answer to question B.

## Testing all three wallets

The page uses **EIP-6963** provider discovery, so MetaMask, Rabby, and Phantom
can all be installed at once without fighting over `window.ethereum`. The picker
at the top lists every announced wallet; click one to select it (its name shows
in the status line so screenshots are self-labelling), then run buttons 1–4.

For each wallet, record in [`RESULTS.md`](./RESULTS.md):
- whether signatures 1/2/3 match (question A),
- whether the wallet signs or **rejects** variant 2 and 3 — and if it rejects,
  the **exact error string** from the log (question B),
- a screenshot of how the raw `bytes32 payloadHash` renders (the "before" panel).

## Wallet versions used

_Fill in when you run it, e.g. MetaMask 12.x, Rabby 0.9x, Phantom 25.x._

## Layout

```
dapp/
├── index.html      # one page, button column, verbatim <pre> log
├── src/main.ts     # four literal typed-data variants + EIP-6963 picker
├── package.json    # deps: viem (+ vite, typescript)
└── tsconfig.json
RESULTS.md          # matrix to fill in
```
