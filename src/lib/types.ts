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

export type SessionDetail = {
  id: string;
  rupeeValue: number;
  createdAt: string;
  updatedAt: string;
  players: Player[];
  games: Game[];
};

export type SessionSummary = {
  id: string;
  rupeeValue: number;
  createdAt: string;
  updatedAt: string;
  gameCount: number;
  players: { id: string; name: string; total: number }[];
};

export type ScoreInput = {
  playerId: string;
  points: number;
};

export type GameInput = {
  winnerPlayerId: string;
  scores: ScoreInput[];
};
