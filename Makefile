# Mixed Solidity + solcore multisig — build orchestration.
#
# `forge` has no native hook for compiling .solc, so the solcore artifacts are
# built first (into solcore/out/*.json) and then consumed by forge via
# vm.getCode. Run everything inside the dev shell: `nix develop -c make test`.

.PHONY: all wallet build test fmt fmt-check clean

all: build

## wallet: compile solcore/src/*.solc -> solcore/out/*.json
wallet:
	./scripts/build-solcore.sh

## build: solcore artifacts + forge build
build: wallet
	forge build

## test: solcore artifacts + forge test
test: wallet
	forge test -vvv

## fmt: format Solidity sources
fmt:
	forge fmt

## fmt-check: verify formatting (CI)
fmt-check:
	forge fmt --check

## clean: remove forge and solcore build outputs
clean:
	forge clean
	rm -rf solcore/out
