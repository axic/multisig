// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IWallet
/// @notice Solidity view of the solcore-compiled `Multisig` wallet
///         (`solcore/src/Wallet.solc`).
/// @dev solcore computes 4-byte selectors itself, as
///        `keccak256(name "(" sigStr(args) ")")[:4]`
///      where `sigStr` is the canonical ABI spelling for value types. For the
///      value-typed methods below that coincides exactly with Solidity's own
///      selector, so a plain `interface` calls them over the ordinary ABI:
///        initialize(address)                   -> 0xc4d66de8
///        approve(uint256)                      -> 0xb759f954
///        reject(uint256)                       -> 0xb8adaa11
///        execute(uint256,bytes)                -> 0x59efcb15
///        isValidSignature(bytes32,bytes)       -> 0x1626ba7e
///      solcore reports every function as `nonpayable`; the wallet only takes
///      value through its `payable` fallback (bare ETH transfers), never through
///      a selector, so nothing here is `payable`. `isValidSignature` only SLOADs,
///      so it is `view` (STATICCALL-safe).
///
///      The remaining public methods — `queue`, `queueWithSignature`,
///      `approveWithSignature`, `rejectWithSignature`, `batch` — take solcore
///      sum types (`Operation`, `Signature`, `BatchOperation`) that have no
///      Solidity ABI spelling and non-standard, structural selectors. They are
///      driven from tests with raw calldata built by `test/MultisigOps.sol`.
interface IWallet {
    /// @notice One-shot initializer (the wallet's "constructor for the factory").
    ///         Sets `owner` as the sole signer with a 1-of-1 threshold. Reverts
    ///         (AlreadyInitialized) if a signer already exists.
    function initialize(address owner) external;

    /// @notice Signer-only approval of the queued operation at `nonce`.
    function approve(uint256 nonce) external;

    /// @notice Signer-only rejection of the queued operation at `nonce`.
    function reject(uint256 nonce) external;

    /// @notice Execute the operation at `nonce` (anyone may call once approved).
    ///         `payload` supplies the call bytes for an `UnstoredCall`; it is
    ///         unused (pass "") for every other operation kind. Operations must
    ///         be executed in strict `nonce` order.
    function execute(uint256 nonce, bytes calldata payload) external;

    /// @notice ERC-1271 signature check against a previously approved hash.
    ///         Returns the magic value `0x1626ba7e` when `hash` is approved and
    ///         `signature` is empty; reverts otherwise.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4);
}
