// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Loads solcore-compiled artifacts (built by scripts/build-solcore.sh into
///         solcore/out/<Name>.json) and deploys them, so Solidity tests can treat a
///         solcore contract like any other deployable contract.
/// @dev `vm.getCode` reads the `bytecode.object` (creation code) field of the JSON
///      artifact. Requires `fs_permissions` read access to `./solcore/out` in foundry.toml.
library SolcoreArtifact {
    /// @notice Raw creation (init) bytecode for a solcore artifact by name.
    function creationCode(Vm vm, string memory name) internal view returns (bytes memory) {
        return vm.getCode(string.concat("solcore/out/", name, ".json"));
    }

    /// @notice Deploy a solcore artifact by name via CREATE, returning its address.
    function deploy(Vm vm, string memory name) internal returns (address addr) {
        bytes memory code = creationCode(vm, name);
        assembly {
            addr := create(0, add(code, 0x20), mload(code))
        }
        require(addr != address(0), "solcore artifact deploy failed");
    }
}
