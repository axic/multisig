// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IWallet
/// @notice Solidity view of the solcore-compiled `Wallet` contract.
/// @dev The selectors here match solcore's ABI dispatch exactly:
///        initialize(address)            -> 0xc4d66de8
///        getOwner()                     -> 0x893d20e8
///        execute(address,uint256,bytes) -> 0xb61d27f6
///      solcore reports every function as `nonpayable` in its emitted ABI, but
///      the underlying `execute` uses CALLVALUE, so it is annotated `payable`
///      here; `getOwner` only SLOADs, so it is `view` (STATICCALL-safe).
interface IWallet {
    /// @notice One-shot initializer. Reverts with AlreadyInitialized() / ZeroOwner().
    function initialize(address newOwner) external;

    /// @notice Current owner (address(0) until initialized).
    function getOwner() external view returns (address);

    /// @notice Owner-only arbitrary call. Reverts with Unauthorized() / CallFailed().
    function execute(address to, uint256 value, bytes calldata data)
        external
        payable
        returns (bytes memory);
}

/// @notice Errors the solcore `Wallet` reverts with, mirrored so Solidity tests
///         can `vm.expectRevert(WalletErrors.X.selector)`.
interface WalletErrors {
    error AlreadyInitialized(); // 0x0dc149f0
    error ZeroOwner(); // 0x9905827b
    error Unauthorized(); // 0x82b42900
    error CallFailed(); // 0x3204506f
}
