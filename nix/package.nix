{
  lib,
  stdenv,
  src,
  buildNpmPackage,
  nodejs_22,
  python3,
  pkg-config,
  sqlite,
  makeBinaryWrapper,
  autoPatchelfHook,
}:

let
  nodejs = nodejs_22;
  build = buildNpmPackage.override { inherit nodejs; };
in
build {
  pname = "points-rummy";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = lib.cleanSource src;
    filter =
      name: _type:
      let
        base = baseNameOf name;
      in
      base != "node_modules" && base != ".next" && base != "data" && base != "result";
  };

  npmDepsHash = "sha256-knd7sAWt+/JwhA2RYyq70AFTXFyOZn/ByiNUTtGwUZY=";

  nativeBuildInputs = [
    python3
    pkg-config
    makeBinaryWrapper
    autoPatchelfHook
  ];
  buildInputs = [
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
    prebuild=${if stdenv.hostPlatform.isAarch64 then "linux-arm64.node" else "linux-x64.node"}
    find $out/share/points-rummy/node_modules/better-sqlite3/prebuilds -type f ! -name "$prebuild" -delete
    rm -rf $out/share/points-rummy/node_modules/sharp $out/share/points-rummy/node_modules/@img

    makeWrapper ${nodejs}/bin/node $out/bin/points-rummy \
      --add-flags $out/share/points-rummy/server.js

    runHook postInstall
  '';

  meta = {
    description = "Phone-friendly score sheet for Points Rummy";
    mainProgram = "points-rummy";
    platforms = lib.platforms.linux;
  };
}
