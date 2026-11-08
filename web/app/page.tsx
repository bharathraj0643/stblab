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

export default function ChannelPickerPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [stbState, setStbState] = useState<StbState | null>(null);

  // Column focus: "genre" (parent), "channels" (children), or "sidebar"
  const [focusedColumn, setFocusedColumn] = useState<"genre" | "channels" | "sidebar">("channels");
  const [sidebarFocusIdx, setSidebarFocusIdx] = useState<number>(0);

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

  // Edit UI modal state (Point 6)
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);

  // Virtual Remote Keypad toggle state (collapsed by default)
  const [isKeypadOpen, setIsKeypadOpen] = useState<boolean>(false);

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

    const genreIndex = genres.findIndex((genre) => genre.id === previousChannel.genreId);
    if (genreIndex >= 0) {
      const channelIndex = (genres[genreIndex].channels || []).findIndex(
        (channel) => channel.id === previousChannel.id,
      );
      if (channelIndex >= 0) {
        setSelectedGenreIndex(genreIndex);
        setSelectedChannelIndex(channelIndex);
        setHoveredChannelIndex(channelIndex);
        setFocusedColumn("channels");
      }
    }

    void handleTune(previousChannel);
  }, [genres, handleTune]);

  const handleFavoritesKey = useCallback(() => {
    if (allFavoriteChannels.length === 0) return;

    // Favorites is the first display genre whenever at least one channel is favorited.
    setSelectedGenreIndex(0);
    setSelectedChannelIndex(0);
    setHoveredChannelIndex(0);
    setFocusedColumn("channels");
  }, [allFavoriteChannels.length]);

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
        const gIdx = genres.findIndex((g) => g.id === match.genre.id);
        if (gIdx >= 0) {
          setSelectedGenreIndex(gIdx);
          const cIdx = (genres[gIdx].channels || []).findIndex(
            (c) => c.id === match.channel.id,
          );
          if (cIdx >= 0) {
            setSelectedChannelIndex(cIdx);
            setHoveredChannelIndex(cIdx);
          }
        }
        // Trigger main backend logic
        void handleTune(match.channel);
      }
    },
    [genres, handleTune],
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
      setSelectedGenreIndex(next);
      setHoveredChannelIndex(0);
      setSelectedChannelIndex(0); // selection selects top channel column (not trigger)
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      setSelectedChannelIndex(0);
      setHoveredChannelIndex(0);
    } else {
      // Cyclic selection: wrap from bottom to top
      const next = (selectedChannelIndex + 1) % currentChannels.length;
      setSelectedChannelIndex(next);
      setHoveredChannelIndex(next);
    }
  }, [
    focusedColumn,
    displayGenres.length,
    selectedGenreIndex,
    currentChannels.length,
    selectedChannelIndex,
  ]);

  // Channel Up navigation
  const handleChannelUp = useCallback(() => {
    if (focusedColumn === "genre") {
      // Cyclic genre navigation: wrap from top to bottom
      if (displayGenres.length === 0) return;
      const prev = (selectedGenreIndex - 1 + displayGenres.length) % displayGenres.length;
      setSelectedGenreIndex(prev);
      setHoveredChannelIndex(0);
      setSelectedChannelIndex(0); // selection selects top channel column (not trigger)
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      const last = currentChannels.length - 1;
      setSelectedChannelIndex(last);
      setHoveredChannelIndex(last);
    } else {
      // Cyclic selection: wrap from top (0) to bottom
      const prev = (selectedChannelIndex - 1 + currentChannels.length) % currentChannels.length;
      setSelectedChannelIndex(prev);
      setHoveredChannelIndex(prev);
    }
  }, [
    focusedColumn,
    displayGenres.length,
    selectedGenreIndex,
    currentChannels.length,
    selectedChannelIndex,
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
      void handleTune(currentChannels[targetIndex]);
    },
    [currentChannels, selectedChannelIndex, hoveredChannelIndex, handleTune],
  );

  // Page Left (Previous Page)
  const handlePrevPage = useCallback(() => {
    if (totalChunks <= 1 || currentChannels.length === 0) return;
    const prevChunk = (currentChunkIndex - 1 + totalChunks) % totalChunks;
    const targetIdx = Math.min(prevChunk * CHANNELS_PER_PAGE, currentChannels.length - 1);

    setFocusedColumn("channels");
    setSelectedChannelIndex(targetIdx);
    setHoveredChannelIndex(targetIdx);
  }, [
    totalChunks,
    currentChannels.length,
    currentChunkIndex,
  ]);

  // Page Right (Next Page)
  const handleNextPage = useCallback(() => {
    if (totalChunks <= 1 || currentChannels.length === 0) return;
    const nextChunk = (currentChunkIndex + 1) % totalChunks;
    const targetIdx = Math.min(nextChunk * CHANNELS_PER_PAGE, currentChannels.length - 1);

    setFocusedColumn("channels");
    setSelectedChannelIndex(targetIdx);
    setHoveredChannelIndex(targetIdx);
  }, [
    totalChunks,
    currentChannels.length,
    currentChunkIndex,
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
    // Suspend remote keys while Edit UI is open
    if (isEditOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input field
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }

      const key = e.key;
      const keyCode = e.keyCode;

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
      const isOk = key === "Enter" || key === "Select" || keyCode === 13;

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

      if (key === "ArrowDown") {
        e.preventDefault();
        if (focusedColumn === "sidebar") {
          setSidebarFocusIdx((prev) => (prev + 1) % 2);
        } else {
          handleChannelDown();
        }
        return;
      }

      if (key === "ArrowUp") {
        e.preventDefault();
        if (focusedColumn === "sidebar") {
          setSidebarFocusIdx((prev) => (prev - 1 + 2) % 2);
        } else {
          handleChannelUp();
        }
        return;
      }

      if (isOk) {
        e.preventDefault();
        if (focusedColumn === "sidebar") {
          if (sidebarFocusIdx === 0) {
            setIsKeypadOpen((prev) => !prev);
          } else if (sidebarFocusIdx === 1) {
            setIsEditOpen(true);
          }
          return;
        }
        handleOkPress();
        return;
      }

      // Left key: switch direction
      if (key === "ArrowLeft") {
        e.preventDefault();
        if (focusedColumn === "sidebar") {
          setFocusedColumn("channels");
        } else {
          setFocusedColumn("genre");
        }
        return;
      }

      // Right key: switch direction to next column
      if (key === "ArrowRight") {
        e.preventDefault();
        if (focusedColumn === "genre") {
          setFocusedColumn("channels");
          const topIdx = currentChunkIndex * CHANNELS_PER_PAGE;
          setSelectedChannelIndex(topIdx);
          setHoveredChannelIndex(topIdx);
        } else if (focusedColumn === "channels") {
          setFocusedColumn("sidebar");
          setSidebarFocusIdx(0);
        }
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isEditOpen,
    focusedColumn,
    sidebarFocusIdx,
    currentChunkIndex,
    handleChannelDown,
    handleChannelUp,
    handleRemoteChannelStep,
    handleMediaLast,
    handleFavoritesKey,
    handleOkPress,
    handleDigitPress,
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
                onMouseEnter={() => setHoveredGenreIndex(idx)}
                onMouseLeave={() => setHoveredGenreIndex(null)}
                onClick={() => {
                  setSelectedGenreIndex(idx);
                  setFocusedColumn("channels");
                  setSelectedChannelIndex(0);
                  setHoveredChannelIndex(0);
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
                onClick={handlePrevPage}
                disabled={totalChunks <= 1}
                aria-label="Previous Page"
                title="Previous Page"
              >
                ◀
              </button>
              <span className="page-pill">
                Page {currentChunkIndex + 1} of {totalChunks}
              </span>
              <button
                type="button"
                className="page-nav-btn"
                onClick={handleNextPage}
                disabled={totalChunks <= 1}
                aria-label="Next Page"
                title="Next Page"
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
                  <div
                    key={c.id}
                    className={`channel-item ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
                    onClick={() => {
                      setSelectedChannelIndex(absoluteIdx);
                      setFocusedColumn("channels");
                      void handleTune(c);
                    }}
                  >
                    <span className="num-badge">{c.dummyNumber}</span>
                    <span className="chan-name">{c.name}</span>
                    <span className="redirect-hint">→ {c.redirectNumber}</span>
                    <button
                      className={`fav-btn ${c.isFavorite ? "fav-active" : ""}`}
                      onClick={(e) => handleToggleFavorite(c.id, e)}
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
                className={`keypad-toggle-btn ${isKeypadOpen ? "active" : ""} ${focusedColumn === "sidebar" && sidebarFocusIdx === 0 ? "sidebar-focused" : ""}`}
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
            onToggle={() => setIsKeypadOpen((prev) => !prev)}
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
              <b>◀ / ▶</b>: Switch Genre / Channels
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
            className={`edit-btn ${focusedColumn === "sidebar" && sidebarFocusIdx === 1 ? "sidebar-focused" : ""}`}
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
