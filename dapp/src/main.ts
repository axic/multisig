import {
  hashTypedData,
  recoverTypedDataAddress,
  encodeFunctionData,
  keccak256,
  type Hex,
} from 'viem'

// ---------------------------------------------------------------------------
// Demo payload: transfer(address,uint256) calldata against a mock ERC-20.
// A correct decode reads as a sentence ("Transfer 1000 TOK to 0xdead…"),
// a wrong one is visibly a different recipient/amount.
// ---------------------------------------------------------------------------
const VERIFYING_CONTRACT = '0x000000000000000000000000000000000000c0de' as const
const MOCK_TOKEN = '0x1111111111111111111111111111111111111111' as const
const RECIPIENT = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead' as const
const BAD_RECIPIENT = '0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef' as const

const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

// The real payload the message commits to, and its keccak256 hash.
const payload = encodeFunctionData({
  abi: erc20TransferAbi,
  functionName: 'transfer',
  args: [RECIPIENT, 1000n * 10n ** 18n],
})
const payloadHash = keccak256(payload)

// A DIFFERENT payload that does NOT hash to payloadHash (for button 4).
const badPayload = encodeFunctionData({
  abi: erc20TransferAbi,
  functionName: 'transfer',
  args: [BAD_RECIPIENT, 1n],
})

// ---------------------------------------------------------------------------
// The four typed-data variants, written as explicit literal objects on purpose
// (per the brief: I need to read them, not decode an abstraction). Each is the
// FULL JSON handed to the wallet via eth_signTypedData_v4 — so unknown keys
// actually reach the wallet instead of being stripped by viem's serializer.
// ---------------------------------------------------------------------------
const eip712DomainType = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]
const domain = {
  name: 'PreimageDemo',
  version: '1',
  chainId: 100, // Gnosis Chain
  verifyingContract: VERIFYING_CONTRACT,
}

// Gnosis Chain network params, used to nudge the wallet onto chainId 100 so the
// connected network matches the domain. Best-effort: signing works regardless.
const GNOSIS = {
  chainId: '0x64',
  chainName: 'Gnosis',
  nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 },
  rpcUrls: ['https://rpc.gnosischain.com'],
  blockExplorerUrls: ['https://gnosisscan.io'],
}
const message = { target: MOCK_TOKEN, payloadHash, nonce: '0' }

// 1. Plain — this is what actually gets signed.
const plain = {
  types: {
    EIP712Domain: eip712DomainType,
    QueueItem: [
      { name: 'target', type: 'address' },
      { name: 'payloadHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
    ],
  },
  primaryType: 'QueueItem',
  domain,
  message,
}

// 2. Top-level sidecar — a sibling key EIP-712 encoding ignores.
const sidecar = {
  ...plain,
  preimages: [
    {
      path: '$.message.payloadHash',
      algorithm: 'keccak256',
      value: payload,
      as: { format: 'calldata', calleePath: '$.message.target' },
    },
  ],
}

// 3. Types annotation — extra keys inside the type member objects.
// encodeType only serializes `type ‖ " " ‖ name`, so this is hash-neutral too.
const annotation = {
  types: {
    EIP712Domain: eip712DomainType,
    QueueItem: [
      { name: 'target', type: 'address' },
      {
        name: 'payloadHash',
        type: 'bytes32',
        preimage: { algorithm: 'keccak256', as: 'calldata' },
      },
      { name: 'nonce', type: 'uint256' },
    ],
  },
  primaryType: 'QueueItem',
  domain,
  message,
}

// 4. Mismatched — sidecar whose value does NOT hash to payloadHash.
// message.payloadHash is unchanged, so the digest (and signature) stay identical:
// this proves the wallet signs blind unless something recomputes the hash.
const mismatch = {
  ...plain,
  preimages: [
    {
      path: '$.message.payloadHash',
      algorithm: 'keccak256',
      value: badPayload,
      as: { format: 'calldata', calleePath: '$.message.target' },
    },
  ],
}

// ---------------------------------------------------------------------------
// Local EIP-712 digest of a variant. viem's hashTypedData reads only
// domain / member {name,type} / message — the extra keys are ignored at
// runtime, which is exactly the property under test.
// ---------------------------------------------------------------------------
type Variant = typeof plain & { preimages?: unknown }
function digestOf(v: Variant): Hex {
  return hashTypedData({
    domain: v.domain,
    types: { QueueItem: v.types.QueueItem },
    primaryType: 'QueueItem',
    message: { target: v.message.target, payloadHash: v.message.payloadHash, nonce: BigInt(v.message.nonce) },
  })
}

// ---------------------------------------------------------------------------
// Logging — every request/response goes to the page verbatim.
// ---------------------------------------------------------------------------
const logEl = document.getElementById('log') as HTMLPreElement
function log(s: string) {
  logEl.textContent += s + '\n'
  logEl.scrollTop = logEl.scrollHeight
}

// ---------------------------------------------------------------------------
// EIP-6963 provider discovery — lets all three wallets coexist.
// ---------------------------------------------------------------------------
interface Eip1193 { request(a: { method: string; params?: unknown[] }): Promise<unknown> }
interface ProviderDetail { info: { uuid: string; name: string; rdns: string; icon: string }; provider: Eip1193 }

const providers: ProviderDetail[] = []
let selected: ProviderDetail | undefined
const walletsEl = document.getElementById('wallets') as HTMLDivElement
const statusEl = document.getElementById('status') as HTMLDivElement

function renderProviders() {
  walletsEl.innerHTML = ''
  if (providers.length === 0) {
    walletsEl.innerHTML = '<span class="hint">no EIP-6963 wallets announced</span>'
    return
  }
  for (const p of providers) {
    const b = document.createElement('button')
    b.textContent = p.info.name
    if (selected?.info.uuid === p.info.uuid) b.classList.add('selected')
    b.onclick = () => {
      selected = p
      statusEl.textContent = `Selected wallet: ${p.info.name}`
      renderProviders()
    }
    walletsEl.appendChild(b)
  }
}

window.addEventListener('eip6963:announceProvider', (e) => {
  const detail = (e as CustomEvent<ProviderDetail>).detail
  if (!providers.some((p) => p.info.uuid === detail.info.uuid)) {
    providers.push(detail)
    renderProviders()
  }
})
window.dispatchEvent(new Event('eip6963:requestProvider'))
renderProviders()

// ---------------------------------------------------------------------------
// Signing — send raw JSON, recover the signer, assert 1/2/3 are identical.
// ---------------------------------------------------------------------------
const lastSigs: Record<string, string> = {}

function errString(err: unknown): string {
  if (err instanceof Error) return err.message
  try { return JSON.stringify(err) } catch { return String(err) }
}

async function ensureGnosis(p: Eip1193) {
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GNOSIS.chainId }] })
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      try { await p.request({ method: 'wallet_addEthereumChain', params: [GNOSIS] }); return } catch { /* fall through */ }
    }
    log(`(couldn't switch to Gnosis: ${errString(err)} — signing anyway; domain chainId is 100 regardless)`)
  }
}

