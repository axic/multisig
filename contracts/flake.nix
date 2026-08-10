{
  description = "Mixed Solidity + solcore multisig — Foundry toolchain plus the solcore compiler";

  inputs = {
    # solcore provides the `sol-core` and `yule` binaries (one package, two
    # executables) and, via its source tree, the std library.
    solcore.url = "github:axic/solcore/main";

    # Reuse solcore's pinned nixpkgs + foundry overlay so the toolchains match.
    nixpkgs.follows = "solcore/nixpkgs";
    flake-utils.follows = "solcore/flake-utils";
    foundry.follows = "solcore/foundry";
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import inputs.nixpkgs {
          inherit system;
          overlays = [ inputs.foundry.overlay ];
        };

        # `sol-core` package ships both bin/sol-core and bin/yule.
        solcorePkg = inputs.solcore.packages.${system}.sol-core;

        # std library lives in the solcore source tree (a nix store path here).
        solcoreStd = "${inputs.solcore}/std";
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            solcorePkg # sol-core + yule
            pkgs.foundry-bin # forge, cast, anvil
            pkgs.solc # Yul -> EVM assembler (and any plain Solidity)
            pkgs.jq
            pkgs.gnumake
            pkgs.bash
          ];

          shellHook = ''
            export SOLCORE_STD="${solcoreStd}"
            export SOLCORE_CMD="sol-core"
            export YULE_CMD="yule"
            export SOLC="solc"
            echo "multisig dev shell: sol-core + yule + foundry + solc ready."
            echo "  build solcore artifacts:  make wallet"
            echo "  run the full test suite:  make test"
          '';
        };
      });
}
