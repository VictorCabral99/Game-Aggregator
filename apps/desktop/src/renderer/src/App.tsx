import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateGameInput,
  Game,
  GamePlatform,
  GameSource,
  LaunchResult,
  RatingsSummary,
  ProfileId,
  ProfileTokens,
  SteamStatus,
  StoreId,
  StoreStatus,
} from '../../shared/api';
import GameCard from './components/GameCard';
import VirtualizedGameGrid from './components/VirtualizedGameGrid';
import GameDetailModal from './components/GameDetailModal';
import GameFormModal from './components/GameFormModal';
import ProvidersModal from './components/ProvidersModal';
import AboutModal from './components/AboutModal';
import DuplicatesModal from './components/DuplicatesModal';
import EmulationModal from './components/EmulationModal';
import SettingsModal from './components/SettingsModal';
import WishlistModal from './components/WishlistModal';
import LoginModal from './components/LoginModal';
import AccountsPanel from './components/AccountsPanel';
import StoreConnectScreen from './components/StoreConnectScreen';
import OnboardingModal from './components/OnboardingModal';
import Toast from './components/Toast';
import { useGamepadNav } from './hooks/useGamepadNav';
import { setSoundsEnabled, uiBack, uiMove, uiSelect } from './lib/sounds';

type View =
  | { kind: 'library' }
  | { kind: 'detail'; gameId: string }
  | { kind: 'form'; gameId: string | null }
  | { kind: 'providers' }
  | { kind: 'about' }
  | { kind: 'duplicates' }
  | { kind: 'emulation' }
  | { kind: 'wishlist' }
  | { kind: 'settings' }
  | { kind: 'accounts' };

type AppSection = 'library' | 'stores' | 'wishlist' | 'retro';

type PlatformFilter = 'all' | GamePlatform;

interface ToastState {
  message: string;
  kind: 'ok' | 'error';
}

const STORE_LABELS: Array<{ id: StoreId; label: string }> = [
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
];

const FILTER_OPTIONS: Array<{ id: PlatformFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'local', label: 'Local' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'emulator', label: 'Retro' },
];

