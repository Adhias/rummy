# Points Rummy

A phone-friendly score sheet for Points Rummy. Name the players, set the rupee value of one point, and enter each game. The sheet keeps a running total. The lowest total is ahead.

This tracks Points Rummy only. It does not deal cards, and it does not score Pool or Deals Rummy.

## Scoring

- One winner per game. Everyone else gets penalty points.
- A loser's score is rounded to the nearest 10, with 5 rounding up, then capped at 80. 64 is stored as 60, 66 as 70, 65 as 70, and 75 as 80.
- Pack is 20, double pack is 40, and a full count is 80.
- The winner's points start as the negative of the other players' stored points. Type over that field to save a different number. The typed value is not rounded.
- The rupees owed on a game are the opponents' stored points added together, times the rupee value. An overridden winner score does not change that amount.
- Number cards count as their face value. Jacks, queens, kings, and aces are 10. Jokers are 0. The card counter can drop that total into a loser's field.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Sessions, players, and games are stored in SQLite at `data/rummy.sqlite`. Refreshing or coming back later keeps the sheet. Past sessions stay in the list.

```bash
npm test
npm run lint
npm run build
npm start
```

## NixOS

This repo ships the package and the systemd service. Your NixOS configuration turns it on.

Add the flake as an input:

```nix
inputs.rummy.url = "github:Adhias/rummy";
```

Import the module and enable the service:

```nix
rummy.nixosModules.default
{
  services.points-rummy = {
    enable = true;
    port = 3000;
    # Listens on localhost until you put a reverse proxy in front, or set
    # host = "0.0.0.0" and openFirewall = true.
  };
}
```

The database is kept in `/var/lib/points-rummy`. A reverse proxy, a domain name, and TLS stay in the NixOS configuration.
