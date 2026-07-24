// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WalletFactory} from "../src/WalletFactory.sol";
import {IWallet, WalletErrors} from "../interfaces/IWallet.sol";
import {SolcoreArtifact} from "./SolcoreArtifact.sol";
import {Target} from "./mocks/Target.sol";

/// @notice Pattern A: a Solidity CREATE2 factory deploying the solcore wallet.
/// Exercises the full cross-language boundary — a Solidity contract deploys
/// solcore-compiled bytecode and drives it through the ABI.
contract FactoryTest is Test {
    WalletFactory internal factory;
    Target internal target;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        // Load the solcore-compiled creation bytecode and hand it to the factory.
        bytes memory code = SolcoreArtifact.creationCode(vm, "Wallet");
        factory = new WalletFactory(code);
        target = new Target();
    }

    function test_DeployAndOwner() public {
        address wallet = factory.deploy(owner, bytes32(uint256(1)));
        assertEq(IWallet(wallet).getOwner(), owner, "owner not set by initialize()");
    }

    function test_CounterfactualAddressMatches() public {
        bytes32 salt = bytes32(uint256(0xABCD));
        address predicted = factory.computeAddress(salt);
        address actual = factory.deploy(owner, salt);
        assertEq(actual, predicted, "CREATE2 address mismatch");
    }

    function test_OwnerCanExecute() public {
        address wallet = factory.deploy(owner, bytes32(uint256(2)));

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(42));
        vm.prank(owner);
        IWallet(wallet).execute(address(target), 0, data);

        assertEq(target.value(), 42, "execute did not reach target");
        assertEq(target.lastCaller(), wallet, "target should see the wallet as caller");
    }

    function test_ExecuteForwardsValue() public {
        address wallet = factory.deploy(owner, bytes32(uint256(3)));
        vm.deal(wallet, 1 ether);

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(7));
        vm.prank(owner);
        IWallet(wallet).execute(address(target), 0.5 ether, data);

        assertEq(target.lastValue(), 0.5 ether, "value not forwarded");
        assertEq(address(target).balance, 0.5 ether);
        assertEq(wallet.balance, 0.5 ether);
    }

    function test_NonOwnerCannotExecute() public {
        address wallet = factory.deploy(owner, bytes32(uint256(4)));

        bytes memory data = abi.encodeWithSelector(Target.setValue.selector, uint256(1));
        vm.prank(stranger);
        vm.expectRevert(WalletErrors.Unauthorized.selector);
        IWallet(wallet).execute(address(target), 0, data);
    }

    function test_CannotReinitialize() public {
        address wallet = factory.deploy(owner, bytes32(uint256(5)));
        vm.expectRevert(WalletErrors.AlreadyInitialized.selector);
        IWallet(wallet).initialize(stranger);
    }

    function test_ExecuteBubblesInnerRevert() public {
        address wallet = factory.deploy(owner, bytes32(uint256(6)));

        bytes memory data = abi.encodeWithSelector(Target.boom.selector);
        vm.prank(owner);
        vm.expectRevert(WalletErrors.CallFailed.selector);
        IWallet(wallet).execute(address(target), 0, data);
    }
}
