// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WalletFactory} from "../src/WalletFactory.sol";
import {IWallet} from "../interfaces/IWallet.sol";
import {SolcoreArtifact} from "./SolcoreArtifact.sol";
import {MultisigOps} from "./MultisigOps.sol";

/// @notice Pattern A: a Solidity CREATE2 factory deploying the solcore multisig
/// wallet. Exercises the full cross-language boundary — a Solidity contract
/// deploys solcore-compiled bytecode, `initialize`s it, and drives the multisig
/// lifecycle (queue → approve → execute) over the ABI.
///
/// The freshly-initialized wallet is a 1-of-1 multisig whose sole signer is the
/// `owner` passed to `initialize`, so a single signer can both approve and
/// execute — the smallest end-to-end exercise of the state machine.
contract FactoryTest is Test {
    WalletFactory internal factory;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        // Load the solcore-compiled creation bytecode and hand it to the factory.
        bytes memory code = SolcoreArtifact.creationCode(vm, "Wallet");
        factory = new WalletFactory(code);
    }

    // ── storage helpers (solcore lays fields out sequentially from slot 0) ────
    // slot 0: signers (mapping)   slot 1: signers_count   slot 2: signers_required
    function _signerCount(address w) internal view returns (uint256) {
        return uint256(vm.load(w, bytes32(uint256(1))));
    }

    function _sigRequired(address w) internal view returns (uint256) {
        return uint256(vm.load(w, bytes32(uint256(2))));
    }

    // solcore mapping slot: keccak256(baseSlot . key). `signers` is at slot 0.
    function _signerAt(address w, uint256 i) internal view returns (address) {
        bytes32 slot = keccak256(abi.encode(uint256(0), i));
        return address(uint160(uint256(vm.load(w, slot))));
    }

    // First 4 bytes of revert returndata (the wallet's shared error code).
    function _revertCode(bytes memory ret) internal pure returns (bytes4 s) {
        if (ret.length >= 4) {
            assembly {
                s := mload(add(ret, 0x20))
            }
        }
    }

    function test_DeployAndInitializeSetsOwnerAsSigner() public {
        address wallet = factory.deploy(owner, bytes32(uint256(1)));

        assertEq(_signerCount(wallet), 1, "owner not registered as sole signer");
        assertEq(_sigRequired(wallet), 1, "threshold not 1-of-1");
        assertEq(_signerAt(wallet, 0), owner, "signers[0] should be the owner");
    }

    function test_CounterfactualAddressMatches() public {
        bytes32 salt = bytes32(uint256(0xABCD));
        address predicted = factory.computeAddress(salt);
        address actual = factory.deploy(owner, salt);
        assertEq(actual, predicted, "CREATE2 address mismatch");
    }

    function test_SignerCanQueueApproveExecute() public {
        address wallet = factory.deploy(owner, bytes32(uint256(2)));
        address newSigner = makeAddr("newSigner");

        // Signer queues an AddSigner operation (nonce 0).
        vm.prank(owner);
        (bool ok,) = wallet.call(MultisigOps.queueCalldata(MultisigOps.addSigner(newSigner)));
        assertTrue(ok, "signer could not queue");

        // Signer approves it (1-of-1 threshold now met)...
        vm.prank(owner);
        IWallet(wallet).approve(0);

        // ...and anyone may execute the approved operation.
        IWallet(wallet).execute(0, "");

        assertEq(_signerCount(wallet), 2, "new signer not added by execute");
        assertEq(_signerAt(wallet, 1), newSigner, "signers[1] should be the new signer");

        // Behavioural proof: the newly-added signer can now queue.
        vm.prank(newSigner);
        (ok,) = wallet.call(MultisigOps.queueCalldata(MultisigOps.changeSigRequired(1)));
        assertTrue(ok, "new signer cannot queue");
    }

    function test_NonSignerCannotQueue() public {
        address wallet = factory.deploy(owner, bytes32(uint256(3)));

        vm.prank(stranger);
        (bool ok, bytes memory ret) =
            wallet.call(MultisigOps.queueCalldata(MultisigOps.changeSigRequired(1)));
        assertFalse(ok, "stranger must not be able to queue");
        assertEq(_revertCode(ret), MultisigOps.ERROR, "expected NotASigner revert code");
    }

    function test_NonSignerCannotApprove() public {
        address wallet = factory.deploy(owner, bytes32(uint256(4)));
        vm.prank(stranger);
        vm.expectRevert(MultisigOps.ERROR);
        IWallet(wallet).approve(0);
    }

    function test_ExecuteUnknownNonceReverts() public {
        address wallet = factory.deploy(owner, bytes32(uint256(5)));
        // Nothing queued yet: nonce 0 is out of range.
        vm.expectRevert(MultisigOps.ERROR);
        IWallet(wallet).execute(0, "");
    }

    function test_CannotReinitialize() public {
        address wallet = factory.deploy(owner, bytes32(uint256(6)));
        // A signer already exists, so re-initializing must revert.
        vm.expectRevert(MultisigOps.ERROR);
        IWallet(wallet).initialize(stranger);
    }

    function test_WalletAcceptsEtherViaFallback() public {
        address wallet = factory.deploy(owner, bytes32(uint256(7)));

        // Bare transfer (empty calldata) hits the wallet's payable fallback.
        vm.deal(address(this), 1 ether);
        (bool ok,) = wallet.call{value: 1 ether}("");
        assertTrue(ok, "wallet rejected a bare ETH transfer");
        assertEq(wallet.balance, 1 ether, "ETH not credited to the wallet");
    }
}
