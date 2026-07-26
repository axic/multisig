import { Button, Card, Input } from "../components/index.js";

/**
 * Deploy a new multisig (Phase 1).
 *
 * The Solcore contract's constructor takes no args — the deployer becomes the
 * sole signer with required=1. Additional signers and a higher threshold are
 * then added via queued AddSigner / ChangeSigRequired operations (Phase 2+).
 *
 * The form is a design-system placeholder until the deploy flow (bytecode +
 * wagmi deployContract) and post-deploy registration via api.registerWallet
 * land — the controls are wired to nothing yet.
 */
export function CreateWalletPage() {
  return (
    <section className="max-w-[520px]">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Deploy a new wallet</h1>

      <Card title="Deployment">
        <div className="flex flex-col gap-5">
          <Input label="Label" placeholder="Treasury" className="font-sans" />
          <Input label="Chain" defaultValue="1" />
          <p className="text-sm leading-relaxed text-body">
            On deploy you become the sole signer with a threshold of 1. Add signers and raise the
            threshold afterwards through queued operations.
          </p>
          <div className="flex justify-end">
            <Button disabled>Deploy wallet</Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
