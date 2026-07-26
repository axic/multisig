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
import { api, type Operation, type RecordQueueBody, type Wallet } from "./api.js";

/** Discriminated input for queueing a new operation from a form. */
export type QueueInput =
  | { kind: "TransferEth"; target: Address; amount: bigint }
  | { kind: "UnstoredCall"; target: Address; value: bigint; payload: Hex } // arbitrary call
  | { kind: "AddSigner"; signer: Address }
  | { kind: "RemoveSigner"; signer: Address }
  | { kind: "ChangeSigRequired"; count: bigint };

/** Turn a form input into the core Operation + the API write-through record. */
function buildQueue(input: QueueInput): { op: CoreOperation; record: Omit<RecordQueueBody, "txHash" | "proposer"> } {
  switch (input.kind) {
    case "TransferEth":
      return {
        op: { tag: "TransferEth", target: input.target, amount: input.amount },
        record: { kind: "TransferEth", decoded: { target: input.target, amount: input.amount.toString() } },
      };
    case "UnstoredCall": {
      const hash = unstoredCallHash(input.target, input.value, input.payload);
      return {
        op: { tag: "UnstoredCall", hash },
        record: {
          kind: "UnstoredCall",
          decoded: { hash, target: input.target, value: input.value.toString(), payload: input.payload },
          preimage: { hash, target: input.target, value: input.value.toString(), payload: input.payload },
        },
      };
    }
    case "AddSigner":
      return {
        op: { tag: "AddSigner", signer: input.signer },
        record: { kind: "AddSigner", decoded: { signer: input.signer } },
      };
    case "RemoveSigner":
      return {
        op: { tag: "RemoveSigner", signer: input.signer },
        record: { kind: "RemoveSigner", decoded: { signer: input.signer } },
      };
    case "ChangeSigRequired":
      return {
        op: { tag: "ChangeSigRequired", count: input.count },
        record: { kind: "ChangeSigRequired", decoded: { count: input.count.toString() } },
      };
  }
}

/** Queue an operation: send queue() on-chain, then write it through to the index. */
export function useQueueOperation(wallet: Wallet, onDone: () => void) {
  const { address: account } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  return useMutation({
    mutationFn: async (input: QueueInput) => {
      if (!account) throw new Error("connect a signer wallet");
      const { op, record } = buildQueue(input);
      const hash = await sendTransactionAsync({
        to: getAddress(wallet.address),
        data: encodeQueue(op),
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      return api.recordQueue(wallet.chainId, wallet.address, { ...record, txHash: hash, proposer: account });
    },
    onSuccess: onDone,
  });
}

/** approve / reject / execute an existing operation (signer/anyone on-chain). */
export function useOperationActions(wallet: Wallet, onDone: () => void) {
  const { address: account } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const to = getAddress(wallet.address);
  const send = async (data: Hex) => {
    const hash = await sendTransactionAsync({ to, data });
    if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  };

  const approve = useMutation({
    mutationFn: async (op: Operation) => {
      if (!account) throw new Error("connect a signer wallet");
      const hash = await send(encodeApprove(BigInt(op.index)));
      return api.approveOp(op.id, { signer: account, txHash: hash });
    },
    onSuccess: onDone,
  });

  const reject = useMutation({
    mutationFn: async (op: Operation) => {
      if (!account) throw new Error("connect a signer wallet");
      const hash = await send(encodeReject(BigInt(op.index)));
      return api.rejectOp(op.id, { signer: account, txHash: hash });
    },
    onSuccess: onDone,
  });

  const execute = useMutation({
    mutationFn: async (op: Operation) => {
      // UnstoredCall needs its preimage supplied as the execute payload.
      let payload: Hex = "0x";
      if (op.kind === "UnstoredCall" && op.decoded.target) {
        payload = unstoredCallPayload(
          getAddress(op.decoded.target),
          BigInt(op.decoded.value ?? "0"),
          (op.decoded.payload ?? "0x") as Hex,
        );
      }
      const hash = await send(encodeExecute(BigInt(op.index), payload));
      return api.executeOp(op.id, { txHash: hash });
    },
    onSuccess: onDone,
  });

  return { approve, reject, execute };
}
