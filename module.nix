{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.points-rummy;
  defaultDataDir = "/var/lib/points-rummy";
in
{
  options.services.points-rummy = {
    enable = lib.mkEnableOption "Points Rummy score sheet";

    package = lib.mkPackageOption pkgs "points-rummy" { };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      example = "0.0.0.0";
      description = "Address the score sheet listens on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the score sheet listens on.";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = defaultDataDir;
      description = "Directory for the SQLite session database.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the service port in the firewall.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.points-rummy = {
      description = "Points Rummy score sheet";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        HOSTNAME = cfg.host;
        PORT = toString cfg.port;
        RUMMY_DB_PATH = "${cfg.dataDir}/rummy.sqlite";
        NODE_ENV = "production";
        NEXT_TELEMETRY_DISABLED = "1";
      };
      serviceConfig =
        {
          ExecStart = lib.getExe cfg.package;
          Restart = "on-failure";
          RestartSec = 2;
          DynamicUser = true;
          WorkingDirectory = cfg.dataDir;
          NoNewPrivileges = true;
          PrivateTmp = true;
          ProtectSystem = "strict";
          ProtectHome = true;
        }
        // lib.optionalAttrs (cfg.dataDir == defaultDataDir) {
          StateDirectory = "points-rummy";
        }
        // lib.optionalAttrs (cfg.dataDir != defaultDataDir) {
          ReadWritePaths = [ cfg.dataDir ];
        };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}
