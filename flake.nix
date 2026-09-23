{
  description = "Points Rummy score sheet";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.callPackage ./nix/package.nix { src = ./.; };
        }
      );

      nixosModules.default =
        { pkgs, lib, ... }:
        {
          imports = [ ./nix/module.nix ];
          services.points-rummy.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        };
    };
}
