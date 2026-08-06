import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Game, RatingsSummary } from '../../../shared/api';
import type { GridRow, RatingBandId } from '../lib/rating-groups';
import GameCard from './GameCard';

interface Props {
  /** Lista plana (sort nome/recentes) OU omitir se `rows` for passado. */
  games?: Game[];
  /** Linhas virtuais com headers de grupo (sort nota/steam). */
  rows?: GridRow[];
  cols: number;
  /** Índice flat entre jogos visíveis (não conta headers). */
  selected: number;
  scores: Record<string, number | null | undefined>;
  ratings?: Record<string, RatingsSummary | null>;
  hideScores: boolean;
  cardHeight?: number;
  gap?: number;
  headerHeight?: number;
  onSelect: (index: number) => void;
  onOpen: (gameId: string) => void;
  onToggleGroup?: (groupId: RatingBandId) => void;
}

/** Grade virtualizada por linhas (P9-01) — lista plana ou grupos colapsáveis. */
export default function VirtualizedGameGrid({
  games,
  rows: groupedRows,
  cols,
  selected,
  scores,
  ratings,
  hideScores,
  cardHeight = 280,
  gap = 16,
  headerHeight = 44,
  onSelect,
  onOpen,
  onToggleGroup,
}: Props): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const safeCols = Math.max(1, cols);
  const rowSize = cardHeight + gap;
  const grouped = Boolean(groupedRows);

  const flatRows: GridRow[] = useMemo(() => {
    if (groupedRows) return groupedRows;
    const list = games ?? [];
    const out: GridRow[] = [];
    for (let i = 0; i < list.length; i += safeCols) {
      out.push({
        kind: 'game-row',
        games: list.slice(i, i + safeCols),
        startIndex: i,
      });
    }
    return out;
  }, [groupedRows, games, safeCols]);

  const rowCount = flatRows.length;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = flatRows[index];
      if (row?.kind === 'header') return headerHeight + 8;
      return rowSize;
    },
    overscan: 6,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [flatRows, rowSize, headerHeight, rowVirtualizer]);

  useEffect(() => {
    if (selected < 0) return;
    let virtualIndex = -1;
    for (let i = 0; i < flatRows.length; i += 1) {
      const row = flatRows[i];
      if (row.kind !== 'game-row') continue;
      if (selected >= row.startIndex && selected < row.startIndex + row.games.length) {
        virtualIndex = i;
        break;
      }
    }
    if (virtualIndex < 0) return;
    rowVirtualizer.scrollToIndex(virtualIndex, { align: 'center' });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.grid-virtual .card--selected')?.focus({
        preventScroll: true,
      });
    });
  }, [selected, flatRows, rowVirtualizer]);

  return (
    <div
      ref={parentRef}
      className={`grid-virtual ${grouped ? 'grid-virtual--grouped' : ''}`}
      role="grid"
      aria-rowcount={rowCount}
      data-pad-grid="1"
    >
      <div
        className="grid-virtual__inner"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) return null;

          if (row.kind === 'header') {
            return (
              <div
                key={`h-${row.groupId}`}
                className="grid-virtual__header-wrap"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${headerHeight}px`,
                }}
                role="row"
              >
                <button
                  type="button"
                  className={`rating-group-header ${row.open ? 'rating-group-header--open' : ''}`}
                  aria-expanded={row.open}
                  onClick={() => onToggleGroup?.(row.groupId)}
                >
                  <span className="rating-group-header__chevron" aria-hidden>
                    {row.open ? '▼' : '▶'}
                  </span>
                  <span className="rating-group-header__label">{row.label}</span>
                  <span className="rating-group-header__count">{row.count}</span>
                </button>
              </div>
            );
          }

          return (
            <div
              key={`r-${row.startIndex}-${row.games.map((g) => g.id).join('-')}`}
              className="grid-virtual__row"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
                gap: `${gap}px`,
              }}
              role="row"
            >
              {row.games.map((game, col) => {
                const index = row.startIndex + col;
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
