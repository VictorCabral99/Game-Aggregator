import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateGameInput,
  Game,
  GameSource,
  LaunchResult,
  RatingsSummary,
  ProfileId,
  ProfileTokens,
  SteamStatus,
  StoreId,
  StoreStatus,
} from '../../../shared/api';
import { useGamepadNav } from './useGamepadNav';
import { setSoundsEnabled, uiBack, uiMove, uiSelect } from '../lib/sounds';
import {
  activateFocused,
  emitEscape,
  ensureFocus,
  focusSelectedCard,
  gameIdFromFocusedCard,
  getPadRoot,
  isInsideGrid,
  moveFocus,
} from '../lib/spatialFocus';
import {
  buildGridRows,
  buildRatingGroups,
  defaultCollapsedState,
  flattenOpenGroupGames,
  type RatingBandId,
} from '../lib/rating-groups';
import {
  FILTER_OPTIONS,
  STORE_LABELS,
  type AppSection,
  type PlatformFilter,
  type SortBy,
  type ToastState,
  type View,
} from '../lib/app-types';

export function useAppState() {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>({ kind: 'library' });
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [steam, setSteam] = useState<SteamStatus | null>(null);
  const [stores, setStores] = useState<Partial<Record<StoreId, StoreStatus | null>>>({});
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [installedOnly, setInstalledOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [profile, setProfile] = useState<ProfileId>('desk');
  const [profileTokens, setProfileTokens] = useState<ProfileTokens>({
    cardWidth: 180,
    cardGap: 12,
    padding: 24,
    fontScale: 1.0,
    maxColumns: 8,
    safeMarginPct: 0,
    hideCursorAfterMs: 0,
  });
  const [ratings, setRatings] = useState<Record<string, RatingsSummary | null>>({});
  const [syncingRatings, setSyncingRatings] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [enrichProgress, setEnrichProgress] = useState<{
    index: number;
    total: number;
    title: string;
  } | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [hideNotes, setHideNotes] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string | null; image: string | null } | null>(null);
  const [section, setSection] = useState<AppSection>('library');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [ready, setReady] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [sideNavOpen, setSideNavOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const sideNavRef = useRef<HTMLElement | null>(null);
  const enrichRunning = useRef(false);
  const padStatusRef = useRef<{ connected: boolean; active: boolean; id: string | null }>({
    connected: false,
    active: false,
    id: null,
  });

  const refreshRatings = useCallback(async () => {
    const map = await window.api.ratingsForLibrary();
    setRatings(map);
  }, []);

  const notify = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const u = await window.api.authGetCurrentUser();
      if (u) setUser(u);
    } catch {
      // sem sessão
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await window.api.authLogout();
    } catch {
      // ignore
    }
    setUser(null);
    setSection('library');
  }, []);

  const goSection = useCallback((next: AppSection) => {
    setSection(next);
    setSideNavOpen(false);
    if (next === 'library') setView({ kind: 'library' });
  }, []);

  const refresh = useCallback(async () => {
    const list = await window.api.libraryList();
    setGames(list);
    setSelected((prev) => Math.min(prev, Math.max(list.length - 1, 0)));
  }, []);

  const finishStoresSetup = useCallback(() => {
    void window.api.settingsSet('onboarding.stores', '1');
    void window.api.settingsSet('onboarding.done', '1');
    setSection('library');
    void refresh().then(() => {
      void window.api.providersSyncAll().then(() => refresh()).catch(() => undefined);
      void window.api.ratingsEnrichStream({}).then(() => {
        void refreshRatings();
        void refresh();
      }).catch(() => undefined);
    });
  }, [refresh, refreshRatings]);

  useEffect(() => {
    const boot = async () => {
      const t0 = performance.now();
      try {
        await refresh();
      } catch (err) {
        notify(String(err), 'error');
      }
      setReady(true);
      const ms = performance.now() - t0;
      if (ms > 2000) {
        console.warn(`[startup] library ready in ${Math.round(ms)}ms (meta <2s)`);
      }

      void window.api
        .steamStatus()
        .then(setSteam)
        .catch(() => setSteam({ available: false, path: null, gamesCount: 0, lastScanAt: null, error: null }));
      for (const { id } of STORE_LABELS) {
        void window.api
          .storeStatus(id)
          .then((s) => setStores((prev) => ({ ...prev, [id]: s })))
          .catch(() => setStores((prev) => ({ ...prev, [id]: null })));
      }
      void refreshRatings().catch(() => undefined);
      // Auth restaura sessão; se lojas nunca configuradas, abre a seção Lojas via sidebar
      void checkAuth().catch(() => undefined);

      const steamDone = await window.api.settingsGet('onboarding.done').catch(() => null);
      const storesDone = await window.api.settingsGet('onboarding.stores').catch(() => null);
      if (storesDone === '1' && steamDone !== '1') {
        setShowOnboarding(true);
      }
    };
    void boot();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh, notify, refreshRatings, checkAuth]);

  const CARD_W = profileTokens.cardWidth;
  const GAP = profileTokens.cardGap;
  const PADDING = profileTokens.padding;

  // Settings de UX (Fase 5) + Profiles (P8-01)
  const reloadUxSettings = useCallback(() => {
    void window.api
      .settingsGet('ui.tvMode')
      .then((v) => setTvMode(v === '1'))
      .catch(() => undefined);
    void window.api
      .settingsGet('ui.sounds')
      .then((v) => setSoundsEnabled(v === '1'))
      .catch(() => undefined);
    void window.api
      .settingsGet('ui.hideRatings')
      .then((v) => setHideNotes(v === '1'))
      .catch(() => undefined);
    void window.api.profileGet().then(setProfile).catch(() => undefined);
  }, []);

  useEffect(() => {
    reloadUxSettings();
  }, [reloadUxSettings]);

  // Load profile tokens when profile changes
  useEffect(() => {
    void window.api.profileGetTokens(profile).then(setProfileTokens).catch(() => undefined);
  }, [profile]);

  // Apply profile tokens to CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--card-w', `${profileTokens.cardWidth}px`);
    root.style.setProperty('--card-gap', `${profileTokens.cardGap}px`);
    root.style.setProperty('--grid-padding', `${profileTokens.padding}px`);
    root.style.setProperty('--font-scale', String(profileTokens.fontScale));
    root.style.setProperty('--max-cols', String(profileTokens.maxColumns));
    root.style.setProperty('--safe-margin-pct', `${profileTokens.safeMarginPct}%`);
    root.style.setProperty('--cursor-hide-ms', `${profileTokens.hideCursorAfterMs}ms`);
  }, [profileTokens]);

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode || profile === 'tv');
    document.body.classList.remove('profile-desk', 'profile-tv', 'profile-handheld');
    document.body.classList.add(`profile-${profile}`);
  }, [tvMode, profile]);

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await window.api.providersSyncAll();
      notify(
        res.totalInserted > 0
          ? `Sync completo: ${res.totalInserted} jogos novos (${res.totalScanned} no total)`
          : `Sync completo: ${res.totalScanned} jogos verificados`
      );
      await refresh();
      void syncRatings(false, { quiet: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  const syncRatings = async (
    force = false,
    opts?: { quiet?: boolean; gameIds?: string[] }
  ) => {
    if (enrichRunning.current) return;
    enrichRunning.current = true;
    setSyncingRatings(true);
    setEnrichProgress({ index: 0, total: 0, title: 'Preparando…' });
    try {
      const batchSize = opts?.quiet && !force && !opts?.gameIds?.length ? 48 : undefined;
      let totalUpdated = 0;
      let totalCovers = 0;
      let totalAttempted = 0;
      let batches = 0;

      // quiet: lotes de 48 até esgotar elegíveis (não para no primeiro)
      while (batches < 250) {
        batches += 1;
        const res = await window.api.ratingsEnrichStream({
          force: force && batches === 1,
          maxGames: batchSize,
          gameIds: opts?.gameIds,
        });
        totalUpdated += res.updated;
        totalCovers += res.covers ?? 0;
        totalAttempted += res.attempted;

        if (!batchSize || opts?.gameIds?.length) break;
        if (res.attempted === 0) break;
        // lote incompleto = não há mais o que processar agora
        if (res.attempted < batchSize) break;
        // respira a UI entre lotes
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!opts?.quiet) {
        if (totalAttempted === 0) {
          notify('Nenhuma nota Steam pendente (tudo recente ou só retro)');
        } else if (totalUpdated > 0) {
          notify(
            `Steam %: ${totalUpdated} notas` +
              (totalCovers ? ` · ${totalCovers} capas retro` : '') +
              (batches > 1 ? ` · ${batches} lotes` : '')
          );
        } else {
          notify(
            `Steam %: 0 notas em ${totalAttempted} tentativas` +
              (totalCovers ? ` · ${totalCovers} capas` : '') +
              ' — veja logs em userData/logs/ratings-*.log',
            'error'
          );
        }
      }
      await refreshRatings();
      if (!opts?.quiet) await refresh();
    } catch (err) {
      if (!opts?.quiet) notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      enrichRunning.current = false;
      setSyncingRatings(false);
      setEnrichProgress(null);
    }
  };

  // Boot: 1) scan retro → 2) capas retro → 3) notas (via enrich em fases)
  const autoEnrichDone = useRef(false);
  useEffect(() => {
    if (!ready || autoEnrichDone.current) return;
    autoEnrichDone.current = true;

    const bootPipeline = async () => {
      try {
        const setup = await window.api.emulationSetupGet();
        if (setup.romsConfigured) {
          setEnrichProgress({ index: 0, total: 0, title: 'Escaneando ROMs…' });
          await window.api.emulationScanAll();
          await refresh();
        }
      } catch {
        // sem pasta retro — segue
      }
      await syncRatings(false, { quiet: true });
    };

    const t = setTimeout(() => {
      void bootPipeline();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!sideNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSideNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sideNavOpen]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingRatings: Record<string, RatingsSummary | null> = {};
    const pendingCovers = new Map<string, string | null>();
    const pendingSteamIds = new Map<string, string | null>();
    let latestProgress: { index: number; total: number; title: string } | null = null;

    const flush = () => {
      flushTimer = null;
      if (latestProgress) setEnrichProgress(latestProgress);
      const ratingKeys = Object.keys(pendingRatings);
      if (ratingKeys.length > 0) {
        const batch = { ...pendingRatings };
        for (const k of ratingKeys) delete pendingRatings[k];
        setRatings((prev) => ({ ...prev, ...batch }));
      }
      if (pendingCovers.size > 0 || pendingSteamIds.size > 0) {
        const covers = new Map(pendingCovers);
        const steamIds = new Map(pendingSteamIds);
        pendingCovers.clear();
        pendingSteamIds.clear();
        setGames((prev) =>
          prev.map((g) => {
            let next = g;
            if (covers.has(g.id)) next = { ...next, coverPath: covers.get(g.id) ?? null };
            if (steamIds.has(g.id)) next = { ...next, steamAppId: steamIds.get(g.id) ?? null };
            return next;
          })
        );
      }
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(flush, 280);
    };

    return window.api.onLibraryEnrichProgress((ev) => {
      if (ev.type === 'start') {
        setEnrichProgress({ index: 0, total: ev.total, title: 'Iniciando…' });
        return;
      }
      if (ev.type === 'item') {
        latestProgress = { index: ev.index, total: ev.total, title: ev.title };
        pendingRatings[ev.gameId] = ev.summary;
        if (ev.coverPath) pendingCovers.set(ev.gameId, ev.coverPath);
        if (ev.steamAppId !== undefined) pendingSteamIds.set(ev.gameId, ev.steamAppId);
        scheduleFlush();
        return;
      }
      if (ev.type === 'done' || ev.type === 'error') {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flush();
        }
        setEnrichProgress(null);
      }
    });
  }, []);

  const ratingSourceScore = (
    summary: RatingsSummary | null | undefined,
    source: 'rawg' | 'metacritic' | 'steam'
  ): number => {
    const row = summary?.sources.find((s) => s.source === source);
    if (row?.score == null || row.score <= 0) return 0;
    if (source === 'rawg' && row.score <= 5) return Math.round(row.score * 20 * 10) / 10;
    return row.score;
  };

  const cols = Math.max(1, Math.floor((window.innerWidth - PADDING * 2) / (CARD_W + GAP)));

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) for (const genre of g.genres) set.add(genre);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [games]);

  const useRatingGroups = sortBy === 'rating' || sortBy === 'steam';

  useEffect(() => {
    // opção "Steam %" duplicada removida — migra estado antigo
    if (sortBy === 'steam') setSortBy('rating');
  }, [sortBy]);

  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((g) => {
      if (filter !== 'all' && !g.sources.some((s) => s.platform === filter)) return false;
      if (installedOnly && !g.sources.some((s) => s.isInstalled)) return false;
      if (genreFilter !== 'all' && !g.genres.includes(genreFilter)) return false;
      if (minRating > 0 && (ratings[g.id]?.score ?? 0) < minRating) return false;
      if (q) {
        const haystack = `${g.title} ${g.normalizedTitle} ${g.sources.map((s) => s.title).join(' ')}`.toLowerCase();
        if (!q.split(/\s+/).every((token) => haystack.includes(token))) return false;
      }
      return true;
    });
  }, [games, filter, genreFilter, installedOnly, query, minRating, ratings]);

  const ratingGroups = useMemo(() => {
    if (!useRatingGroups) return null;
    return buildRatingGroups(filteredGames, ratings);
  }, [useRatingGroups, filteredGames, ratings]);

  useEffect(() => {
    setGroupOpen({});
    setSelected(0);
  }, [sortBy]);

  useEffect(() => {
    if (!ratingGroups) return;
    setGroupOpen((prev) => {
      const defaults = defaultCollapsedState(ratingGroups);
      if (Object.keys(prev).length === 0) return defaults;
      const next = { ...defaults };
      for (const g of ratingGroups) {
        if (g.id in prev) next[g.id] = prev[g.id];
      }
      return next;
    });
  }, [ratingGroups]);

  const visibleGames = useMemo(() => {
    if (ratingGroups) {
      return flattenOpenGroupGames(ratingGroups, groupOpen);
    }
    const sorted = [...filteredGames];
    if (sortBy === 'rawg') {
      sorted.sort(
        (a, b) => ratingSourceScore(ratings[b.id], 'rawg') - ratingSourceScore(ratings[a.id], 'rawg')
      );
    } else if (sortBy === 'metacritic') {
      sorted.sort(
        (a, b) =>
          ratingSourceScore(ratings[b.id], 'metacritic') -
          ratingSourceScore(ratings[a.id], 'metacritic')
      );
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [ratingGroups, groupOpen, filteredGames, sortBy, ratings]);

  const gridRows = useMemo(() => {
    if (!ratingGroups) return undefined;
    return buildGridRows(ratingGroups, groupOpen, cols);
  }, [ratingGroups, groupOpen, cols]);

  const toggleRatingGroup = useCallback((groupId: RatingBandId) => {
    setGroupOpen((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  useEffect(() => {
    if (visibleGames.length === 0) {
      setSelected(0);
      return;
    }
    setSelected((i) => Math.min(i, visibleGames.length - 1));
  }, [visibleGames.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        void window.api.windowToggleFullscreen();
        return;
      }
      if (view.kind !== 'library') return;
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setView({ kind: 'form', gameId: null });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, visibleGames.length - 1));
        uiMove();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        uiMove();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + cols, visibleGames.length - 1));
        uiMove();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - cols, 0));
        uiMove();
      } else if (e.key === 'Enter' && visibleGames.length > 0) {
        e.preventDefault();
        uiSelect();
        setView({ kind: 'detail', gameId: visibleGames[selected].id });
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          (document.activeElement as HTMLElement).blur();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, visibleGames, selected, cols]);

  const padNavRef = useRef({
    selected,
    visibleGames,
    cols,
    view,
    section,
    sideNavOpen,
  });
  padNavRef.current = {
    selected,
    visibleGames,
    cols,
    view,
    section,
    sideNavOpen,
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      ensureFocus(getPadRoot());
    });
    return () => cancelAnimationFrame(id);
  }, [view, section]);

  useGamepadNav({
    enabled: true,
    tvMode,
    onDeviceChange: (device) => {
      document.body.classList.toggle('gamepad-active', device === 'gamepad');
      if (device === 'gamepad') {
        requestAnimationFrame(() => ensureFocus(getPadRoot()));
      }
    },
    onPadStatus: (status) => {
      const prev = padStatusRef.current;
      padStatusRef.current = status;
      if (status.connected && !prev.connected) {
        const short = (status.id ?? 'Controle').split('(')[0]?.trim() || 'Controle';
        notify(`Controle detectado: ${short} — aperte um botão para navegar`);
      } else if (status.active && !prev.active) {
        notify('Navegação por controle ativa');
      } else if (!status.connected && prev.connected) {
        notify('Controle desconectado');
      }
    },
    onAction: (action) => {
      const n = padNavRef.current;
      const inLibraryShell = n.view.kind === 'library' && n.section === 'library';
      const active = document.activeElement as HTMLElement | null;
      const inGrid = isInsideGrid(active);

      if (action === 'back') {
        if (n.sideNavOpen) {
          setSideNavOpen(false);
          uiBack();
          requestAnimationFrame(() => focusSelectedCard());
          return;
        }
        uiBack();
        const beforeView = n.view.kind;
        const beforeSection = n.section;
        emitEscape();
        // Fallback se Escape não fechou overlay / mudou seção
        requestAnimationFrame(() => {
          const cur = padNavRef.current;
          if (beforeView !== 'library' && cur.view.kind === beforeView) {
            setView({ kind: 'library' });
            return;
          }
          if (
            beforeView === 'library' &&
            beforeSection !== 'library' &&
            cur.section === beforeSection
          ) {
            goSection('library');
          }
        });
        return;
      }

      if (action === 'search') {
        goSection('library');
        setView({ kind: 'library' });
        setSideNavOpen(false);
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (action === 'menu') {
        if (n.view.kind === 'settings' || n.view.kind === 'accounts') {
          setView({ kind: 'library' });
          setSideNavOpen(false);
          return;
        }
        if (n.view.kind !== 'library') {
          setView({ kind: 'library' });
        }
        setSideNavOpen((open) => {
          const next = !open;
          if (next) {
            requestAnimationFrame(() => {
              const first = sideNavRef.current?.querySelector<HTMLElement>('.side-nav__item');
              first?.focus({ preventScroll: true });
            });
          } else {
            requestAnimationFrame(() => focusSelectedCard());
          }
          return next;
        });
        return;
      }
      if (action === 'emulation') {
        goSection('retro');
        return;
      }

      if (action === 'filterPrev' || action === 'filterNext') {
        if (n.view.kind !== 'library' || n.section !== 'library') return;
        const ids = FILTER_OPTIONS.map((o) => o.id);
        setFilter((current) => {
          let i = ids.indexOf(current);
          if (i < 0) i = 0;
          const delta = action === 'filterNext' ? 1 : -1;
          return ids[(i + delta + ids.length) % ids.length];
        });
        setSelected(0);
        uiMove();
        return;
      }

      // Grade virtualizada: navegação por índice (DOM só monta linhas visíveis)
      const useGridNav =
        inLibraryShell &&
        (inGrid ||
          active?.classList.contains('card') ||
          !active ||
          active === document.body);

      if (useGridNav && (action === 'left' || action === 'right' || action === 'up' || action === 'down')) {
        const max = Math.max(n.visibleGames.length - 1, 0);
        if (action === 'left') {
          if (n.selected % n.cols === 0) {
            // Sai da grade → foco espacial (sidebar / filtros)
            moveFocus('left');
          } else {
            setSelected((i) => Math.max(i - 1, 0));
          }
        } else if (action === 'right') {
          setSelected((i) => Math.min(i + 1, max));
        } else if (action === 'up') {
          if (n.selected < n.cols) {
            moveFocus('up');
          } else {
            setSelected((i) => Math.max(i - n.cols, 0));
          }
        } else if (action === 'down') {
          setSelected((i) => Math.min(i + n.cols, max));
        }
        uiMove();
        requestAnimationFrame(() => focusSelectedCard());
        return;
      }

      if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
        moveFocus(action);
        uiMove();
        return;
      }

      if (action === 'confirm' || action === 'open') {
        uiSelect();
        if (inLibraryShell) {
          const fromDom = gameIdFromFocusedCard();
          const onCard =
            inGrid ||
            Boolean(fromDom) ||
            active?.classList.contains('card') ||
            !active ||
            active === document.body;
          if (onCard) {
            const game = fromDom
              ? n.visibleGames.find((g) => g.id === fromDom) ?? n.visibleGames[n.selected]
              : n.visibleGames[n.selected];
            if (game) {
              setView({ kind: 'detail', gameId: game.id });
              return;
            }
          }
        }
        activateFocused();
      }
    },
  });

  const save = async (input: CreateGameInput) => {
    if (view.kind !== 'form') return;
    if (view.gameId) {
      await window.api.libraryUpdate({ id: view.gameId, patch: input });
      notify('Jogo atualizado');
    } else {
      await window.api.libraryAdd(input);
      notify('Jogo adicionado');
    }
    await refresh();
    setView({ kind: 'library' });
  };

  const remove = async () => {
    if (view.kind !== 'detail') return;
    await window.api.libraryRemove(view.gameId);
    notify('Removido da biblioteca');
    await refresh();
    setView({ kind: 'library' });
  };

  const separateSource = async (source: GameSource) => {
    if (view.kind !== 'detail') return;
    try {
      await window.api.librarySeparateSource(source.id);
      notify('Fonte separada em um jogo próprio');
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const launch = async (game: Game, source?: GameSource): Promise<LaunchResult> => {
    try {
      const res = source
        ? await window.api.libraryLaunchSource(source.id)
        : await window.api.libraryLaunch(game.id);
      if (res.ok) {
        notify(`Iniciando ${game.title}…`);
        await refresh();
      } else if (res.error) {
        notify(res.error, 'error');
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(msg, 'error');
      return { ok: false, error: msg };
    }
  };

  const install = async (game: Game, source?: GameSource): Promise<LaunchResult> => {
    try {
      const res = source
        ? await window.api.libraryInstallSource(source.id)
        : await window.api.libraryInstall(game.id);
      if (res.ok) {
        notify(`Abrindo instalação de ${game.title} na loja…`);
      } else if (res.error) {
        notify(res.error, 'error');
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(msg, 'error');
      return { ok: false, error: msg };
    }
  };

  const detailGame =
    view.kind === 'detail' ? games.find((g) => g.id === view.gameId) ?? null : null;
  const formGame =
    view.kind === 'form' && view.gameId ? games.find((g) => g.id === view.gameId) ?? null : null;

  return {
    games,
    view,
    setView,
    selected,
    setSelected,
    toast,
    steam,
    stores,
    filter,
    setFilter,
    genreFilter,
    setGenreFilter,
    installedOnly,
    setInstalledOnly,
    query,
    setQuery,
    syncingAll,
    tvMode,
    profile,
    profileTokens,
    ratings,
    syncingRatings,
    sortBy,
    setSortBy,
    enrichProgress,
    minRating,
    setMinRating,
    hideNotes,
    user,
    setUser,
    section,
    showOnboarding,
    setShowOnboarding,
    ready,
    headerMenuOpen,
    setHeaderMenuOpen,
    sideNavOpen,
    setSideNavOpen,
    searchRef,
    headerMenuRef,
    sideNavRef,
    refreshRatings,
    notify,
    checkAuth,
    logout,
    goSection,
    refresh,
    finishStoresSetup,
    reloadUxSettings,
    syncAll,
    syncRatings,
    allGenres,
    useRatingGroups,
    filteredGames,
    ratingGroups,
    visibleGames,
    gridRows,
    cols,
    toggleRatingGroup,
    save,
    remove,
    separateSource,
    launch,
    install,
    detailGame,
    formGame,
  };
}
