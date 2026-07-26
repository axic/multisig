import { useState } from "react";
import type { ReactNode } from "react";
import {
  Address,
  Amount,
  Button,
  Calldata,
  Card,
  Label,
  Logo,
  Modal,
  QuorumMark,
  StateBadge,
  Toast,
  Input,
  type SignatureState,
} from "../components/index.js";

/** Living catalogue of the Coram foundations — one card per component group. */
export function FoundationsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const states: SignatureState[] = ["unsigned", "partial", "quorum", "executed"];

  return (
    <section className="flex flex-col gap-8">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-label text-muted">v0.1 — foundations</span>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight">Coram components</h1>
      </div>

      <Card title="Logo & lockups">
        <div className="flex flex-wrap items-end gap-12">
          <Lockup caption="horizontal — default">
            <Logo size={40} />
          </Lockup>
          <Lockup caption="stacked — narrow">
            <Logo size={40} layout="stacked" />
          </Lockup>
          <Lockup caption="on ink">
            <div className="bg-ink p-4">
              <Logo size={40} tone="dark" />
            </div>
          </Lockup>
        </div>
      </Card>

      <Card title="Buttons">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="signal">Signal</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card title="Inputs">
          <div className="flex flex-col gap-5">
            <Input label="Recipient" defaultValue="0x4F2a91c0Ee5D3b7A8f1c2D4e6B8a0C3d5E7f91B" />
            <Input label="Amount" unit="ETH" defaultValue="12.5" />
            <Input label="Nonce — conflict" defaultValue="41" error="Nonce 41 is already claimed by another pending call." />
          </div>
        </Card>

        <Card title="Signature states">
          <div className="flex flex-col gap-4">
            {states.map((s) => (
              <StateBadge key={s} state={s} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Quorum indicator — the mark as gauge">
        <div className="flex flex-wrap items-start gap-12">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="flex flex-col items-center gap-3.5">
              <QuorumMark signed={n} required={4} />
              <span className="font-mono text-xs text-body">
                {n} / 4{n === 4 ? " — executed" : ""}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Data display">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>Address, truncated</Label>
            <Address value="0x4F2a91c0Ee5D3b7A8f1c2D4e6B8a0C3d5E7f91B" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Amount</Label>
            <Amount value={12.5} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Calldata</Label>
            <Calldata selector="a9059cbb" args="0000…0000002710" />
          </div>
        </div>
      </Card>

      <Card title="Modal & toast">
        <div className="flex flex-col gap-6">
          <div>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          </div>
          <div className="flex flex-col gap-4">
            <Toast state="quorum" emphatic title="Quorum reached — executing" detail="nonce 42 · 0x9c…1a4f" />
            <Toast state="partial" title="Signature recorded" detail="2 of 4 · awaiting others" />
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Sign call 42"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="signal" onClick={() => setModalOpen(false)}>
              Sign &amp; execute
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-[100px_1fr] gap-x-5 gap-y-2">
          <Label>to</Label>
          <Address value="0x4F2a91c0Ee5D3b7A8f1c2D4e6B8a0C3d5E7f91B" />
          <Label>value</Label>
          <Amount value={12.5} />
          <Label>quorum</Label>
          <span className="font-mono text-[13px]">3 / 4 — yours is the last</span>
        </div>
        <p className="text-sm leading-relaxed text-body">
          Signing executes this call immediately. It cannot be recalled.
        </p>
      </Modal>
    </section>
  );
}

function Lockup({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      {children}
      <span className="font-mono text-[11px] text-muted">{caption}</span>
    </div>
  );
}
