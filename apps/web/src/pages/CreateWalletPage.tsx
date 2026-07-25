/**
 * Deploy a new multisig (Phase 1).
 *
 * The Solcore contract's constructor takes no args — the deployer becomes the
 * sole signer with required=1. Additional signers and a higher threshold are
 * then added via queued AddSigner / ChangeSigRequired operations (Phase 2+).
 *
 * This page is a placeholder until the deploy flow (bytecode + wagmi
 * deployContract) and post-deploy registration via api.registerWallet land.
 */
export function CreateWalletPage() {
  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Deploy a new wallet</h1>
      <p className="text-sm text-gray-500">
        Placeholder. Phase 1 wires up contract deployment (deployer becomes signer[0], required=1),
        then registers the address with the API. Extra signers / threshold changes are queued
        operations handled in later phases.
      </p>
    </section>
  );
}