export default function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>({ kind: 'library' });
  const [selected, setSelected] = useState(0);
  /** Zona de foco do controle: grade, filtros ou sidebar. */
  const [padZone, setPadZone] = useState<'grid' | 'filters' | 'sidebar'>('grid');
  const [padFilterIdx, setPadFilterIdx] = useState(0);
  const [padSidebarIdx, setPadSidebarIdx] = useState(0);
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
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'rawg' | 'metacritic' | 'steam' | 'recent'>(
    'name'
  );
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const enrichRunning = useRef(false);

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

  const syncRatings = async (force = false, opts?: { quiet?: boolean }) => {
    if (enrichRunning.current) return;
    enrichRunning.current = true;
    setSyncingRatings(true);
    setEnrichProgress({ index: 0, total: 0, title: 'Preparando…' });
    try {
      const batchSize = opts?.quiet && !force ? 48 : undefined;
      let totalUpdated = 0;
      let totalCovers = 0;
      let totalAttempted = 0;
      let lastNoKey = false;
      let batches = 0;

      // quiet: lotes de 48 até esgotar elegíveis (não para no primeiro)
      while (batches < 250) {
        batches += 1;
        const res = await window.api.ratingsEnrichStream({
          force: force && batches === 1,
          maxGames: batchSize,
        });
        lastNoKey = Boolean(res.noKey);
        totalUpdated += res.updated;
        totalCovers += res.covers ?? 0;
        totalAttempted += res.attempted;

        if (!batchSize) break;
        if (res.attempted === 0) break;
        // lote incompleto = não há mais o que processar agora
        if (res.attempted < batchSize) break;
        // respira a UI entre lotes
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!opts?.quiet) {
        if (lastNoKey && totalUpdated === 0 && totalCovers === 0) {
          notify('Defina a chave RAWG em Configurações para buscar notas', 'error');
        } else if (totalAttempted > 0) {
          notify(
            `Enriquecimento: ${totalUpdated} notas` +
              (totalCovers ? ` · ${totalCovers} capas retro` : '') +
              (batches > 1 ? ` · ${batches} lotes` : '')
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
      if (pendingCovers.size > 0) {
        const covers = new Map(pendingCovers);
        pendingCovers.clear();
        setGames((prev) =>
          prev.map((g) => (covers.has(g.id) ? { ...g, coverPath: covers.get(g.id) ?? null } : g))
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

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = games.filter((g) => {
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
    const sorted = [...scored];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => (ratings[b.id]?.score ?? 0) - (ratings[a.id]?.score ?? 0));
    } else if (sortBy === 'rawg') {
      sorted.sort(
        (a, b) => ratingSourceScore(ratings[b.id], 'rawg') - ratingSourceScore(ratings[a.id], 'rawg')
      );
    } else if (sortBy === 'metacritic') {
      sorted.sort(
        (a, b) =>
          ratingSourceScore(ratings[b.id], 'metacritic') -
          ratingSourceScore(ratings[a.id], 'metacritic')
      );
    } else if (sortBy === 'steam') {
      sorted.sort(
        (a, b) => ratingSourceScore(ratings[b.id], 'steam') - ratingSourceScore(ratings[a.id], 'steam')
      );
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) =>
        (b.preferredSource?.lastPlayedAt ?? '').localeCompare(a.preferredSource?.lastPlayedAt ?? '')
      );
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [games, filter, genreFilter, installedOnly, query, minRating, sortBy, ratings]);

  useEffect(() => {
    if (visibleGames.length === 0) {
      setSelected(0);
      return;
    }
    setSelected((i) => Math.min(i, visibleGames.length - 1));
  }, [visibleGames.length]);

  // Shelf "Esquecidos bem avaliados" (P6-08): score ≥ 80 e nunca/raramente jogado.
  const forgottenHighScore = useMemo(() => {
    return games
      .filter((g) => (ratings[g.id]?.score ?? 0) >= 80)
      .filter((g) => !g.sources.some((s) => s.lastPlayedAt))
      .slice(0, 6);
  }, [games, ratings]);

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

  const SIDEBAR_PAD = [
    { id: 'library' as const, run: () => goSection('library') },
    { id: 'stores' as const, run: () => goSection('stores') },
    { id: 'wishlist' as const, run: () => goSection('wishlist') },
    { id: 'retro' as const, run: () => goSection('retro') },
    { id: 'settings' as const, run: () => setView({ kind: 'settings' }) },
  ];

  const FILTER_PAD = [
    ...FILTER_OPTIONS.map((f) => ({
      id: f.id,
      label: f.label,
      apply: () => {
        setFilter(f.id);
        setSelected(0);
        setPadZone('grid');
      },
    })),
    {
      id: 'installed',
      label: 'Instalados',
      apply: () => {
        setInstalledOnly((v) => !v);
        setSelected(0);
      },
    },
    {
      id: 'rating80',
      label: 'Nota ≥ 80',
      apply: () => {
        setMinRating((v) => (v === 80 ? 0 : 80));
        setSelected(0);
      },
    },
  ];

  const padNavRef = useRef({
    selected,
    visibleGames,
    cols,
    view,
    section,
    padZone,
    padFilterIdx,
    padSidebarIdx,
    filter,
    installedOnly,
    minRating,
  });
  padNavRef.current = {
    selected,
    visibleGames,
    cols,
    view,
    section,
    padZone,
    padFilterIdx,
    padSidebarIdx,
    filter,
    installedOnly,
    minRating,
  };

  useGamepadNav({
    enabled: true,
    tvMode,
    onDeviceChange: (device) => {
      document.body.classList.toggle('gamepad-active', device === 'gamepad');
    },
    onAction: (action) => {
      const n = padNavRef.current;
      const inLibrary = n.view.kind === 'library' && n.section === 'library';

      if (action === 'back') {
        uiBack();
        if (n.view.kind !== 'library') {
          setView({ kind: 'library' });
          return;
        }
        if (n.padZone !== 'grid') {
          setPadZone('grid');
          return;
        }
        if (n.section !== 'library') goSection('library');
        return;
      }

      if (action === 'search') {
        goSection('library');
        setPadZone('grid');
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (action === 'settings') {
        setView((v) => (v.kind === 'settings' ? { kind: 'library' } : { kind: 'settings' }));
        return;
      }
      if (action === 'emulation') {
        goSection('retro');
        return;
      }

      if (!inLibrary) return;

      // —— Sidebar ——
      if (n.padZone === 'sidebar') {
        if (action === 'up') {
          setPadSidebarIdx((i) => Math.max(0, i - 1));
          uiMove();
        } else if (action === 'down') {
          setPadSidebarIdx((i) => Math.min(SIDEBAR_PAD.length - 1, i + 1));
          uiMove();
        } else if (action === 'right') {
          setPadZone('filters');
          uiMove();
        } else if (action === 'confirm' || action === 'open') {
          uiSelect();
          SIDEBAR_PAD[n.padSidebarIdx]?.run();
        }
        return;
      }

      // —— Filtros ——
      if (n.padZone === 'filters') {
        if (action === 'left') {
          if (n.padFilterIdx === 0) {
            setPadZone('sidebar');
          } else {
            setPadFilterIdx((i) => Math.max(0, i - 1));
          }
          uiMove();
        } else if (action === 'right') {
          setPadFilterIdx((i) => Math.min(FILTER_PAD.length - 1, i + 1));
          uiMove();
        } else if (action === 'up') {
          setPadZone('sidebar');
          uiMove();
        } else if (action === 'down') {
          setPadZone('grid');
          uiMove();
        } else if (action === 'confirm' || action === 'open') {
          uiSelect();
          FILTER_PAD[n.padFilterIdx]?.apply();
        }
        return;
      }

      // —— Grade ——
      if (action === 'left') {
        if (n.selected % n.cols === 0) {
          setPadZone('sidebar');
        } else {
          setSelected((i) => Math.max(i - 1, 0));
        }
        uiMove();
      } else if (action === 'right') {
        setSelected((i) => Math.min(i + 1, Math.max(n.visibleGames.length - 1, 0)));
        uiMove();
      } else if (action === 'up') {
        if (n.selected < n.cols) {
          setPadZone('filters');
        } else {
          setSelected((i) => Math.max(i - n.cols, 0));
        }
        uiMove();
      } else if (action === 'down') {
        setSelected((i) => Math.min(i + n.cols, Math.max(n.visibleGames.length - 1, 0)));
        uiMove();
      } else if (action === 'confirm' || action === 'open') {
        uiSelect();
        const game = n.visibleGames[n.selected];
        if (game) setView({ kind: 'detail', gameId: game.id });
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
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(msg, 'error');
      return { ok: false, error: msg };
    }
  };

  const recentGames = useMemo(() => {
    return games
      .filter((g) => g.preferredSource?.lastPlayedAt)
      .sort((a, b) =>
        (b.preferredSource?.lastPlayedAt ?? '').localeCompare(a.preferredSource?.lastPlayedAt ?? '')
      )
      .slice(0, 8);
  }, [games]);

  const detailGame =
    view.kind === 'detail' ? games.find((g) => g.id === view.gameId) ?? null : null;
  const formGame =
    view.kind === 'form' && view.gameId ? games.find((g) => g.id === view.gameId) ?? null : null;

  return (
    <div className={`app-layout ${user ? 'app-layout--authed' : ''}`}>
      {user && (
        <nav className="side-nav" aria-label="Navegação principal">
          <div className="side-nav__brand">
            <strong>Game Aggregator</strong>
            <small>{user.name?.split(' ')[0] || user.email}</small>
          </div>
          <button
            type="button"
            className={`side-nav__item ${section === 'library' ? 'side-nav__item--active' : ''} ${
              padZone === 'sidebar' && padSidebarIdx === 0 ? 'side-nav__item--focus' : ''
            }`}
            onClick={() => goSection('library')}
          >
            <span className="side-nav__label">Jogos</span>
            <span className="side-nav__hint">Biblioteca</span>
          </button>
          <button
            type="button"
            className={`side-nav__item ${section === 'stores' ? 'side-nav__item--active' : ''} ${
              padZone === 'sidebar' && padSidebarIdx === 1 ? 'side-nav__item--focus' : ''
            }`}
            onClick={() => goSection('stores')}
          >
            <span className="side-nav__label">Lojas</span>
            <span className="side-nav__hint">Conectar fontes</span>
          </button>
          <button
            type="button"
            className={`side-nav__item ${section === 'wishlist' ? 'side-nav__item--active' : ''} ${
              padZone === 'sidebar' && padSidebarIdx === 2 ? 'side-nav__item--focus' : ''
            }`}
            onClick={() => goSection('wishlist')}
          >
            <span className="side-nav__label">Wishlist</span>
            <span className="side-nav__hint">Promoções</span>
          </button>
          <button
            type="button"
            className={`side-nav__item ${section === 'retro' ? 'side-nav__item--active' : ''} ${
              padZone === 'sidebar' && padSidebarIdx === 3 ? 'side-nav__item--focus' : ''
            }`}
            onClick={() => goSection('retro')}
          >
            <span className="side-nav__label">Retro</span>
            <span className="side-nav__hint">Consoles e ROMs</span>
          </button>
          <div className="side-nav__spacer" />
          <button
            type="button"
            className={`side-nav__item side-nav__item--ghost ${
              padZone === 'sidebar' && padSidebarIdx === 4 ? 'side-nav__item--focus' : ''
            }`}
            onClick={() => setView({ kind: 'settings' })}
          >
            <span className="side-nav__label">Configurações</span>
          </button>
          <button type="button" className="side-nav__item side-nav__item--ghost" onClick={() => void logout()}>
            <span className="side-nav__label">Sair</span>
          </button>
        </nav>
      )}

      <main className="shell">
      {section === 'stores' && user ? (
        <StoreConnectScreen
          embedded
          userName={user.name}
          onContinue={finishStoresSetup}
          onLibraryChanged={() => {
            void refresh();
            void window.api.ratingsEnrichStream({}).then(() => {
              void refreshRatings();
              void refresh();
            }).catch(() => undefined);
          }}
          onOpenEmulation={() => goSection('retro')}
        />
      ) : section === 'wishlist' && user ? (
        <WishlistModal
          embedded
          onClose={() => goSection('library')}
          onAlerts={(alerts) =>
            notify(
              alerts.map((a) => `${a.title} — ${a.currentPrice.toFixed(2)} ${a.currency}`).join(' · '),
              'ok'
            )
          }
        />
      ) : section === 'retro' && user ? (
        <EmulationModal
          embedded
          onClose={() => goSection('library')}
          onLaunch={launch}
          onChanged={() => void refresh()}
        />
      ) : (
        <>
      <header className="shell__header">
        <h1>Game Aggregator Launcher</h1>
        <span className="badge">{games.length} jogos</span>
        {steam && (
          <span className={`badge badge--steam ${steam.available ? '' : 'badge--muted'}`}>
            {steam.available
              ? `Steam: ${steam.gamesCount} detectados`
              : 'Steam não encontrado'}
          </span>
        )}
        {STORE_LABELS.map(({ id, label }) => {
          const s = stores[id];
          const unavailable = !s?.available;
          return (
            <span key={id} className={`badge ${unavailable ? 'badge--muted' : ''}`}>
              {unavailable ? `${label} indisponível` : `${label}: ${s.gamesCount}`}
            </span>
          );
        })}
        <div className="header__actions" ref={headerMenuRef}>
          <button
            type="button"
            className="primary"
            onClick={() => setView({ kind: 'form', gameId: null })}
          >
            + Adicionar
          </button>
          <div className="kebab">
            <button
              type="button"
              className="kebab__btn"
              aria-haspopup="menu"
              aria-expanded={headerMenuOpen}
              aria-label="Mais ações"
              title="Mais ações"
              onClick={() => setHeaderMenuOpen((o) => !o)}
            >
              ⋯
            </button>
            {headerMenuOpen && (
              <div className="kebab__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={syncingAll}
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void syncAll();
                  }}
                >
                  {syncingAll ? 'Sincronizando lojas…' : 'Sync lojas'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={syncingRatings}
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void syncRatings(true);
                  }}
                >
                  {syncingRatings ? 'Enriquecendo…' : 'Atualizar notas (+ capas retro)'}
                </button>
                <hr className="kebab__sep" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    void window.api.windowToggleFullscreen();
                  }}
                >
                  Tela cheia (F11)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setView({ kind: 'providers' });
                  }}
                >
                  Providers
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setView({ kind: 'duplicates' });
                  }}
                >
                  Duplicatas
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setView({ kind: 'settings' });
                  }}
                >
                  Configurações
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setView({ kind: 'about' });
                  }}
                >
                  Sobre
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {enrichProgress && (
        <div className="enrich-bar" role="status" aria-live="polite">
          <strong>
            {enrichProgress.total > 0
              ? `${enrichProgress.index}/${enrichProgress.total}`
              : '…'}
          </strong>
          <div className="enrich-bar__track">
            <div
              className="enrich-bar__fill"
              style={{
                width:
                  enrichProgress.total > 0
                    ? `${Math.round((enrichProgress.index / enrichProgress.total) * 100)}%`
                    : '8%',
              }}
            />
          </div>
          <span className="hint">
            Retro → capas → notas — {enrichProgress.title}
          </span>
        </div>
      )}

      <div className="filters" role="tablist" aria-label="Filtrar por plataforma">
        {FILTER_OPTIONS.map(({ id, label }, fi) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`filter-chip ${filter === id ? 'filter-chip--active' : ''} ${
              padZone === 'filters' && padFilterIdx === fi ? 'filter-chip--focus' : ''
            }`}
            onClick={() => {
              setFilter(id);
              setSelected(0);
              setPadZone('grid');
            }}
          >
            {label}
            <span className="filter-chip__count">
              {id === 'all'
                ? games.length
                : games.filter((g) => g.sources.some((s) => s.platform === id)).length}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip ${installedOnly ? 'filter-chip--active' : ''} ${
            padZone === 'filters' && padFilterIdx === FILTER_OPTIONS.length
              ? 'filter-chip--focus'
              : ''
          }`}
          aria-pressed={installedOnly}
          onClick={() => {
            setInstalledOnly((v) => !v);
            setSelected(0);
          }}
        >
          Instalados
          <span className="filter-chip__count">
            {games.filter((g) => g.sources.some((s) => s.isInstalled)).length}
          </span>
        </button>
        <button
          type="button"
          className={`filter-chip ${minRating === 80 ? 'filter-chip--active' : ''} ${
            padZone === 'filters' && padFilterIdx === FILTER_OPTIONS.length + 1
              ? 'filter-chip--focus'
              : ''
          }`}
          aria-pressed={minRating === 80}
          onClick={() => {
            setMinRating((v) => (v === 80 ? 0 : 80));
            setSelected(0);
          }}
        >
          Nota ≥ 80
          <span className="filter-chip__count">
            {games.filter((g) => (ratings[g.id]?.score ?? 0) >= 80).length}
          </span>
        </button>
      </div>

      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          className="search"
          placeholder="Buscar por nome… (Y no controle)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        <select
          className="genre-filter"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as 'name' | 'rating' | 'recent');
            setSelected(0);
          }}
          aria-label="Ordenar por"
        >
          <option value="name">Ordenar: nome</option>
          <option value="rating">Ordenar: nota (geral)</option>
          <option value="metacritic">Ordenar: Metacritic</option>
          <option value="rawg">Ordenar: RAWG</option>
          <option value="steam">Ordenar: Steam %</option>
          <option value="recent">Ordenar: recentes</option>
        </select>
        {allGenres.length > 0 && (
          <select
            className="genre-filter"
            value={genreFilter}
            onChange={(e) => {
              setGenreFilter(e.target.value);
              setSelected(0);
            }}
            aria-label="Filtrar por gênero"
          >
            <option value="all">Todos os gêneros</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__count">{visibleGames.length} de {games.length} jogos</span>
      </div>

      {view.kind === 'library' && filter === 'all' && !query && recentGames.length > 0 && (
        <section className="recent" aria-label="Continuar jogando">
          <h2 className="recent__title">Continuar</h2>
          <div className="recent__row">
            {recentGames.map((game, i) => (
              <GameCard
                key={game.id}
                game={game}
                selected={false}
                score={ratings[game.id]?.score}
                ratingSummary={ratings[game.id]}
                hideScore={hideNotes}
                onSelect={() => {
                  setSelected(0);
                  setView({ kind: 'detail', gameId: game.id });
                }}
                onOpen={() => setView({ kind: 'detail', gameId: game.id })}
              />
            ))}
          </div>
        </section>
      )}

      {view.kind === 'library' && filter === 'all' && !query && forgottenHighScore.length > 0 && (
        <section className="recent" aria-label="Esquecidos bem avaliados">
          <h2 className="recent__title">Esquecidos bem avaliados</h2>
          <div className="recent__row">
            {forgottenHighScore.map((game, i) => (
              <GameCard
                key={game.id}
                game={game}
                selected={false}
                score={ratings[game.id]?.score}
                ratingSummary={ratings[game.id]}
                hideScore={hideNotes}
                onSelect={() => {
                  setSelected(0);
                  setView({ kind: 'detail', gameId: game.id });
                }}
                onOpen={() => setView({ kind: 'detail', gameId: game.id })}
              />
            ))}
          </div>
        </section>
      )}

      {visibleGames.length === 0 ? (
        <section className="empty">
          {games.length === 0 ? (
            <>
              <h2>Biblioteca vazia</h2>
              <p>Adicione o primeiro jogo (.exe) para começar.</p>
              <button type="button" className="primary" onClick={() => setView({ kind: 'form', gameId: null })}>
                Adicionar jogo
              </button>
            </>
          ) : (
            <>
              <h2>Nenhum jogo nesta plataforma</h2>
              <p>Sincronize a biblioteca ou troque o filtro.</p>
            </>
          )}
        </section>
      ) : (
        <VirtualizedGameGrid
          games={visibleGames}
          cols={cols}
          selected={padZone === 'grid' ? selected : -1}
          scores={Object.fromEntries(
            visibleGames.map((g) => [g.id, ratings[g.id]?.score ?? null])
          )}
          ratings={ratings}
          hideScores={hideNotes}
          cardHeight={Math.round(profileTokens.cardWidth * 1.45)}
          gap={profileTokens.cardGap}
          onSelect={(index) => {
            setPadZone('grid');
            setSelected(index);
          }}
          onOpen={(gameId) => setView({ kind: 'detail', gameId })}
        />
      )}

      {!ready && <div className="boot-ready" aria-live="polite">Carregando biblioteca…</div>}

      <footer className="hint">
        Controle: ↑ filtros · ← sidebar · A confirma · B volta · Y busca · Start config
      </footer>
        </>
      )}

      {detailGame && (
        <GameDetailModal
          game={detailGame}
          rating={ratings[detailGame.id] ?? null}
          hideScore={hideNotes}
          onClose={() => setView({ kind: 'library' })}
          onEdit={() => setView({ kind: 'form', gameId: detailGame.id })}
          onRemove={() => remove()}
          onLaunch={launch}
          onSeparateSource={separateSource}
          onSyncRating={() => void syncRatings()}
        />
      )}

      {view.kind === 'form' && (
        <GameFormModal
          game={formGame}
          onClose={() => setView({ kind: 'library' })}
          onSave={save}
        />
      )}

      {view.kind === 'providers' && <ProvidersModal onClose={() => setView({ kind: 'library' })} />}

      {view.kind === 'about' && <AboutModal onClose={() => setView({ kind: 'library' })} />}

      {view.kind === 'duplicates' && (
        <DuplicatesModal
          onClose={() => setView({ kind: 'library' })}
          onMerged={() => void refresh()}
        />
      )}

      {view.kind === 'emulation' && (
        <EmulationModal
          onClose={() => setView({ kind: 'library' })}
          onLaunch={launch}
          onChanged={() => void refresh()}
        />
      )}

      {view.kind === 'settings' && (
        <SettingsModal
          onClose={() => setView({ kind: 'library' })}
          onChanged={() => {
            reloadUxSettings();
            void refresh();
          }}
          onOpenAccounts={() => setView({ kind: 'accounts' })}
        />
      )}

      {view.kind === 'accounts' && (
        <AccountsPanel onClose={() => setView({ kind: 'settings' })} />
      )}

      {!user && (
        <LoginModal
          onSuccess={(u) => {
            setUser(u);
            void window.api.settingsGet('onboarding.stores').then((done) => {
              setSection(done !== '1' ? 'stores' : 'library');
            });
          }}
        />
      )}

      {showOnboarding && user && section === 'library' && (
        <OnboardingModal
          steamAvailable={Boolean(steam?.available)}
          steamGames={steam?.gamesCount ?? 0}
          onSyncSteam={async () => {
            const res = await window.api.steamScan();
            notify(
              res.inserted > 0
                ? `Steam: ${res.inserted} jogos novos (${res.total} no total)`
                : `Steam: ${res.total} jogos verificados`
            );
            await refresh();
            await window.api.settingsSet('onboarding.done', '1');
            setShowOnboarding(false);
          }}
          onSkip={() => {
            void window.api.settingsSet('onboarding.done', '1');
            setShowOnboarding(false);
          }}
          onAddLocal={() => {
            void window.api.settingsSet('onboarding.done', '1');
            setShowOnboarding(false);
            setView({ kind: 'form', gameId: null });
          }}
        />
      )}

      <Toast message={toast?.message ?? ''} kind={toast?.kind ?? 'ok'} />
    </main>
    </div>
  );
}
