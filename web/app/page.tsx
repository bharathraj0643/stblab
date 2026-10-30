"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Genre,
  type Channel,
  type StbState,
  getGenres,
  getState,
  tuneChannel,
} from "@/lib/api";
import EditModal from "./components/EditModal";

const CHANNELS_PER_PAGE = 7;
const CHORD_THRESHOLD_MS = 250;
const DIAL_TIMEOUT_MS = 3000;
const STATE_POLL_MS = 3000;

export default function ChannelPickerPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [stbState, setStbState] = useState<StbState | null>(null);

  // Column focus: "genre" (parent) or "channels" (children)
  const [focusedColumn, setFocusedColumn] = useState<"genre" | "channels">("channels");

  // Selection states
  // Point 1: On load, always first genre is selected, first channel is hovered.
  // selectedChannelIndex is null until the user presses ChannelDown.
  const [selectedGenreIndex, setSelectedGenreIndex] = useState<number>(0);
  const [hoveredChannelIndex, setHoveredChannelIndex] = useState<number>(0);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(null);

  // Direct number dialing state (Point 5)
  const [dialBuffer, setDialBuffer] = useState<string>("");
  const [dialProgress, setDialProgress] = useState<number>(100);
  const dialTimerRef = useRef<number | null>(null);
  const dialIntervalRef = useRef<number | null>(null);

  // Tuning status
  const [tuningStatus, setTuningStatus] = useState<string | null>(null);
  const [lastTuned, setLastTuned] = useState<string | null>(null);

  // Edit UI modal state (Point 6)
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);

  // Chording detection refs (Point 3)
  const lastChUpRef = useRef<number>(0);
  const lastChDownRef = useRef<number>(0);
  const isChordHandledRef = useRef<boolean>(false);

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

  // Safe active genre
  const currentGenre = useMemo(() => {
    if (genres.length === 0) return null;
    const idx = Math.max(0, Math.min(selectedGenreIndex, genres.length - 1));
    return genres[idx];
  }, [genres, selectedGenreIndex]);

  const currentChannels = useMemo(() => {
    return currentGenre?.channels || [];
  }, [currentGenre]);

  // Point 2: Chunked / Paged list for viewport height
  // The active channel index is either selected or hovered
  const activeChannelIdx = selectedChannelIndex ?? hoveredChannelIndex;
  const currentChunkIndex = Math.floor(activeChannelIdx / CHANNELS_PER_PAGE);
  const totalChunks = Math.max(1, Math.ceil(currentChannels.length / CHANNELS_PER_PAGE));

  const visibleChannels = useMemo(() => {
    const start = currentChunkIndex * CHANNELS_PER_PAGE;
    return currentChannels.slice(start, start + CHANNELS_PER_PAGE);
  }, [currentChannels, currentChunkIndex]);

  // Point 7: Main Backend Tuning Logic
  const handleTune = useCallback(
    async (channel: Channel) => {
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
        clearDialer();
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
      } else {
        setTuningStatus(`Channel ${targetNum} not found`);
        setTimeout(() => setTuningStatus(null), 2500);
      }

      clearDialer();
    },
    [genres, handleTune, clearDialer],
  );

  // Direct number key buffering (Point 5)
  const handleDigitPress = useCallback(
    (digit: string) => {
      const next = (dialBuffer + digit).slice(-3); // Maximum 3 digits
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

      // Trigger after 3 seconds or immediately if 3 digits are reached
      if (next.length === 3) {
        executeDialSearch(next);
      } else {
        dialTimerRef.current = window.setTimeout(() => {
          executeDialSearch(next);
        }, DIAL_TIMEOUT_MS);
      }
    },
    [dialBuffer, executeDialSearch],
  );

  // ----------------- REMOTE NAVIGATION (Points 1, 2, 3) -----------------

  // Channel Down navigation
  const handleChannelDown = useCallback(() => {
    if (focusedColumn === "genre") {
      // Cyclic genre navigation
      if (genres.length === 0) return;
      const next = (selectedGenreIndex + 1) % genres.length;
      setSelectedGenreIndex(next);
      setHoveredChannelIndex(0);
      setSelectedChannelIndex(null);
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      // Point 1: First press of ChannelDown selects first channel (does not trigger play)
      setSelectedChannelIndex(0);
      setHoveredChannelIndex(0);
    } else {
      // Point 2: Cyclic selection: wrap from bottom to top
      const next = (selectedChannelIndex + 1) % currentChannels.length;
      setSelectedChannelIndex(next);
      setHoveredChannelIndex(next);
    }
  }, [focusedColumn, genres.length, selectedGenreIndex, currentChannels.length, selectedChannelIndex]);

  // Channel Up navigation
  const handleChannelUp = useCallback(() => {
    if (focusedColumn === "genre") {
      // Cyclic genre navigation: wrap from top to bottom
      if (genres.length === 0) return;
      const prev = (selectedGenreIndex - 1 + genres.length) % genres.length;
      setSelectedGenreIndex(prev);
      setHoveredChannelIndex(0);
      setSelectedChannelIndex(null);
      return;
    }

    // Channels column navigation
    if (currentChannels.length === 0) return;

    if (selectedChannelIndex === null) {
      // If hovering, select last channel cyclically
      const last = currentChannels.length - 1;
      setSelectedChannelIndex(last);
      setHoveredChannelIndex(last);
    } else {
      // Point 2: Cyclic selection: wrap from top (0) to bottom
      const prev = (selectedChannelIndex - 1 + currentChannels.length) % currentChannels.length;
      setSelectedChannelIndex(prev);
      setHoveredChannelIndex(prev);
    }
  }, [focusedColumn, genres.length, selectedGenreIndex, currentChannels.length, selectedChannelIndex]);

  // OK button: triggers currently selected channel
  const handleOkPress = useCallback(() => {
    // If user was actively dialing digits, immediately execute search
    if (dialBuffer.length > 0) {
      executeDialSearch(dialBuffer);
      return;
    }

    // Point 1: Triggers current selected channel regardless of mouse pointer!
    if (currentChannels.length === 0) return;

    const targetIdx = selectedChannelIndex ?? hoveredChannelIndex;
    if (targetIdx >= 0 && targetIdx < currentChannels.length) {
      // Ensure it is marked selected
      setSelectedChannelIndex(targetIdx);
      void handleTune(currentChannels[targetIdx]);
    }
  }, [dialBuffer, executeDialSearch, currentChannels, selectedChannelIndex, hoveredChannelIndex, handleTune]);

  // Global Keydown Handler (Physical Remote & Keyboard)
  useEffect(() => {
    // Point 6: Suspend all remote keys while Edit UI is open
    if (isEditOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input field
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }

      const now = Date.now();
      const key = e.key;
      const keyCode = e.keyCode;

      // ChannelDown detection: key "ChannelDown", code "PageDown", keyCode 34, ArrowDown
      const isChDown = key === "ChannelDown" || key === "PageDown" || keyCode === 34 || key === "ArrowDown";
      // ChannelUp detection: key "ChannelUp", code "PageUp", keyCode 33, ArrowUp
      const isChUp = key === "ChannelUp" || key === "PageUp" || keyCode === 33 || key === "ArrowUp";
      // OK / Enter detection: key "Enter", "Select", keyCode 13
      const isOk = key === "Enter" || key === "Select" || keyCode === 13;

      // Point 3: Chording / Simultaneous Press Detection
      if (isChDown) {
        e.preventDefault();
        lastChDownRef.current = now;

        if (now - lastChUpRef.current <= CHORD_THRESHOLD_MS && !isChordHandledRef.current) {
          // Both ChannelUp and ChannelDown pressed simultaneously!
          isChordHandledRef.current = true;
          setFocusedColumn((prev) => (prev === "channels" ? "genre" : "channels"));
          return;
        }

        isChordHandledRef.current = false;
        handleChannelDown();
        return;
      }

      if (isChUp) {
        e.preventDefault();
        lastChUpRef.current = now;

        if (now - lastChDownRef.current <= CHORD_THRESHOLD_MS && !isChordHandledRef.current) {
          // Both ChannelUp and ChannelDown pressed simultaneously!
          isChordHandledRef.current = true;
          setFocusedColumn((prev) => (prev === "channels" ? "genre" : "channels"));
          return;
        }

        isChordHandledRef.current = false;
        handleChannelUp();
        return;
      }

      if (isOk) {
        e.preventDefault();
        handleOkPress();
        return;
      }

      // Left / Right keys as auxiliary navigation
      if (key === "ArrowLeft") {
        e.preventDefault();
        setFocusedColumn("genre");
        return;
      }
      if (key === "ArrowRight") {
        e.preventDefault();
        setFocusedColumn("channels");
        return;
      }

      // Point 5: Direct Number Entry (0–9)
      if (key >= "0" && key <= "9") {
        e.preventDefault();
        handleDigitPress(key);
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
  }, [isEditOpen, handleChannelDown, handleChannelUp, handleOkPress, handleDigitPress]);

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
            {genres.map((g, idx) => (
              <div
                key={g.id}
                className={`genre-item ${idx === selectedGenreIndex ? "selected" : ""}`}
                onClick={() => {
                  setSelectedGenreIndex(idx);
                  setHoveredChannelIndex(0);
                  setSelectedChannelIndex(null);
                  setFocusedColumn("channels");
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
            <span className="page-pill">
              Page {currentChunkIndex + 1} of {totalChunks}
            </span>
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
            <h1>StbLab Picker</h1>
            <span className="link-status">
              <span className={`led ${stbState?.connected ? "online" : "offline"}`} />
              {stbState?.connected ? "Live" : "Offline"}
            </span>
          </div>

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
              <div className="dialer-digits">
                {dialBuffer.padEnd(3, "_").split("").join(" ")}
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
              <b>CH ▼ / ▲</b>: Next / Prev channel
            </div>
            <div>
              <b>CH ▲+▼ simultaneously</b>: Switch Genre / Channels
            </div>
            <div>
              <b>OK (Enter)</b>: Tune selected
            </div>
            <div>
              <b>0–9</b>: Dial number (within 3s)
            </div>
          </div>
        </div>

        {/* Bottom-Right Corner Edit UI Button (Point 4) */}
        <div className="sidebar-bottom">
          <button
            type="button"
            className="edit-btn"
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
