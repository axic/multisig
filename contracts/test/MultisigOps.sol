// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MultisigOps
/// @notice Builds the raw calldata the solcore `Multisig` wallet expects for its
///         sum-typed entrypoints, and pins the selectors / error code its
///         dispatch computes.
/// @dev Why raw calldata? `queue(Operation)` (and the `*WithSignature` variants)
///      take a solcore *sum type*, which has no Solidity ABI spelling. solcore
///      encodes an ADT as a right-nested binary sum of its constructors' product
///      payloads, and its dispatch decodes calldata in exactly that shape — not
///      standard Solidity ABI — so we assemble the bytes here.
///
///      ── Operation sum (9 constructors, in declaration order) ──────────────
///        0 AddSigner(address)
///        1 RemoveSigner(address)
///        2 ChangeSigRequired(uint256)
///        3 TransferEth(address,uint256)
///        4 TransferToken(address,address,uint256)   // (target, token, amount)
///        5 Call(address,uint256,bytes)              // dynamic — not built here
///        6 UnstoredCall(bytes32)
///        7 ApproveSignedHash(bytes32)
///        8 RevokeSignedHash(bytes32)
///
///      ── Wire layout ──────────────────────────────────────────────────────
///      The representation is `sum(C0, sum(C1, ... sum(C7, C8)))`. To decode
///      constructor `k`, solcore reads one 32-byte tag word per nesting level:
///        * `k` words of value 1 (inr — "go right"), then
///        * for k < 8, one word of value 0 (inl — "here"); constructor 8 is the
///          innermost right and takes 8 inr words with no trailing inl.
///      The constructor's field words (one 32-byte word per static scalar)
///      follow immediately after the tag words.
///
///      ── Head-size padding ────────────────────────────────────────────────
///      Dispatch requires `calldatasize() >= headSize(args) + 4` or it reverts
///      with ABIInputTruncated. `headSize(Operation)` telescopes to 32 * 9 =
///      288 bytes (each of the 8 sum levels adds a tag word above the widest
///      branch head), so every Operation is emitted as exactly 9 words / 288
///      bytes, zero-padded past the tag+field words. All static constructors fit
///      (the widest, TransferToken, uses 5 tag + 3 field = 8 words).
library MultisigOps {
    // ── The wallet reverts every failure with this single 4-byte code ────────
    // (`Error(0x12345678)` throughout Wallet.solc: mstore + revert(28, 4)).
    // It stands in for NotASigner / OperationNotFound / AlreadyInitialized / … —
    // the prototype does not yet give each error a distinct selector.
    bytes4 internal constant ERROR = 0x12345678;

    // ── solcore dispatch selectors ───────────────────────────────────────────
    bytes4 internal constant INITIALIZE = 0xc4d66de8; // initialize(address)
    bytes4 internal constant APPROVE = 0xb759f954; // approve(uint256)
    bytes4 internal constant REJECT = 0xb8adaa11; // reject(uint256)
    bytes4 internal constant EXECUTE = 0x59efcb15; // execute(uint256,bytes)
    bytes4 internal constant IS_VALID_SIGNATURE = 0x1626ba7e; // isValidSignature(bytes32,bytes)
    // Structural (sum-typed) selectors — non-standard; keccak256 of the nested
    // `sum(...)` signature solcore derives from the ADT's Generic representation.
    bytes4 internal constant QUEUE = 0x4ae6f8ce; // queue(Operation)
    bytes4 internal constant QUEUE_WITH_SIG = 0xf0ebe9e1; // queueWithSignature(Operation,Signature)
    bytes4 internal constant APPROVE_WITH_SIG = 0x2b3c4a33; // approveWithSignature(uint256,Sig)
    bytes4 internal constant REJECT_WITH_SIG = 0x6203905a; // rejectWithSignature(uint256,Sig)

    uint256 private constant OP_WORDS = 9; // 288-byte Operation head

    // ── Operation constructors (static payloads) ─────────────────────────────
    function addSigner(address signer) internal pure returns (bytes memory) {
        return _op(0, _one(bytes32(uint256(uint160(signer)))));
    }

    function removeSigner(address signer) internal pure returns (bytes memory) {
        return _op(1, _one(bytes32(uint256(uint160(signer)))));
    }

    function changeSigRequired(uint256 count) internal pure returns (bytes memory) {
        return _op(2, _one(bytes32(count)));
    }

    function transferEth(address target, uint256 amount) internal pure returns (bytes memory) {
        bytes32[] memory f = new bytes32[](2);
        f[0] = bytes32(uint256(uint160(target)));
        f[1] = bytes32(amount);
        return _op(3, f);
    }

    function transferToken(address target, address token, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        bytes32[] memory f = new bytes32[](3);
        f[0] = bytes32(uint256(uint160(target)));
        f[1] = bytes32(uint256(uint160(token)));
        f[2] = bytes32(amount);
        return _op(4, f);
    }

    function unstoredCall(bytes32 hash) internal pure returns (bytes memory) {
        return _op(6, _one(hash));
    }

    function approveSignedHash(bytes32 hash) internal pure returns (bytes memory) {
        return _op(7, _one(hash));
    }

    function revokeSignedHash(bytes32 hash) internal pure returns (bytes memory) {
        return _op(8, _one(hash));
    }

    // ── Calldata assembly ────────────────────────────────────────────────────

    /// @notice Full `queue(op)` calldata: selector ++ encoded Operation.
    function queueCalldata(bytes memory op) internal pure returns (bytes memory) {
        return abi.encodePacked(QUEUE, op);
    }

    /// @notice Encode Operation constructor `k` with the given field words,
    ///         laid out as tag words + fields, zero-padded to 9 words.
    function _op(uint256 k, bytes32[] memory fields) private pure returns (bytes memory) {
        bytes32[] memory w = new bytes32[](OP_WORDS);
        // k inr tags (value 1); the inl tag (value 0) for k < 8 is already zero.
        for (uint256 i = 0; i < k; i++) {
            w[i] = bytes32(uint256(1));
        }
        uint256 start = k < 8 ? k + 1 : 8; // fields begin after the tag words
        for (uint256 j = 0; j < fields.length; j++) {
            w[start + j] = fields[j];
        }
        return abi.encodePacked(w); // 9 tightly packed words = 288 bytes
    }

    function _one(bytes32 x) private pure returns (bytes32[] memory a) {
        a = new bytes32[](1);
        a[0] = x;
    }
}
