// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title WalletProxy
/// @notice Minimal EIP-1967 delegatecall proxy over the solcore `Wallet` runtime.
/// @dev This is "Pattern B" of the mixed setup: a Solidity frontend that *is* the
///      account (holds funds and the implementation pointer) and delegatecalls the
///      solcore-compiled wallet logic. Because the delegatecall runs the wallet
///      code in THIS contract's storage context:
///        - all wallet state lives here, in the slots the solcore layout owns
///          (sequential from slot 0 -> `signers` mapping at slot 0,
///          `signers_count` at 1, `signers_required` at 2);
///        - the implementation address is kept in the EIP-1967 slot, a hashed
///          high slot that cannot collide with the wallet's low slots;
///        - the wallet must be set up via `initialize(...)` (a delegatecalled
///          function), never a constructor — see `Wallet.solc`.
///      `msg.sender` / `msg.value` / `address(this)` seen by the wallet resolve to
///      this proxy's context automatically (CALLER / CALLVALUE / ADDRESS opcodes),
///      which is exactly what a wallet wants.
contract WalletProxy {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error InitFailed();

    /// @param impl     Address of a deployed solcore `Wallet` (its runtime code is
    ///                 the delegatecall target; its own storage is unused).
    /// @param initData Calldata to delegatecall right after wiring up `impl`,
    ///                 typically `abi.encodeCall(IWallet.initialize, (owner))`.
    constructor(address impl, bytes memory initData) {
        assembly {
            sstore(IMPLEMENTATION_SLOT, impl)
        }
        if (initData.length != 0) {
            (bool ok,) = impl.delegatecall(initData);
            if (!ok) revert InitFailed();
        }
    }

    /// @notice Current implementation address (EIP-1967 slot).
    function implementation() external view returns (address impl) {
        assembly {
            impl := sload(IMPLEMENTATION_SLOT)
        }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    // Accept bare ETH so the wallet can later forward it via `execute`. Plain
    // transfers are NOT delegated (the solcore wallet has no receive/fallback and
    // would revert on empty calldata); they simply credit the proxy's balance.
    receive() external payable {}
}
