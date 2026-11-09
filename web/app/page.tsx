"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Genre,
  type Channel,
  type StbState,
  getGenres,
  getState,
  tuneChannel,
  toggleFavorite,
} from "@/lib/api";
import EditModal from "./components/EditModal";
import VirtualKeypad from "./components/VirtualKeypad";

const CHANNELS_PER_PAGE = 11;
const DIAL_TIMEOUT_MS = 3000;
const THREE_DIGIT_TUNE_DELAY_MS = 350;
const STATE_POLL_MS = 3000;
const REMOTE_FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

function getRemoteFocusableElements(): HTMLElement[] {
  const scope = document.querySelector<HTMLElement>(".modal-card") ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>(REMOTE_FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest('[aria-hidden="true"]'),
  );
}

function moveModalFocus(direction: "left" | "right" | "up" | "down"): void {
  const modal = document.querySelector<HTMLElement>(".modal-card");
  if (!modal) return;
  const focusable = getRemoteFocusableElements();
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !modal.contains(active) || !focusable.includes(active)) {
    focusable[0]?.focus();
    return;
  }

  const current = active.getBoundingClientRect();
  const currentX = current.left + current.width / 2;
  const currentY = current.top + current.height / 2;
  let next: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of focusable) {
    if (candidate === active) continue;
    const rect = candidate.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - currentX;
    const dy = rect.top + rect.height / 2 - currentY;
    const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const isInDirection = direction === "left" ? dx < -1
      : direction === "right" ? dx > 1
      : direction === "up" ? dy < -1
      : dy > 1;
    if (!isInDirection) continue;

    const score = primary + cross * 1.8 + (cross / (primary + 1)) * 8;
    if (score < bestScore) {
      bestScore = score;
      next = candidate;
    }
  }

  next?.focus();
}

function focusRemoteTarget(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target || target.getClientRects().length === 0) return false;
  target.focus();
  return true;
}

function focusAdjacentItem(selector: string, active: HTMLElement, direction: "up" | "down"): boolean {
  const items = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (item) => item.getClientRects().length > 0,
  );
  const index = items.indexOf(active);
  const targetIndex = index + (direction === "down" ? 1 : -1);
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return false;
  items[targetIndex].focus();
  return true;
}

function moveKeypadFocus(active: HTMLElement, direction: "left" | "right" | "up" | "down"): void {
  const row = Number(active.dataset.padRow);
  const column = Number(active.dataset.padCol);
  const keypadButtons = Array.from(document.querySelectorAll<HTMLElement>(".keypad-btn[data-pad-row]"))
    .filter((button) => button.getClientRects().length > 0);
  const candidates = keypadButtons
    .map((button) => ({ button, row: Number(button.dataset.padRow), column: Number(button.dataset.padCol) }))
    .filter(({ button, row: nextRow, column: nextColumn }) => {
      if (button === active) return false;
      return direction === "left" ? nextColumn < column
        : direction === "right" ? nextColumn > column
        : direction === "up" ? nextRow < row
        : nextRow > row;
    })
    .sort((a, b) => {
      const aPrimary = direction === "left" || direction === "right" ? Math.abs(a.column - column) : Math.abs(a.row - row);
      const bPrimary = direction === "left" || direction === "right" ? Math.abs(b.column - column) : Math.abs(b.row - row);
      const aCross = direction === "left" || direction === "right" ? Math.abs(a.row - row) : Math.abs(a.column - column);
      const bCross = direction === "left" || direction === "right" ? Math.abs(b.row - row) : Math.abs(b.column - column);
      return aPrimary - bPrimary || aCross - bCross;
    });

  if (candidates[0]) {
    candidates[0].button.focus();
  } else if (direction === "up" && row === 0) {
    focusRemoteTarget(".keypad-toggle-btn");
  } else if (direction === "down" && row === 5) {
    focusRemoteTarget(".edit-btn");
  } else if (direction === "left" && column === 0) {
    focusRemoteTarget(".channel-item.selected");
  }
}