async function signVariant(name: string, v: Variant) {
  if (!selected) { log('⚠ pick a wallet first'); return }
  log(`\n=== ${name} ===`)
  log(`request: eth_signTypedData_v4\n${JSON.stringify(v, null, 2)}`)
  try {
    const [address] = (await selected.provider.request({ method: 'eth_requestAccounts' })) as Hex[]
    await ensureGnosis(selected.provider)
    const signature = (await selected.provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(v)],
    })) as Hex
    log(`signature: ${signature}`)
    const recovered = await recoverTypedDataAddress({
      domain: v.domain,
      types: { QueueItem: v.types.QueueItem },
      primaryType: 'QueueItem',
      message: { target: v.message.target, payloadHash: v.message.payloadHash, nonce: BigInt(v.message.nonce) },
      signature,
    })
    log(`recovered signer: ${recovered}`)
    lastSigs[name] = signature
    assertSigsEqual()
  } catch (err) {
    // The error text IS a result (question B). Dump it in full.
    log(`ERROR (a result, not a failure): ${errString(err)}`)
    log(`raw error: ${JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}))}`)
  }
}

function assertSigsEqual() {
  const { plain: p, sidecar: s, annotation: a } = lastSigs
  if (!(p && s && a)) return
  const ok = p === s && s === a
  log(`\nsignature equality (plain vs sidecar vs annotation): ${ok ? 'PASS — identical' : 'FAIL — differ!'}`)
}

function runInvariance() {
  log('\n=== 7. digest-invariance check (no wallet) ===')
  const d = {
    plain: digestOf(plain),
    sidecar: digestOf(sidecar),
    annotation: digestOf(annotation),
    mismatch: digestOf(mismatch),
  }
  for (const [k, v] of Object.entries(d)) log(`${k.padEnd(11)} digest: ${v}`)
  const ok = d.plain === d.sidecar && d.sidecar === d.annotation && d.annotation === d.mismatch
  log(ok
    ? 'PASS — all four digests byte-identical: sidecar & annotation are hash-neutral.'
    : 'FAIL — digests differ; a variant leaked into the hash.')
}

// ---------------------------------------------------------------------------
// Wire up buttons.
// ---------------------------------------------------------------------------
const actions: Record<string, () => void> = {
  'sign-plain': () => void signVariant('plain', plain),
  'sign-sidecar': () => void signVariant('sidecar', sidecar),
  'sign-annotation': () => void signVariant('annotation', annotation),
  'sign-mismatch': () => void signVariant('mismatch', mismatch),
  'invariance': runInvariance,
  'clear': () => { logEl.textContent = '' },
}
document.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
  b.onclick = actions[b.dataset.act!]
})

log(`payload:     ${payload}`)
log(`payloadHash: ${payloadHash}`)
log('ready — run button 7 first (no wallet needed), then pick a wallet for 1–4.')
