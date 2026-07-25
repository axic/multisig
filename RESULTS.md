# Results matrix

Fill in per wallet. For **B**, paste the **exact error string** from the on-page
log when a wallet rejects — that distinguishes schema validation from something
else, which determines whether the design is salvageable.

Reproduce: `cd dapp && npm install && npm run dev`, pick the wallet in the
EIP-6963 picker, run the buttons noted per row.

| Test | How to reproduce | MetaMask | Rabby | Phantom |
|------|------------------|----------|-------|---------|
| A. Signature unchanged by top-level sidecar | Buttons 1 then 2; check PASS line | | | |
| A. Signature unchanged by types annotation  | Buttons 1 then 3; check PASS line | | | |
| B. Accepts unknown top-level key            | Button 2; sign vs. error string | | | |
| B. Accepts unknown key in types member      | Button 3; sign vs. error string | | | |
| Renders raw `bytes32` payloadHash ("before")| Any sign button; screenshot the prompt | | | |

## Local proof (no wallet)

| Test | How to reproduce | Result |
|------|------------------|--------|
| Digest invariance across all four variants | Button 7 | |

## Out of scope in this build (need a MetaMask snap)

| Test | Status |
|------|--------|
| C. Sidecar visible to snap | not built |
| D. Renders with/without Critical severity | not built |
| E. Mismatch hard-fails | not built |
| F. onTransaction decodes execute() | not built |
