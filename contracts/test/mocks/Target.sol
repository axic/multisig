// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice A trivial call target used to prove the solcore wallet's `execute`
///         actually performs an outbound call (and forwards value).
contract Target {
    uint256 public value;
    address public lastCaller;
    uint256 public lastValue;

    event Pinged(address caller, uint256 v, uint256 sent);

    function setValue(uint256 v) external payable returns (uint256) {
        value = v;
        lastCaller = msg.sender;
        lastValue = msg.value;
        emit Pinged(msg.sender, v, msg.value);
        return v;
    }

    function boom() external pure {
        revert("target boom");
    }
}
