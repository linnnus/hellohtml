{
  description = "Shitty codepen clone";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    deno2nix = {
      url = "github:SnO2WMaN/deno2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, deno2nix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ deno2nix.overlays.default ];
        };

        additionalDenoFlags = "--unstable-kv"; # enable unstable key-value store.
        src = ./.;

        hellohtml-bundle-drv = pkgs.deno2nix.mkBundled {
          pname = "hellohtml-bundle";
          version = "0.1.0";
          entrypoint = "./server.ts";
          lockfile = "./lock.json";
          inherit src additionalDenoFlags;
        };

        hellohtml-drv = pkgs.writeShellScriptBin "hellohtml" ''
          cd ${src}
          ${pkgs.deno}/bin/deno run ${additionalDenoFlags} --allow-read=${src} --allow-net=0.0.0.0:8538 --no-prompt ${hellohtml-bundle-drv}/dist/hellohtml-bundle.bundled.js
        '';
      in
      {
        packages = rec {
          hellohtml = hellohtml-drv;
          default = hellohtml;
        };

        apps = rec {
          hellohtml = flake-utils.lib.mkApp { drv = hellohtml-drv; };
          default = hellohtml;
        };
      }
    ) // { # system-agnostic exports
        nixosModules = rec {
          hellohtml = { config, lib, pkgs, ... }:
            let
              cfg = config.services.hellohtml;
            in
            {
              options.services.hellohtml = {
                enable = lib.mkEnableOption "hellohtml service";

                package = lib.mkOption {
                  description = "What package to run for connections. Should listen on port 8538.";
                  default = self.packages.${pkgs.system}.hellohtml;
                  type = lib.types.package;
                };
              };

              config = lib.mkIf cfg.enable {
                # Create a user for the thingymagig.
                users.users.hellohtml = {
                  group = "hellohtml";
                  description = "Runs hellohtml service";
                  isSystemUser = true;
                  home = "/srv/hellohtml";
                  createHome = true; # needed for Deno to store DB
                };
                users.groups.hellohtml = {};

                # FIXME: It is wasteful to always run this service. We should run on-demand instead.
                #        This is usually achieved using SystemD sockets [4] but we are blocked on missing
                #        features in Deno [1, 5].
                #
                #        We have to be able to listen on a socket that's already been created by binding
                #        an open file descriptor (or listening on stdin) [3]. This is not possible in Deno
                #        as it is now [1, 2, 6].
                #
                #        Once it becomes a possibility, we should mirror the way push-notification-api works
                #        as of b9ed407 [8, 7].
                #
                #        [1]: https://github.com/denoland/deno/issues/6529
                #        [2]: https://github.com/denoland/deno/blob/1dd1aba2448c6c8a5a0370c4066a68aca06b859b/ext/net/ops_unix.rs#L207C34-L207C34
                #        [3]: https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html#Description:~:text=Note%20that%20the,the%20service%20file).
                #        [4]: https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html#Description:~:text=Socket%20units%20may%20be%20used%20to%20implement%20on%2Ddemand%20starting%20of%20services%2C%20as%20well%20as%20parallelized%20starting%20of%20services.%20See%20the%20blog%20stories%20linked%20at%20the%20end%20for%20an%20introduction.
                #        [5]: https://github.com/denoland/deno/issues/14214
                #        [6]: https://github.com/tokio-rs/tokio/issues/5678
                #        [7]: https://github.com/benoitc/gunicorn/blob/660fd8d850f9424d5adcd50065e6060832a200d4/gunicorn/arbiter.py#L142-L155
                #        [8]: https://github.com/linnnus/push-notification-api/tree/b9ed4071a4500a26b3b348a7f5fbc549e9694562

                # Create hellohtml service.
                systemd.services.hellohtml = {
                  description = "HelloHTML server!!!";

                  # FIXME: See earlier fixme. For now we just start when system starts.
                  wantedBy = [ "multi-user.target" ];
                  after = [ "network.target" ];

                  serviceConfig = {
                    Type = "simple";
                    User = config.users.users.hellohtml.name;
                    Group = config.users.users.hellohtml.group;
                    WorkingDirectory = config.users.users.hellohtml.home;
                    ExecStart = ''
                     "${cfg.package}"/bin/hellohtml
                    '';

                    # Harden service
                    # NoNewPrivileges = "yes";
                    # PrivateTmp = "yes";
                    # PrivateDevices = "yes";
                    # DevicePolicy = "closed";
                    # ProtectControlGroups = "yes";
                    # ProtectKernelModules = "yes";
                    # ProtectKernelTunables = "yes";
                    # RestrictAddressFamilies = "AF_UNIX AF_INET AF_INET6 AF_NETLINK";
                    # RestrictNamespaces = "yes";
                    # RestrictRealtime = "yes";
                    # RestrictSUIDSGID = "yes";
                    # MemoryDenyWriteExecute = "yes";
                    # LockPersonality = "yes";
                  };
                };
              };
            };
          default = hellohtml;
        };
      };
}