function moveRemoteFocus(
  direction: "left" | "right" | "up" | "down",
  channelCount: number,
  focusChannelIndex: (index: number) => void,
): void {
  if (document.querySelector(".modal-card")) {
    moveModalFocus(direction);
    return;
  }

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;

  if (active.matches(".keypad-btn[data-pad-row]")) {
    moveKeypadFocus(active, direction);
    return;
  }

  if (active.matches(".genre-item")) {
    if (direction === "up" || direction === "down") {
      focusAdjacentItem(".genre-item", active, direction);
    } else if (direction === "right") {
      focusRemoteTarget(".channel-item.selected") || focusRemoteTarget(".channel-item");
    }
    return;
  }

  if (active.matches(".channel-item")) {
    const index = Number(active.dataset.remoteChannelIndex);
    if (direction === "up" || direction === "down") {
      if (!focusAdjacentItem(".channel-item", active, direction)) {
        const nextIndex = index + (direction === "down" ? 1 : -1);
        if (nextIndex >= 0 && nextIndex < channelCount) focusChannelIndex(nextIndex);
      }
    } else if (direction === "left") {
      focusRemoteTarget(".genre-item.selected");
    } else {
      focusRemoteTarget(`.fav-btn[data-channel-index="${index}"]`);
    }
    return;
  }

  if (active.matches(".fav-btn")) {
    const index = Number(active.dataset.channelIndex);
    if (direction === "left") {
      focusRemoteTarget(`[data-remote-channel-index="${index}"]`);
    } else if (direction === "right") {
      focusRemoteTarget(".keypad-toggle-btn");
    } else {
      const favoriteButtons = Array.from(document.querySelectorAll<HTMLElement>(".fav-btn"));
      const rowIndex = favoriteButtons.findIndex((button) => Number(button.dataset.channelIndex) === index);
      const targetButton = favoriteButtons[rowIndex + (direction === "down" ? 1 : -1)];
      if (targetButton) targetButton.focus();
      else {
        const nextIndex = index + (direction === "down" ? 1 : -1);
        if (nextIndex >= 0 && nextIndex < channelCount) focusChannelIndex(nextIndex);
      }
    }
    return;
  }

  if (active.matches(".keypad-toggle-btn")) {
    if (direction === "left") focusRemoteTarget(".channel-item.selected");
    else if (direction === "down") {
      if (!focusRemoteTarget(".keypad-btn[data-pad-row='0'][data-pad-col='0']")) {
        focusRemoteTarget(".edit-btn");
      }
    }
    return;
  }

  if (active.matches(".edit-btn")) {
    if (direction === "up") {
      focusRemoteTarget(".keypad-btn[data-pad-row='5']") || focusRemoteTarget(".keypad-toggle-btn");
    } else if (direction === "left") {
      focusRemoteTarget(".channel-item.selected");
    }
    return;
  }

  if (active === document.body || active === document.documentElement) {
    focusRemoteTarget(".channel-item.selected") ||
      focusRemoteTarget(".genre-item.selected") ||
      focusRemoteTarget(".keypad-toggle-btn") ||
      focusRemoteTarget(".edit-btn");
  }
}

