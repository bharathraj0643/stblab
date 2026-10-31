"use client";

import React from "react";
import type { Channel } from "@/lib/api";

interface VirtualKeypadProps {
  isOpen: boolean;
  onToggle: () => void;
  focusedColumn: "genre" | "channels";
  selectedChannelIndex: number | null;
  hoveredChannelIndex: number;
  currentGenreName: string;
  activeChannel: Channel | null;
  autoTuneRemaining: number | null;
  dialBuffer: string;
  onDigitPress: (digit: string) => void;
  onZeroPress: () => void;
  onChannelDown: () => void;
  onChannelUp: () => void;
  onOkPress: () => void;
}

export default function VirtualKeypad({
  isOpen,
  focusedColumn,
  selectedChannelIndex,
  currentGenreName,
  activeChannel,
  autoTuneRemaining,
  dialBuffer,
  onDigitPress,
  onZeroPress,
  onChannelDown,
  onChannelUp,
  onOkPress,
}: VirtualKeypadProps) {
  if (!isOpen) return null;

  const isChannelSelected = selectedChannelIndex !== null;

  return (
    <div className="virtual-keypad" role="region" aria-label="Virtual TV Remote Number Pad">
      {/* UI State Awareness Banner */}
      <div className="keypad-status-bar">
        <div className="keypad-status-left">
          <span className={`keypad-focus-indicator ${focusedColumn}`}>
            Focus: {focusedColumn.toUpperCase()}
          </span>
          <span className="keypad-state-mode">
            {focusedColumn === "channels" ? (
              isChannelSelected ? (
                <span className="state-badge selected" title="Channel is in Selected State">
                  ● Selected
                </span>
              ) : (
                <span className="state-badge hovered" title="Channel is in Hovered State">
                  ○ Hover
                </span>
              )
            ) : (
              <span className="state-badge genre">Genre</span>
            )}
          </span>
        </div>

        <div className="keypad-status-right">
          {autoTuneRemaining !== null && autoTuneRemaining > 0 ? (
            <span className="keypad-autotune-pill" title="Auto-tune countdown active">
              ⏱ {autoTuneRemaining}s
            </span>
          ) : dialBuffer ? (
            <span className="keypad-dial-pill" title="Direct Dialing">
              #{dialBuffer}
            </span>
          ) : (
            <span className="keypad-target-name" title={activeChannel ? activeChannel.name : currentGenreName}>
              {focusedColumn === "channels"
                ? activeChannel
                  ? `#${activeChannel.dummyNumber} ${activeChannel.name}`
                  : "No Channel"
                : currentGenreName}
            </span>
          )}
        </div>
      </div>

      {/* Grid of Number Pad & Remote Controls */}
      <div className="keypad-grid">
        {/* Row 1: 1, 2, 3 */}
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("1")}
          aria-label="Digit 1"
        >
          <span>1</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("2")}
          aria-label="Digit 2"
        >
          <span>2</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("3")}
          aria-label="Digit 3"
        >
          <span>3</span>
        </button>

        {/* Row 2: 4, 5, 6 */}
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("4")}
          aria-label="Digit 4"
        >
          <span>4</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("5")}
          aria-label="Digit 5"
        >
          <span>5</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("6")}
          aria-label="Digit 6"
        >
          <span>6</span>
        </button>

        {/* Row 3: 7, 8, 9 */}
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("7")}
          aria-label="Digit 7"
        >
          <span>7</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("8")}
          aria-label="Digit 8"
        >
          <span>8</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          onClick={() => onDigitPress("9")}
          aria-label="Digit 9"
        >
          <span>9</span>
        </button>

        {/* Row 4: CH ▲, 0 (or toggle focus), CH ▼ */}
        <button
          type="button"
          className="keypad-btn nav-ch"
          onClick={onChannelUp}
          aria-label={`Channel Up (${focusedColumn})`}
          title={`Cycle ${focusedColumn === "genre" ? "Genre" : "Channel"} Up`}
        >
          <span>CH ▲</span>
          <span className="keypad-btn-sub">Prev</span>
        </button>

        <button
          type="button"
          className="keypad-btn nav-zero"
          onClick={onZeroPress}
          aria-label={dialBuffer ? "Digit 0" : "Key 0 (Switch Genre / Channels Focus)"}
          title={dialBuffer ? "Append 0 to dial" : "Press 0 to toggle Genre / Channels focus"}
        >
          <span>0</span>
          <span className="keypad-btn-sub">
            {dialBuffer ? "Digit" : "⇄ Focus"}
          </span>
        </button>

        <button
          type="button"
          className="keypad-btn nav-ch"
          onClick={onChannelDown}
          aria-label={`Channel Down (${focusedColumn})`}
          title={`Cycle ${focusedColumn === "genre" ? "Genre" : "Channel"} Down`}
        >
          <span>CH ▼</span>
          <span className="keypad-btn-sub">
            {focusedColumn === "channels" && !isChannelSelected ? "Select" : "Next"}
          </span>
        </button>

        {/* Row 5: OK Button */}
        <button
          type="button"
          className="keypad-btn nav-ok"
          onClick={onOkPress}
          aria-label="OK (Tune selected channel)"
          title="Trigger TV key and tune channel on STB"
        >
          <span>OK</span>
          <span className="keypad-btn-sub">
            {dialBuffer
              ? `Tune #${dialBuffer}`
              : activeChannel
              ? `Tune #${activeChannel.dummyNumber}`
              : "Tune"}
          </span>
        </button>
      </div>
    </div>
  );
}

