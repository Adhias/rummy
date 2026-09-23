{
  description = "Points Rummy score sheet";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
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
          nodejs = pkgs.nodejs_22;
          buildNpmPackage = pkgs.buildNpmPackage.override { inherit nodejs; };
          points-rummy = buildNpmPackage {
            pname = "points-rummy";
            version = (nixpkgs.lib.importJSON ./package.json).version;

            src = ./.;

            npmDepsHash = "sha256-knd7sAWt+/JwhA2RYyq70AFTXFyOZn/ByiNUTtGwUZY=";

            nativeBuildInputs = with pkgs; [
              python3
              pkg-config
              makeBinaryWrapper
              autoPatchelfHook
            ];
            buildInputs = with pkgs; [
              sqlite
              stdenv.cc.cc.lib
            ];

            env.npm_config_build_from_source = true;

            installPhase = ''
              runHook preInstall

              mkdir -p $out/share/points-rummy
              cp -r .next/standalone/. $out/share/points-rummy
              mkdir -p $out/share/points-rummy/.next
              cp -r .next/static $out/share/points-rummy/.next/static
              if [ -d public ]; then
                cp -r public $out/share/points-rummy/public
              fi
              if [ ! -e $out/share/points-rummy/node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
                mkdir -p $out/share/points-rummy/node_modules
                rm -rf $out/share/points-rummy/node_modules/better-sqlite3
                cp -a node_modules/better-sqlite3 $out/share/points-rummy/node_modules/
              fi
              prebuild=${if pkgs.stdenv.hostPlatform.isAarch64 then "linux-arm64.node" else "linux-x64.node"}
              find $out/share/points-rummy/node_modules/better-sqlite3/prebuilds -type f ! -name "$prebuild" -delete
              rm -rf $out/share/points-rummy/node_modules/sharp $out/share/points-rummy/node_modules/@img

              makeWrapper ${nodejs}/bin/node $out/bin/points-rummy \
                --add-flags $out/share/points-rummy/server.js \
                --set-default RUMMY_DB_PATH /var/lib/points-rummy/rummy.sqlite

              runHook postInstall
            '';

            meta = {
              description = "Phone-friendly score sheet for Points Rummy";
              homepage = "https://github.com/Adhias/rummy";
              mainProgram = "points-rummy";
              platforms = nixpkgs.lib.platforms.linux;
            };
          };
        in
        {
          inherit points-rummy;
          default = points-rummy;
        }
      );

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