export default function ChannelPickerPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [stbState, setStbState] = useState<StbState | null>(null);

  // Column focus: "genre" (parent), "channels" (children), or "sidebar"
  const [focusedColumn, setFocusedColumn] = useState<"genre" | "channels" | "sidebar">("channels");

  // Selection & Hover states
  const [selectedGenreIndex, setSelectedGenreIndex] = useState<number>(0);
  const [hoveredGenreIndex, setHoveredGenreIndex] = useState<number | null>(null);
  const [hoveredChannelIndex, setHoveredChannelIndex] = useState<number>(0);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(0);

  // Direct number dialing state (Point 5)
  const [dialBuffer, setDialBuffer] = useState<string>("");
  const dialBufferRef = useRef("");
  const [dialProgress, setDialProgress] = useState<number>(100);
  const dialTimerRef = useRef<number | null>(null);
  const dialIntervalRef = useRef<number | null>(null);

  // Tuning status
  const [tuningStatus, setTuningStatus] = useState<string | null>(null);
  const [lastTuned, setLastTuned] = useState<string | null>(null);
  const recentChannelIdsRef = useRef<number[]>([]);
  const channelPositionByGenreRef = useRef<Map<number, number>>(new Map());

  // Edit UI modal state (Point 6)
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);

  // Virtual Remote Keypad toggle state (collapsed by default)
  const [isKeypadOpen, setIsKeypadOpen] = useState<boolean>(false);

  const focusChannelRow = useCallback((channelIndex: number) => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-remote-channel-index="${channelIndex}"]`)
        ?.focus();
    });
  }, []);

  // Fetch genres from SQLite backend
  const loadGenres = useCallback(async () => {
    try {
      const data = await getGenres();
      setGenres(data);
    } catch (err) {
      console.error("Failed to load genres:", err);
    }
  }, []);

  useEffect(() => {
    void loadGenres();
  }, [loadGenres]);

  // Poll STB state for telemetry
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const next = await getState();
        if (active) setStbState(next);
      } catch {
        // silent on telemetry poll failure
      }
    };

    void poll();
    const id = window.setInterval(poll, STATE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  // Build display genres: synthetic ⭐ Favorites genre at top (if there are any favorites)
  const allFavoriteChannels = useMemo(() => {
    return genres.flatMap((g) => g.channels || []).filter((c) => c.isFavorite)
      .sort((a, b) => {
        if (a.favoriteOrder !== b.favoriteOrder) return a.favoriteOrder - b.favoriteOrder;
        return a.id - b.id;
      });
  }, [genres]);

  const displayGenres = useMemo<Genre[]>(() => {
    if (allFavoriteChannels.length === 0) return genres;
    const favGenre: Genre = {
      id: -1,
      name: "⭐ Favorites",
      sortOrder: -1,
      channels: allFavoriteChannels,
    };
    return [favGenre, ...genres];
  }, [genres, allFavoriteChannels]);

  // Safe active genre
  const currentGenre = useMemo(() => {
    if (displayGenres.length === 0) return null;
    const idx = Math.max(0, Math.min(selectedGenreIndex, displayGenres.length - 1));
    return displayGenres[idx];
  }, [displayGenres, selectedGenreIndex]);

  const currentChannels = useMemo(() => {
    return currentGenre?.channels || [];
  }, [currentGenre]);

  // Each genre keeps its own child-list position; never carry one genre's index
  // into another genre.
  const selectGenreRememberingChannelPosition = useCallback(
    (genreIndex: number) => {
      const currentGenreId = currentGenre?.id;
      const currentPosition = selectedChannelIndex ?? hoveredChannelIndex;
      if (currentGenreId != null && currentPosition >= 0) {
        channelPositionByGenreRef.current.set(currentGenreId, currentPosition);
      }

      const targetGenre = displayGenres[genreIndex];
      if (!targetGenre) return 0;
      const savedPosition = channelPositionByGenreRef.current.get(targetGenre.id) ?? 0;
      const channelCount = targetGenre.channels?.length ?? 0;
      const channelIndex = channelCount > 0
        ? Math.min(savedPosition, channelCount - 1)
        : savedPosition;

      setSelectedGenreIndex(genreIndex);
      setSelectedChannelIndex(channelIndex);
      setHoveredChannelIndex(channelIndex);
      channelPositionByGenreRef.current.set(targetGenre.id, channelIndex);
      return channelIndex;
    },
    [currentGenre, displayGenres, selectedChannelIndex, hoveredChannelIndex],
  );

  useEffect(() => {
    if (!currentGenre) return;
    const channelIndex = selectedChannelIndex ?? hoveredChannelIndex;
    if (channelIndex >= 0) {
      channelPositionByGenreRef.current.set(currentGenre.id, channelIndex);
    }
  }, [currentGenre, selectedChannelIndex, hoveredChannelIndex]);

  const dialMatch = useMemo(() => {
    if (!dialBuffer) return null;
    const number = Number.parseInt(dialBuffer, 10);
    const allChannels = genres.flatMap((genre) =>
      (genre.channels || []).map((channel) => ({ channel, genre })),
    );
    return (
      allChannels.find(({ channel }) => channel.dummyNumber === number) ||
      allChannels.find(({ channel }) => channel.redirectNumber === number) ||
      null
    );
  }, [dialBuffer, genres]);

  // Chunked / Paged list for viewport height (11 items per page)
  const activeChannelIdx = selectedChannelIndex ?? hoveredChannelIndex;
  const currentChunkIndex = Math.floor(activeChannelIdx / CHANNELS_PER_PAGE);
  const totalChunks = Math.max(1, Math.ceil(currentChannels.length / CHANNELS_PER_PAGE));

  const visibleChannels = useMemo(() => {
    const start = currentChunkIndex * CHANNELS_PER_PAGE;
    return currentChannels.slice(start, start + CHANNELS_PER_PAGE);
  }, [currentChannels, currentChunkIndex]);

  // Point 7: Main Backend Tuning Logic (only triggered on user action: OK, dial, click)
  const handleTune = useCallback(
    async (channel: Channel) => {
      recentChannelIdsRef.current = [
        channel.id,
        ...recentChannelIdsRef.current.filter((id) => id !== channel.id),
      ].slice(0, 2);
      setTuningStatus(`Tuning ${channel.name} (${channel.redirectNumber})...`);
      try {
        await tuneChannel(channel.redirectNumber, channel.name);
        setLastTuned(`${channel.name} [${channel.dummyNumber}]`);
        setTuningStatus(null);
      } catch (err) {
        setTuningStatus(`Tune error: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setTuningStatus(null), 3000);
      }
    },
    [],
  );

  const handleMediaLast = useCallback(() => {
    const previousChannelId = recentChannelIdsRef.current[1];
    if (previousChannelId == null) return;

    const previousChannel = genres
      .flatMap((genre) => genre.channels || [])
      .find((channel) => channel.id === previousChannelId);
    if (!previousChannel) return;

    const displayGenreIndex = displayGenres.findIndex(
      (genre) => genre.id === previousChannel.genreId,
    );
    const channelGenre = genres.find((genre) => genre.id === previousChannel.genreId);
    if (displayGenreIndex >= 0 && channelGenre) {
      const channelIndex = (channelGenre.channels || []).findIndex(
        (channel) => channel.id === previousChannel.id,
      );
      if (channelIndex >= 0) {
        setSelectedGenreIndex(displayGenreIndex);
        setSelectedChannelIndex(channelIndex);
        setHoveredChannelIndex(channelIndex);
        setFocusedColumn("channels");
        focusChannelRow(channelIndex);
      }
    }

    void handleTune(previousChannel);
  }, [genres, displayGenres, handleTune, focusChannelRow]);

  const handleFavoritesKey = useCallback(() => {
    if (allFavoriteChannels.length === 0) return;

    // Favorites is the first display genre whenever at least one channel is favorited.
    setSelectedGenreIndex(0);
    setSelectedChannelIndex(0);
    setHoveredChannelIndex(0);
    setFocusedColumn("channels");
    focusChannelRow(0);
  }, [allFavoriteChannels.length, focusChannelRow]);

  // Clear direct dialing buffer
  const clearDialer = useCallback(() => {
    if (dialTimerRef.current !== null) {
      window.clearTimeout(dialTimerRef.current);
      dialTimerRef.current = null;
    }
    if (dialIntervalRef.current !== null) {
      window.clearInterval(dialIntervalRef.current);
      dialIntervalRef.current = null;
    }
    dialBufferRef.current = "";
    setDialBuffer("");
    setDialProgress(100);
  }, []);

  // Point 5: Search order:
  // 1. Search dummy numbers.
  // 2. If not found in dummy, search redirect numbers (never looping back).
  const executeDialSearch = useCallback(
    (digits: string) => {
      if (!digits) return;
      const targetNum = parseInt(digits, 10);
      if (isNaN(targetNum)) {
        return;
      }

      // Collect all channels from all genres
      const allChannels = genres.flatMap((g) =>
        (g.channels || []).map((c) => ({ channel: c, genre: g })),
      );

      // Search 1: dummy number
      let match = allChannels.find((item) => item.channel.dummyNumber === targetNum);

      // Search 2: redirect number (only if not found in dummy)
      if (!match) {
        match = allChannels.find((item) => item.channel.redirectNumber === targetNum);
      }

      if (match) {
        // Switch to this channel's genre & channel
        const displayGenreIndex = displayGenres.findIndex((g) => g.id === match.genre.id);
        const channelGenre = genres.find((g) => g.id === match.genre.id);
        if (displayGenreIndex >= 0 && channelGenre) {
          setSelectedGenreIndex(displayGenreIndex);
          setFocusedColumn("channels");
          const cIdx = (channelGenre.channels || []).findIndex(
            (c) => c.id === match.channel.id,
          );
          if (cIdx >= 0) {
            setSelectedChannelIndex(cIdx);
            setHoveredChannelIndex(cIdx);
            focusChannelRow(cIdx);
          }
        }
        // Trigger main backend logic
        void handleTune(match.channel);
      }
    },
    [genres, displayGenres, handleTune, focusChannelRow],
  );

  // Direct number key buffering (Point 5)
  const handleDigitPress = useCallback(
    (digit: string) => {
      const next = (dialBufferRef.current + digit).slice(-3); // Maximum 3 digits
      dialBufferRef.current = next;
      setDialBuffer(next);

      // Reset timers
      if (dialTimerRef.current !== null) window.clearTimeout(dialTimerRef.current);
      if (dialIntervalRef.current !== null) window.clearInterval(dialIntervalRef.current);

      const startTime = Date.now();
      dialIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remainingPct = Math.max(0, 100 - (elapsed / DIAL_TIMEOUT_MS) * 100);
        setDialProgress(remainingPct);
      }, 50);

      // Leave the completed number visible briefly before tuning.
      if (next.length === 3) {
        dialTimerRef.current = window.setTimeout(() => {
          executeDialSearch(next);
          clearDialer();
        }, THREE_DIGIT_TUNE_DELAY_MS);
      } else {
        dialTimerRef.current = window.setTimeout(() => {
          executeDialSearch(next);
          clearDialer();
        }, DIAL_TIMEOUT_MS);
      }
    },
    [executeDialSearch, clearDialer],
  );

  // ----------------- REMOTE NAVIGATION (Points 1, 2) -----------------

  // Channel Down navigation
  const handleChannelDown = useCallback(() => {
    if (focusedColumn === "genre") {
      // Cyclic genre navigation
      if (displayGenres.length === 0) return;
      const next = (selectedGenreIndex + 1) % displayGenres.length;
      selectGenreRememberingChannelPosition(next);
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      setSelectedChannelIndex(0);
      setHoveredChannelIndex(0);
      focusChannelRow(0);
    } else {
      // Cyclic selection: wrap from bottom to top
      const next = (selectedChannelIndex + 1) % currentChannels.length;
      setSelectedChannelIndex(next);
      setHoveredChannelIndex(next);
      focusChannelRow(next);
    }
  }, [
    focusedColumn,
    displayGenres.length,
    selectedGenreIndex,
    currentChannels.length,
    selectedChannelIndex,
    focusChannelRow,
    selectGenreRememberingChannelPosition,
  ]);

  // Channel Up navigation
  const handleChannelUp = useCallback(() => {
    if (focusedColumn === "genre") {
      // Cyclic genre navigation: wrap from top to bottom
      if (displayGenres.length === 0) return;
      const prev = (selectedGenreIndex - 1 + displayGenres.length) % displayGenres.length;
      selectGenreRememberingChannelPosition(prev);
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      const last = currentChannels.length - 1;
      setSelectedChannelIndex(last);
      setHoveredChannelIndex(last);
      focusChannelRow(last);
    } else {
      // Cyclic selection: wrap from top (0) to bottom
      const prev = (selectedChannelIndex - 1 + currentChannels.length) % currentChannels.length;
      setSelectedChannelIndex(prev);
      setHoveredChannelIndex(prev);
      focusChannelRow(prev);
    }
  }, [
    focusedColumn,
    displayGenres.length,
    selectedGenreIndex,
    currentChannels.length,
    selectedChannelIndex,
    focusChannelRow,
    selectGenreRememberingChannelPosition,
  ]);

  // Physical CH+ / CH- keys advance the selection and tune the channel they land on.
  const handleRemoteChannelStep = useCallback(
    (direction: "up" | "down") => {
      if (currentChannels.length === 0) return;
      const currentIndex = selectedChannelIndex ?? hoveredChannelIndex;
      const targetIndex = direction === "down"
        ? (currentIndex + 1) % currentChannels.length
        : (currentIndex - 1 + currentChannels.length) % currentChannels.length;

      setFocusedColumn("channels");
      setSelectedChannelIndex(targetIndex);
      setHoveredChannelIndex(targetIndex);
      focusChannelRow(targetIndex);
      void handleTune(currentChannels[targetIndex]);
    },
    [currentChannels, selectedChannelIndex, hoveredChannelIndex, handleTune, focusChannelRow],
  );

  // Page Left (Previous Page)
  const handlePrevPage = useCallback(() => {
    if (totalChunks <= 1 || currentChannels.length === 0) return;
    const prevChunk = (currentChunkIndex - 1 + totalChunks) % totalChunks;
    const targetIdx = Math.min(prevChunk * CHANNELS_PER_PAGE, currentChannels.length - 1);

    setFocusedColumn("channels");
    setSelectedChannelIndex(targetIdx);
    setHoveredChannelIndex(targetIdx);
    focusChannelRow(targetIdx);
  }, [
    totalChunks,
    currentChannels.length,
    currentChunkIndex,
    focusChannelRow,
  ]);

  // Page Right (Next Page)
  const handleNextPage = useCallback(() => {
    if (totalChunks <= 1 || currentChannels.length === 0) return;
    const nextChunk = (currentChunkIndex + 1) % totalChunks;
    const targetIdx = Math.min(nextChunk * CHANNELS_PER_PAGE, currentChannels.length - 1);

    setFocusedColumn("channels");
    setSelectedChannelIndex(targetIdx);
    setHoveredChannelIndex(targetIdx);
    focusChannelRow(targetIdx);
  }, [
    totalChunks,
    currentChannels.length,
    currentChunkIndex,
    focusChannelRow,
  ]);

  // OK button: triggers currently selected channel
  const handleOkPress = useCallback(() => {
    // If user was actively dialing digits, immediately execute search
    if (dialBufferRef.current.length > 0) {
      executeDialSearch(dialBufferRef.current);
      clearDialer();
      return;
    }

    if (currentChannels.length === 0) return;

    const targetIdx = selectedChannelIndex ?? hoveredChannelIndex;
    if (targetIdx >= 0 && targetIdx < currentChannels.length) {
      setSelectedChannelIndex(targetIdx);
      setHoveredChannelIndex(targetIdx);
      setFocusedColumn("channels");
      focusChannelRow(targetIdx);
      void handleTune(currentChannels[targetIdx]);
    }
  }, [
    dialBuffer,
    clearDialer,
    executeDialSearch,
    currentChannels,
    selectedChannelIndex,
    hoveredChannelIndex,
    handleTune,
    focusChannelRow,
  ]);

  // handleToggleFavorite
  const handleToggleFavorite = useCallback(
    async (channelId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await toggleFavorite(channelId);
        await loadGenres();
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
      }
    },
    [loadGenres],
  );

  // Global Keydown Handler (Physical Remote & Keyboard)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput = target?.matches("input, textarea, select, [contenteditable='true']");
      const isDpadVertical = e.key === "ArrowUp" || e.key === "ArrowDown" ||
        e.keyCode === 19 || e.keyCode === 20 || e.keyCode === 38 || e.keyCode === 40;
      if (isTextInput && !isDpadVertical) {
        return;
      }

      const key = e.key;
      const keyCode = e.keyCode;
      const focusChannelAtIndex = (index: number) => {
        setSelectedChannelIndex(index);
        setHoveredChannelIndex(index);
        setFocusedColumn("channels");
        focusChannelRow(index);
      };

      // Android TV remotes report the previous-channel button as MediaLast / 229.
      if (key === "MediaLast" || keyCode === 229) {
        e.preventDefault();
        handleMediaLast();
        return;
      }

      // Android TV remotes report the Favorites key as MediaTrackPrevious / 177.
      if (key === "MediaTrackPrevious" || keyCode === 177) {
        e.preventDefault();
        handleFavoritesKey();
        return;
      }

      // CH+/- remote keys are distinct from ArrowUp/ArrowDown navigation.
      const isChDown = key === "ChannelDown" || key === "PageDown" || keyCode === 34;
      const isChUp = key === "ChannelUp" || key === "PageUp" || keyCode === 33;
      // OK / Enter detection: key "Enter", "Select", keyCode 13
      const isOk = key === "Enter" || key === "Select" || keyCode === 13 || keyCode === 23 || keyCode === 66;

      if (isChDown) {
        e.preventDefault();
        handleRemoteChannelStep("down");
        return;
      }

      if (isChUp) {
        e.preventDefault();
        handleRemoteChannelStep("up");
        return;
      }

      if (key === "ArrowDown" || keyCode === 20 || keyCode === 40) {
        e.preventDefault();
        moveRemoteFocus("down", currentChannels.length, focusChannelAtIndex);
        return;
      }

      if (key === "ArrowUp" || keyCode === 19 || keyCode === 38) {
        e.preventDefault();
        moveRemoteFocus("up", currentChannels.length, focusChannelAtIndex);
        return;
      }

      if (isOk) {
        e.preventDefault();
        const active = document.activeElement;
        if (active instanceof HTMLElement && getRemoteFocusableElements().includes(active)) {
          active.click();
          return;
        }
        handleOkPress();
        return;
      }

      if (key === "ArrowLeft" || keyCode === 21 || keyCode === 37) {
        e.preventDefault();
        moveRemoteFocus("left", currentChannels.length, focusChannelAtIndex);
        return;
      }

      if (key === "ArrowRight" || keyCode === 22 || keyCode === 39) {
        e.preventDefault();
        moveRemoteFocus("right", currentChannels.length, focusChannelAtIndex);
        return;
      }

      // Point 5: Direct Number Entry (0–9) - standard digit typing, no column toggle
      const isDigit =
        (key >= "0" && key <= "9") ||
        (keyCode >= 48 && keyCode <= 57) ||
        (keyCode >= 96 && keyCode <= 105);

      if (isDigit) {
        e.preventDefault();
        const digit =
          key >= "0" && key <= "9"
            ? key
            : String(keyCode >= 96 ? keyCode - 96 : keyCode - 48);
        handleDigitPress(digit);
        return;
      }

      // Edit shortcut: 'e' or 'E'
      if (key === "e" || key === "E") {
        e.preventDefault();
        setIsEditOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".genre-col")) setFocusedColumn("genre");
      else if (target?.closest(".chan-col")) setFocusedColumn("channels");
      else if (target?.closest(".picker-sidebar")) setFocusedColumn("sidebar");
    };
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [
    handleRemoteChannelStep,
    handleMediaLast,
    handleFavoritesKey,
    handleOkPress,
    handleDigitPress,
    currentChannels.length,
    focusChannelRow,
  ]);

  return (
    <div className="picker-container">
      {/* 3/4th Viewport Width (75%) */}
      <main className="picker-main">
        {/* Genre Column (Parent) */}
        <section className={`col genre-col ${focusedColumn === "genre" ? "focused" : ""}`}>
          <h2 className="col-header">
            <span>Genre</span>
          </h2>

          <div className="picker-list">
            {displayGenres.map((g, idx) => (
              <div
                key={g.id}
                className={`genre-item ${idx === selectedGenreIndex ? "selected" : ""} ${idx === hoveredGenreIndex ? "hovered" : ""}`}
                role="button"
                tabIndex={0}
                data-remote-genre-index={idx}
                onFocus={() => {
                  selectGenreRememberingChannelPosition(idx);
                  setFocusedColumn("genre");
                }}
                onMouseEnter={() => setHoveredGenreIndex(idx)}
                onMouseLeave={() => setHoveredGenreIndex(null)}
                onClick={(event) => {
                  event.currentTarget.focus();
                  const channelIndex = selectGenreRememberingChannelPosition(idx);
                  setFocusedColumn("channels");
                  focusChannelRow(channelIndex);
                }}
              >
                <span>{g.name}</span>
                <span className="count-badge">{g.channels?.length || 0}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Channels Column (Children) */}
        <section className={`col chan-col ${focusedColumn === "channels" ? "focused" : ""}`}>
          <div className="col-header">
            <div className="page-nav">
              <button
                type="button"
                className="page-nav-btn"
                tabIndex={-1}
                onClick={handlePrevPage}
                disabled={totalChunks <= 1}
                aria-label="Previous Page"
                title="Previous Page"
                data-remote-key="page-prev"
              >
                ◀
              </button>
              <span className="page-pill">
                Page {currentChunkIndex + 1} of {totalChunks}
              </span>
              <button
                type="button"
                className="page-nav-btn"
                tabIndex={-1}
                onClick={handleNextPage}
                disabled={totalChunks <= 1}
                aria-label="Next Page"
                title="Next Page"
                data-remote-key="page-next"
              >
                ▶
              </button>
            </div>
            <span className="col-title">{currentGenre?.name || "Channels"}</span>
            <span className="page-pill">{currentChannels.length} ch</span>
          </div>

          <div className="picker-list">
            {visibleChannels.length > 0 ? (
              visibleChannels.map((c, chunkIdx) => {
                const absoluteIdx = currentChunkIndex * CHANNELS_PER_PAGE + chunkIdx;
                const isSelected = selectedChannelIndex === absoluteIdx;
                const isHovered = selectedChannelIndex === null && hoveredChannelIndex === absoluteIdx;

                return (
                  <div className="channel-entry" key={c.id}>
                    <div
                      className={`channel-item ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
                      role="group"
                      tabIndex={0}
                      data-remote-channel-index={absoluteIdx}
                      data-remote-default-focus={isSelected ? "" : undefined}
                      aria-label={`${c.name}, channel ${c.dummyNumber}. Press OK to tune.`}
                      onFocus={() => {
                        setSelectedChannelIndex(absoluteIdx);
                        setHoveredChannelIndex(absoluteIdx);
                        setFocusedColumn("channels");
                      }}
                      onClick={(event) => {
                        event.currentTarget.focus();
                        setSelectedChannelIndex(absoluteIdx);
                        setHoveredChannelIndex(absoluteIdx);
                        setFocusedColumn("channels");
                        void handleTune(c);
                      }}
                    >
                      <span className="num-badge">{c.dummyNumber}</span>
                      <span className="chan-name">{c.name}</span>
                      <span className="redirect-hint">→ {c.redirectNumber}</span>
                    </div>
                    <button
                      className={`fav-btn ${c.isFavorite ? "fav-active" : ""}`}
                      data-channel-index={absoluteIdx}
                      onClick={(e) => handleToggleFavorite(c.id, e)}
                      type="button"
                      title={c.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      aria-label={c.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      {c.isFavorite ? "♥" : "♡"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="empty-notice">No channels found in this genre.</div>
            )}
          </div>
        </section>
      </main>

      {/* 1/4th Viewport Width (25%) */}
      <aside className="picker-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-title-row">
              <h1>StbLab Picker</h1>
              <button
                type="button"
                className={`keypad-toggle-btn ${isKeypadOpen ? "active" : ""}`}
                data-remote-key="keypad-toggle"
                onClick={() => setIsKeypadOpen((prev) => !prev)}
                aria-expanded={isKeypadOpen}
                title={isKeypadOpen ? "Hide Virtual Number Pad" : "Show Virtual Number Pad"}
              >
                <span>🔢</span>
                <span>{isKeypadOpen ? "Hide Pad" : "NumPad"}</span>
              </button>
            </div>
            <span className="link-status">
              <span className={`led ${stbState?.connected ? "online" : "offline"}`} />
              {stbState?.connected ? "Live" : "Offline"}
            </span>
          </div>

          {/* Virtual Remote Keypad (aware of picker state) */}
          <VirtualKeypad
            isOpen={isKeypadOpen}
            focusedColumn={focusedColumn}
            selectedChannelIndex={selectedChannelIndex}
            hoveredChannelIndex={hoveredChannelIndex}
            currentGenreName={currentGenre?.name || "Genre"}
            activeChannel={currentChannels[activeChannelIdx] ?? null}
            dialBuffer={dialBuffer}
            onDigitPress={handleDigitPress}
            onChannelDown={handleChannelDown}
            onChannelUp={handleChannelUp}
            onOkPress={handleOkPress}
            onFavoritesPress={handleFavoritesKey}
            onRecallPress={handleMediaLast}
          />

          {/* Telemetry Card */}
          <div className="telemetry-card">
            <dl className="telemetry-rows">
              <dt>Power</dt>
              <dd>{stbState?.isOn == null ? "—" : stbState.isOn ? "ON" : "STANDBY"}</dd>
              <dt>Volume</dt>
              <dd>
                {stbState?.volume
                  ? `${stbState.volume.level}/${stbState.volume.max}${stbState.volume.muted ? " (MUTE)" : ""}`
                  : "—"}
              </dd>
              <dt>App</dt>
              <dd title={stbState?.currentApp ?? undefined}>
                {stbState?.currentApp ? stbState.currentApp.split(".").pop() : "TV Home"}
              </dd>
              <dt>Tuned</dt>
              <dd style={{ color: "var(--focus)", fontWeight: 700 }}>
                {lastTuned || "—"}
              </dd>
            </dl>
          </div>

          {/* Direct Dialing HUD (Point 5) */}
          {dialBuffer && (
            <div className="dialer-badge">
              <div className="dialer-label">Direct Channel Dial</div>
              <div className="dialer-digits" aria-live="assertive" aria-atomic="true">
                {dialBuffer}
              </div>
              <div className="dialer-match" aria-live="polite">
                {dialMatch ? dialMatch.channel.name : "Channel not found"}
              </div>
              <div className="dialer-progress">
                <div
                  className="dialer-bar"
                  style={{ width: `${dialProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Tuning status message */}
          {tuningStatus && (
            <div
              style={{
                background: "#242217",
                border: "1px solid var(--focus)",
                color: "var(--focus)",
                padding: "8px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                fontFamily: "var(--mono)",
              }}
            >
              {tuningStatus}
            </div>
          )}

          {/* Navigation Hints */}
          <div className="hints-card">
            <div>
              <b>◀ / ▶</b>: Move between guide and channel actions
            </div>
            <div>
              <b>▲ / ▼</b>: Move through the focused list or keypad
            </div>
            <div>
              <b>CH ▼ / ▲</b>: Next / Prev channel
            </div>
            <div>
              <b>OK (Enter)</b>: Tune selected
            </div>
            <div>
              <b>0–9</b>: Dial number (within 3s)
            </div>
            <div>
              <b className="hint-icon-label">
                <svg
                  aria-hidden="true"
                  className="hint-bell-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>

              </b>: Previous channel (Advanced keycode 229)
            </div>
            <div>
              <b>🔵 Airtel Specials</b>: Open Favorites (Advanced keycode 177)
            </div>
            <div>
              <b>Live TV</b>: Key code 170
            </div>
            <div className="remote-setup-hint">
              Use TVQuickActions on the TV to map the Advanced Keycode keys. Assign Fully Kiosk
              Browser to the Options key for quick launch from the remote.
            </div>
          </div>
        </div>

        {/* Bottom-Right Corner Edit UI Button (Point 4) */}
        <div className="sidebar-bottom">
          <button
            type="button"
            className="edit-btn"
            data-remote-key="edit"
            onClick={() => setIsEditOpen(true)}
            aria-label="Edit Channels and Genres"
          >
            <span>⚙</span>
            <span>EDIT CHANNELS</span>
          </button>
        </div>
      </aside>

      {/* Edit Modal (Point 6) */}
      {isEditOpen && (
        <EditModal
          genres={genres}
          selectedGenreId={currentGenre?.id || null}
          onClose={() => setIsEditOpen(false)}
          onRefresh={loadGenres}
        />
      )}
    </div>
  );
}
