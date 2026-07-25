import type { Hex } from "viem";
import type { Operation } from "./operations.js";

/**
 * Codec for the `Operation` (and later `Signature`) sum types.
 *
 * ⚠️ NOT a standard Solidity ABI. Solcore encodes sum types with its own
 * "sum-wide-product" / nested binary-sum scheme (see std.ABIGeneric in the
 * solcore repo). The golden vectors in ../test/vectors/multisig.json prove that
 * a naive `[ordinal tag][field...]` layout is WRONG — e.g. the observed tag
 * words and payload widths for AddSigner vs. ChangeSigRequired do not line up
 * with a simple enum ordinal.
 *
 * Reverse-engineering this encoder (and its inverse `decodeOperation`) against
 * those vectors + std.ABIGeneric is Phase 2 work. Until then this throws so no
 * call site silently ships a mis-encoded queue() transaction.
 *
 * Reference material to implement it:
 *   - solcore std/ABIGeneric.solc  (encoding rules for generic ADTs)
 *   - solcore test/examples/dispatch/{generic_sum,sum_wide_product,
 *     specialise_sum_of_product}.{solc,json}  (smaller worked examples)
 *   - test/vectors/multisig.json  (queue(AddSigner) + queue(ChangeSigRequired))
 */
export function encodeOperation(_op: Operation): Hex {
  throw new Error(
    "encodeOperation: Solcore sum-type ABI codec not implemented yet (Phase 2). " +
      "See packages/core/src/operationCodec.ts and the golden vectors.",
  );
}

export function decodeOperation(_data: Hex): Operation {
  throw new Error(
    "decodeOperation: Solcore sum-type ABI codec not implemented yet (Phase 2). " +
      "See packages/core/src/operationCodec.ts and the golden vectors.",
  );
}
