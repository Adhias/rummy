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
          points-rummy = pkgs.callPackage ./package.nix { };
        in
        {
          inherit points-rummy;
          default = points-rummy;
        }
      );

      overlays.default = final: prev: {
        points-rummy = prev.callPackage ./package.nix { };
      };

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.python3
              pkgs.pkg-config
              pkgs.sqlite
            ];
          };
        }
      );
    };
}
