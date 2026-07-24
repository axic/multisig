#!/usr/bin/env bash
#
# Compile every solcore (.solc) source under solcore/src into a Foundry-shaped
# artifact JSON under solcore/out, so Solidity tests can load the bytecode via
# `vm.getCode("solcore/out/<Name>.json")`.
#
# Pipeline per file:  .solc --(sol-core)--> Core IR (.hull) --(yule)--> Yul
#                     --(solc --strict-assembly)--> EVM bytecode
#
# Each .solc is compiled in isolation because sol-core always names its Core-IR
# output `output<N>.hull` (indexed per contract, NOT per source file), so
# compiling several at once into one dir would clobber the outputs.
#
# Env overrides (all set for you inside `nix develop`):
#   SOLCORE_CMD  sol-core front-end command   (default: sol-core)
#   YULE_CMD     yule back-end command        (default: yule)
#   SOLC         Solidity/Yul assembler       (default: solc)
#   SOLCORE_STD  path to solcore's std/ dir   (default: ./std next to this repo)

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src_dir="$root/solcore/src"
out_dir="$root/solcore/out"

: "${SOLCORE_CMD:=sol-core}"
: "${YULE_CMD:=yule}"
: "${SOLC:=solc}"
: "${SOLCORE_STD:=$root/std}"

# Verify the toolchain is present (only the first word of each command matters).
for cmd in "$SOLCORE_CMD" "$YULE_CMD" "$SOLC" jq; do
    bin="${cmd%% *}"
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo "error: '$bin' not found on PATH." >&2
        echo "       Enter the dev shell first:  nix develop -c make wallet" >&2
        exit 1
    fi
done

if [[ ! -d "$SOLCORE_STD" ]]; then
    echo "error: solcore std library not found at SOLCORE_STD=$SOLCORE_STD" >&2
    echo "       Inside 'nix develop' this is set automatically. Otherwise point it" >&2
    echo "       at the std/ directory of a solcore checkout." >&2
    exit 1
fi

mkdir -p "$out_dir"
work_root="$(mktemp -d)"
trap 'rm -rf "$work_root"' EXIT

shopt -s nullglob
sources=("$src_dir"/*.solc)
if [[ ${#sources[@]} -eq 0 ]]; then
    echo "no .solc sources found in $src_dir — nothing to do"
    exit 0
fi

for src in "${sources[@]}"; do
    name="$(basename "$src" .solc)"
    echo ">> compiling $name.solc"

    work="$work_root/$name"
    mkdir -p "$work"

    # 1. Front-end: .solc -> Core IR (.hull) + JSON ABI (<Name>.abi via --abi).
    $SOLCORE_CMD -f "$src" -i "$SOLCORE_STD" -o "$work" --abi

    hull="$work/output1.hull"
    if [[ ! -f "$hull" ]]; then
        echo "error: expected $hull — did $name.solc define a contract?" >&2
        exit 1
    fi
    if [[ -f "$work/output2.hull" ]]; then
        echo "error: $name.solc produced multiple contracts; keep one contract per file" >&2
        exit 1
    fi

    # 2. Back-end: Core IR -> Yul, both the deployable (creation) and runtime forms.
    $YULE_CMD "$hull" -o "$work/creation.yul"
    $YULE_CMD "$hull" -o "$work/runtime.yul" --nodeploy

    # 3. Assemble Yul -> EVM bytecode.
    creation="0x$($SOLC --strict-assembly --bin --optimize "$work/creation.yul" | tail -1 | tr -d '\n')"
    runtime="0x$($SOLC --strict-assembly --bin --optimize "$work/runtime.yul" | tail -1 | tr -d '\n')"

    # 4. Emit a Foundry-shaped artifact. `bytecode.object` (creation code) is what
    #    forge's vm.getCode reads; the ABI and runtime code are bundled for tooling.
    abi='[]'
    if [[ -f "$work/$name.abi" ]]; then
        abi="$(cat "$work/$name.abi")"
    fi
    jq -n \
        --argjson abi "$abi" \
        --arg creation "$creation" \
        --arg runtime "$runtime" \
        '{abi: $abi, bytecode: {object: $creation}, deployedBytecode: {object: $runtime}}' \
        > "$out_dir/$name.json"

    echo "   -> solcore/out/$name.json"
done

echo "done: ${#sources[@]} artifact(s) in solcore/out/"
