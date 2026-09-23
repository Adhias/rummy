export type Player = {
  id: string;
  name: string;
  position: number;
  total: number;
};

export type GameScore = {
  playerId: string;
  points: number;
};

export type Game = {
  id: string;
  position: number;
  winnerPlayerId: string;
  createdAt: string;
  scores: GameScore[];
  money: number;
};

export type OpenHand = {
  scores: GameScore[];
  winnerPlayerId: string | null;
  winnerPoints: number | null;
  winnerOverridden: boolean;
};

export type PhoneRole = "admin" | "seat" | "watch";

export type SessionDetail = {
  id: string;
  pointValue: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  joinCode: string | null;
  adminPlayerId: string | null;
  players: Player[];
  games: Game[];
  openHand: OpenHand;
};

export type SessionView = {
  id: string;
  pointValue: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  joinCode: string;
  role: PhoneRole;
  playerId: string | null;
  players: Player[];
  games: Game[];
  openHand: OpenHand;
  rosterOpen: boolean;
};

export type SeatClaim = {
  session: SessionView;
  seatCode: string;
};

export type DeviceAuth = {
  seatCode: string | null;
  joinCode: string | null;
};

export type ScoreInput = {
  playerId: string;
  points: number;
};

export type GameInput = {
  version: number;
  winnerPlayerId: string;
  scores: ScoreInput[];
};
