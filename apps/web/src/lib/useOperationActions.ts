import {
  encodeApprove,
  encodeExecute,
  encodeQueue,
  encodeReject,
  unstoredCallHash,
  unstoredCallPayload,
  type Operation as CoreOperation,
} from "@multisig/core";
import { useMutation } from "@tanstack/react-query";
import { getAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import type { OperationView, WalletState } from "./multisig.js";
import { getPreimage, savePreimage } from "./registry.js";

/** Discriminated input for queueing a new operation from a form. */
export type QueueInput =
  | { kind: "TransferEth"; target: Address; amount: bigint }
  | { kind: "UnstoredCall"; target: Address; value: bigint; payload: Hex } // arbitrary call
  | { kind: "AddSigner"; signer: Address }
  | { kind: "RemoveSigner"; signer: Address }
  | { kind: "ChangeSigRequired"; count: bigint };

/** Turn a form input into the core Operation (and, for UnstoredCall, its preimage). */
function buildQueue(input: QueueInput): {
  op: CoreOperation;
  preimage?: { hash: Hex; target: Address; value: bigint; payload: Hex };
} {
  switch (input.kind) {
    case "TransferEth":
      return { op: { tag: "TransferEth", target: input.target, amount: input.amount } };
    case "UnstoredCall": {
      const hash = unstoredCallHash(input.target, input.value, input.payload);
      return {
        op: { tag: "UnstoredCall", hash },
        preimage: { hash, target: input.target, value: input.value, payload: input.payload },
      };
    }
    case "AddSigner":
      return { op: { tag: "AddSigner", signer: input.signer } };
    case "RemoveSigner":
      return { op: { tag: "RemoveSigner", signer: input.signer } };
    case "ChangeSigRequired":
      return { op: { tag: "ChangeSigRequired", count: input.count } };
  }
}

/**
 * Queue an operation: send `queue()` on-chain. For an `UnstoredCall` we also
 * persist the preimage locally, since only its hash lands on chain and the
 * preimage is required to execute the op later.
 */
export function useQueueOperation(wallet: WalletState, onDone: () => void) {
  const { address: account } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: wallet.chainId });

  return useMutation({
    mutationFn: async (input: QueueInput) => {
      if (!account) throw new Error("connect a signer wallet");
      const { op, preimage } = buildQueue(input);
      if (preimage) {
        savePreimage(preimage.hash, {
          target: preimage.target,
          value: preimage.value.toString(),
          payload: preimage.payload,
        });
      }
      const hash = await sendTransactionAsync({ to: getAddress(wallet.address), data: encodeQueue(op) });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    onSuccess: onDone,
  });
}

/** approve / reject / execute an existing operation (signer/anyone on-chain). */
export function useOperationActions(wallet: WalletState, onDone: () => void) {
  const { address: account } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: wallet.chainId });

  const to = getAddress(wallet.address);
  const send = async (data: Hex) => {
    const hash = await sendTransactionAsync({ to, data });
    if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  };

  const approve = useMutation({
    mutationFn: async (op: OperationView) => {
      if (!account) throw new Error("connect a signer wallet");
      return send(encodeApprove(BigInt(op.index)));
    },
    onSuccess: onDone,
  });

  const reject = useMutation({
    mutationFn: async (op: OperationView) => {
      if (!account) throw new Error("connect a signer wallet");
      return send(encodeReject(BigInt(op.index)));
    },
    onSuccess: onDone,
  });

  const execute = useMutation({
    mutationFn: async (op: OperationView) => {
      // UnstoredCall needs its locally-stored preimage supplied as the payload.
      let payload: Hex = "0x";
      if (op.op.tag === "UnstoredCall") {
        const pre = getPreimage(op.op.hash);
        if (!pre) {
          throw new Error("missing preimage for this UnstoredCall (queued from another browser?) — cannot execute");
        }
        payload = unstoredCallPayload(getAddress(pre.target), BigInt(pre.value), pre.payload);
      }
      return send(encodeExecute(BigInt(op.index), payload));
    },
    onSuccess: onDone,
  });

  return { approve, reject, execute };
}
