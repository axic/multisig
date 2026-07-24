// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WalletProxy} from "../src/WalletProxy.sol";
import {IWallet, WalletErrors} from "../interfaces/IWallet.sol";
import {SolcoreArtifact} from "./SolcoreArtifact.sol";
import {Target} from "./mocks/Target.sol";

/// @notice Pattern B: a Solidity EIP-1967 proxy that delegatecalls the solcore
/// wallet logic. Proves the harder claim of the mixed setup — the solcore code
/// runs in the proxy's storage context and its slot-0 layout composes with the
/// proxy's EIP-1967 admin slot without collision.
contract ProxyTest is Test {
    address internal impl; // deployed solcore Wallet (delegatecall target)
    Target internal target;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 internal constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function setUp() public {
        impl = SolcoreArtifact.deploy(vm, "Wallet"); // runtime code is the logic
        target = new Target();
    }

    function _proxy() internal returns (IWallet) {
        bytes memory initData = abi.encodeCall(IWallet.initialize, (owner));
        WalletProxy proxy = new WalletProxy(impl, initData);
        return IWallet(address(proxy));
    }

    function test_InitializedThroughProxy() public {
        IWallet wallet = _proxy();
        assertEq(wallet.getOwner(), owner, "delegatecall initialize() did not set owner");
    }

    /// @dev The core storage-layout proof: the solcore wallet owns slot 0, and the
    ///      proxy's implementation pointer lives in the hashed EIP-1967 slot — no
    ///      collision. Reading slot 0 of the proxy must return the owner.
    function test_StorageLayoutNoCollision() public {
        IWallet wallet = _proxy();
        address proxyAddr = address(wallet);

        bytes32 slot0 = vm.load(proxyAddr, bytes32(uint256(0)));
        assertEq(address(uint160(uint256(slot0))), owner, "owner must be at proxy slot 0");

        bytes32 implSlot = vm.load(proxyAddr, IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(implSlot))), impl, "impl must be at EIP-1967 slot");
    }

    function test_OwnerCanExecuteThroughProxy() public {
        IWallet wallet = _proxy();

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(99));
        vm.prank(owner);
        wallet.execute(address(target), 0, data);

        assertEq(target.value(), 99);
        // msg.sender seen by the target is the PROXY (delegatecall keeps context).
        assertEq(target.lastCaller(), address(wallet), "target should see the proxy as caller");
    }

    function test_ExecuteForwardsValueThroughProxy() public {
        IWallet wallet = _proxy();
        vm.deal(address(wallet), 1 ether); // fund the proxy (accepted via receive())

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(5));
        vm.prank(owner);
        wallet.execute(address(target), 0.25 ether, data);

        assertEq(target.lastValue(), 0.25 ether, "value not forwarded through proxy");
        assertEq(address(target).balance, 0.25 ether);
    }

    function test_NonOwnerCannotExecuteThroughProxy() public {
        IWallet wallet = _proxy();

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(1));
        vm.prank(stranger);
        vm.expectRevert(WalletErrors.Unauthorized.selector);
        wallet.execute(address(target), 0, data);
    }

    function test_CannotReinitializeThroughProxy() public {
        IWallet wallet = _proxy();
        vm.expectRevert(WalletErrors.AlreadyInitialized.selector);
        wallet.initialize(stranger);
    }
}
