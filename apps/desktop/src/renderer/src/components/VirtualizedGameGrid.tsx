import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Game } from '../../../shared/api';
import GameCard from './GameCard';

interface Props {
  games: Game[];
  cols: number;
  selected: number;
  scores: Record<string, number | null | undefined>;
  hideScores: boolean;
  cardHeight?: number;
  gap?: number;
  onSelect: (index: number) => void;
  onOpen: (gameId: string) => void;
}

/** Grade virtualizada por linhas (P9-01) — aguenta 1k–5k jogos sem montar todos os DOM nodes. */
export default function VirtualizedGameGrid({
  games,
  cols,
  selected,
  scores,
  hideScores,
  cardHeight = 280,
  gap = 16,
  onSelect,
  onOpen,
}: Props): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const safeCols = Math.max(1, cols);
  const rowCount = Math.ceil(games.length / safeCols);
  const rowSize = cardHeight + gap;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowSize,
    overscan: 4,
  });

  return (
    <div ref={parentRef} className="grid-virtual" role="grid" aria-rowcount={rowCount}>
      <div
        className="grid-virtual__inner"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * safeCols;
          const rowGames = games.slice(start, start + safeCols);
          return (
            <div
              key={virtualRow.key}
              className="grid-virtual__row"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
                gap: `${gap}px`,
              }}
              role="row"
            >
              {rowGames.map((game, col) => {
                const index = start + col;
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    selected={index === selected}
                    score={scores[game.id]}
                    hideScore={hideScores}
                    onSelect={() => onSelect(index)}
                    onOpen={() => onOpen(game.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
