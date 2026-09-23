"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CARD_RANKS, type CardRank, countHand } from "@/lib/scoring";

export function CardCounter({
  open,
  playerName,
  onOpenChange,
  onUse,
}: {
  open: boolean;
  playerName: string;
  onOpenChange: (open: boolean) => void;
  onUse: (total: number) => void;
}) {
  const [cards, setCards] = useState<CardRank[]>([]);
  const total = countHand(cards);

  function handleOpenChange(next: boolean) {
    if (!next) setCards([]);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Count {playerName}&apos;s cards</DialogTitle>
          <DialogDescription>
            Number cards count as their face. Jack, queen, king, and ace are 10. Jokers are 0.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-2">
          {CARD_RANKS.map((rank) => (
            <Button
              key={rank}
              type="button"
              variant="outline"
              className="h-12 px-0 text-base"
              onClick={() => setCards((current) => [...current, rank])}
            >
              {rank === "Joker" ? "Joker" : rank}
            </Button>
          ))}
        </div>
        <div className="flex min-h-12 flex-wrap gap-2">
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tap a card to add it.</p>
          ) : (
            cards.map((rank, index) => (
              <button
                key={`${rank}-${index}`}
                type="button"
                className="h-10 rounded-full bg-secondary px-3 text-sm"
                onClick={() =>
                  setCards((current) => current.filter((_, cardIndex) => cardIndex !== index))
                }
              >
                {rank} ×
              </button>
            ))
          )}
        </div>
        <p className="font-heading text-3xl tabular-nums">{total}</p>
        <Button
          type="button"
          size="xl"
          className="w-full"
          disabled={cards.length === 0}
          onClick={() => {
            onUse(total);
            setCards([]);
          }}
        >
          Use {total}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
