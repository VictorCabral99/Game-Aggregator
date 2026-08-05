import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Game, RatingsSummary } from '../../../shared/api';
import GameCard from './GameCard';

interface Props {
  games: Game[];
  cols: number;
  selected: number;
  scores: Record<string, number | null | undefined>;
  ratings?: Record<string, RatingsSummary | null>;
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
  ratings,
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

  // Mantém o card selecionado visível (controle/teclado) — scroll no próprio grid
  useEffect(() => {
    if (selected < 0 || games.length === 0) return;
    const row = Math.floor(selected / safeCols);
    const el = parentRef.current;
    if (el) {
      const top = row * rowSize;
      const target = Math.max(0, top - el.clientHeight / 2 + rowSize / 2);
      el.scrollTop = target;
    }
    rowVirtualizer.scrollToIndex(row, { align: 'center' });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.grid-virtual .card--selected')?.focus({
        preventScroll: true,
      });
    });
  }, [selected, safeCols, games.length, rowSize, rowVirtualizer]);

  return (
    <div
      ref={parentRef}
      className="grid-virtual"
      role="grid"
      aria-rowcount={rowCount}
      data-pad-grid="1"
    >
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
                    ratingSummary={ratings?.[game.id]}
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
