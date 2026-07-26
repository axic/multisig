// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WalletProxy} from "../src/WalletProxy.sol";
import {IWallet} from "../interfaces/IWallet.sol";
import {SolcoreArtifact} from "./SolcoreArtifact.sol";
import {MultisigOps} from "./MultisigOps.sol";

/// @notice Pattern B: a Solidity EIP-1967 proxy that delegatecalls the solcore
/// multisig logic. Proves the harder claim of the mixed setup — the solcore code
/// runs in the proxy's storage context, its sequential slot layout composes with
/// the proxy's hashed EIP-1967 admin slot without collision, and the full
/// multisig lifecycle works through the delegatecall boundary.
contract ProxyTest is Test {
    address internal impl; // deployed solcore Wallet (delegatecall target)

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 internal constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function setUp() public {
        impl = SolcoreArtifact.deploy(vm, "Wallet"); // runtime code is the logic
    }

    function _proxy() internal returns (IWallet) {
        bytes memory initData = abi.encodeCall(IWallet.initialize, (owner));
        WalletProxy proxy = new WalletProxy(impl, initData);
        return IWallet(address(proxy));
    }

    // slot 1: signers_count   slot 2: signers_required (solcore, sequential from 0)
    function _signerCount(address w) internal view returns (uint256) {
        return uint256(vm.load(w, bytes32(uint256(1))));
    }

    function _signerAt(address w, uint256 i) internal view returns (address) {
        return address(uint160(uint256(vm.load(w, keccak256(abi.encode(uint256(0), i))))));
    }

    function _revertCode(bytes memory ret) internal pure returns (bytes4 s) {
        if (ret.length >= 4) {
            assembly {
                s := mload(add(ret, 0x20))
            }
        }
    }

    function test_InitializedThroughProxy() public {
        IWallet wallet = _proxy();
        address proxyAddr = address(wallet);
        assertEq(_signerCount(proxyAddr), 1, "owner not registered via delegatecall");
        assertEq(_signerAt(proxyAddr, 0), owner, "owner should be signers[0] in proxy storage");
    }

    /// @dev The core storage-layout proof: the solcore wallet owns low slots
    ///      (signers mapping at slot 0, signers_count at 1, signers_required at
    ///      2), while the proxy keeps its implementation pointer in the hashed
    ///      EIP-1967 slot — no collision. Both must read back correctly from the
    ///      same account.
    function test_StorageLayoutNoCollision() public {
        IWallet wallet = _proxy();
        address proxyAddr = address(wallet);

        // Wallet state landed in the proxy's low slots.
        assertEq(_signerCount(proxyAddr), 1, "signers_count must be at proxy slot 1");
        assertEq(uint256(vm.load(proxyAddr, bytes32(uint256(2)))), 1, "signers_required at slot 2");
        assertEq(_signerAt(proxyAddr, 0), owner, "owner must be at signers[0]");

        // Proxy's implementation pointer lives in the hashed EIP-1967 slot.
        bytes32 implSlot = vm.load(proxyAddr, IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(implSlot))), impl, "impl must be at EIP-1967 slot");
    }

    function test_SignerLifecycleThroughProxy() public {
        IWallet wallet = _proxy();
        address proxyAddr = address(wallet);
        address newSigner = makeAddr("newSigner");

        // queue → approve → execute an AddSigner, all through the delegatecall proxy.
        vm.prank(owner);
        (bool ok,) = proxyAddr.call(MultisigOps.queueCalldata(MultisigOps.addSigner(newSigner)));
        assertTrue(ok, "signer could not queue through proxy");

        vm.prank(owner);
        wallet.approve(0);
        wallet.execute(0, "");

        // State mutated in the PROXY's storage, not the implementation's.
        assertEq(_signerCount(proxyAddr), 2, "new signer not added in proxy storage");
        assertEq(_signerAt(proxyAddr, 1), newSigner, "signers[1] should be the new signer");
        assertEq(_signerCount(impl), 0, "implementation storage must stay untouched");
    }

    function test_NonSignerCannotQueueThroughProxy() public {
        IWallet wallet = _proxy();
        vm.prank(stranger);
        (bool ok, bytes memory ret) =
            address(wallet).call(MultisigOps.queueCalldata(MultisigOps.changeSigRequired(1)));
        assertFalse(ok, "stranger must not be able to queue");
        assertEq(_revertCode(ret), MultisigOps.ERROR, "expected NotASigner revert code");
    }

    function test_CannotReinitializeThroughProxy() public {
        IWallet wallet = _proxy();
        vm.expectRevert(MultisigOps.ERROR);
        wallet.initialize(stranger);
    }

    function test_ProxyAcceptsEther() public {
        IWallet wallet = _proxy();
        // Bare transfers are accepted by the proxy's own receive() (not delegated).
        vm.deal(address(this), 0.5 ether);
        (bool ok,) = address(wallet).call{value: 0.5 ether}("");
        assertTrue(ok, "proxy rejected a bare ETH transfer");
        assertEq(address(wallet).balance, 0.5 ether, "ETH not credited to the proxy");
    }
}
