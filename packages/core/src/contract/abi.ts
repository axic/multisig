import type { Abi } from "viem";

/**
 * Hand-written viem ABI for the Solcore multisig.
 *
 * Source: axic/solcore @ multisig-ethglobal-rebase,
 *   test/examples/dispatch/multisig.solc — PLUS the Phase-1 view getters
 *   (signersRequired/signersCount/signerAt/getNonce/operationsCount) added on
 *   branch claude/multisig-create-view-fold39. The base contract exposes no
 *   getters and emits no events, so those getters are the read model for
 *   signers/threshold/nonce.
 *
 * WHY HAND-WRITTEN: there is no Solidity source to derive an ABI from — the
 * contract is Solcore. But Solcore emits *standard* 4-byte selector dispatch and
 * standard ABI-encoded args/returns for scalar (uint256/address/bytes)
 * signatures, so an ordinary viem ABI drives it correctly. This is verified:
 * the pinned approve/reject/execute selectors in ../selectors.ts are
 * byte-identical to keccak256(signature)[:4], i.e. viem's *computed* selectors
 * already match the contract's dispatch. The getters here are scalar-only for
 * the same reason.
 *
 * SCOPE: only the entrypoints Phase 1 needs (no-arg deploy + reads) plus the
 * standard-ABI action selectors reused by later phases. The
 * queue()/*WithSignature entrypoints take Solcore sum-type args whose encoding
 * is NON-standard; they are deliberately OMITTED here and go through
 * ../operationCodec.ts (Phase 2), not this ABI.
 */
export const MULTISIG_ABI = [
  // --- deploy -------------------------------------------------------------
  // constructor() — no args; the deployer becomes signers[0], count=1, required=1.
  { type: "constructor", stateMutability: "nonpayable", inputs: [] },

  // --- Phase-1 view getters (added to multisig.solc) ----------------------
  {
    type: "function",
    name: "signersRequired",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "signersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "signerAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  // Named getNonce() (not nonce()) to avoid colliding with the `nonce` storage
  // field in Solcore — mirrors the getOwner()/owner convention in Wallet.solc.
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "operationsCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },

  // --- standard-ABI actions (reused by later phases) ----------------------
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nonce", type: "uint256" },
      { name: "payload", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;
