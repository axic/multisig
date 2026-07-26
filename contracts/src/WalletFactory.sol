// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IWallet} from "../interfaces/IWallet.sol";

/// @title WalletFactory
/// @notice Deploys the solcore-compiled `Wallet` via CREATE2 and initializes it.
/// @dev This is "Pattern A" of the mixed setup: a Solidity frontend that deploys
///      a standalone solcore wallet. The wallet's creation bytecode is produced
///      by the solcore pipeline (`scripts/build-solcore.sh` -> solcore/out/Wallet.json)
///      and handed to the factory once at construction, so the factory is fully
///      self-contained afterwards (counterfactual addresses included).
contract WalletFactory {
    /// @notice Creation (init) bytecode of the solcore `Wallet`, set once.
    bytes public walletCreationCode;

    /// @notice keccak256 of the creation code, cached for CREATE2 address math.
    bytes32 public immutable walletCodeHash;

    event WalletDeployed(address indexed wallet, address indexed owner, bytes32 salt);

    error EmptyCreationCode();
    error DeployFailed();

    constructor(bytes memory creationCode) {
        if (creationCode.length == 0) revert EmptyCreationCode();
        walletCreationCode = creationCode;
        walletCodeHash = keccak256(creationCode);
    }

    /// @notice Deploy a wallet owned by `owner` at a CREATE2 address keyed by `salt`.
    function deploy(address owner, bytes32 salt) external returns (address wallet) {
        bytes memory code = walletCreationCode;
        assembly {
            wallet := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (wallet == address(0)) revert DeployFailed();

        // The solcore wallet has no constructor logic; ownership is set here.
        IWallet(wallet).initialize(owner);

        emit WalletDeployed(wallet, owner, salt);
    }

    /// @notice Counterfactual CREATE2 address for a given salt.
    function computeAddress(bytes32 salt) external view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, walletCodeHash));
        return address(uint160(uint256(h)));
    }
}
