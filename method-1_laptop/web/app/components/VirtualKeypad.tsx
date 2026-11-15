"use client";

import React from "react";
import type { Channel } from "@/lib/api";

interface VirtualKeypadProps {
  isOpen: boolean;
  focusedColumn: "genre" | "channels" | "sidebar";
  selectedChannelIndex: number | null;
  hoveredChannelIndex: number;
  currentGenreName: string;
  activeChannel: Channel | null;
  dialBuffer: string;
  onDigitPress: (digit: string) => void;
  onChannelDown: () => void;
  onChannelUp: () => void;
  onOkPress: () => void;
  onFavoritesPress: () => void;
  onRecallPress: () => void;
}

export default function VirtualKeypad({
  isOpen,
  focusedColumn,
  selectedChannelIndex,
  currentGenreName,
  activeChannel,
  dialBuffer,
  onDigitPress,
  onChannelDown,
  onChannelUp,
  onOkPress,
  onFavoritesPress,
  onRecallPress,
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
          {dialBuffer ? (
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
          data-pad-row="0"
          data-pad-col="0"
          onClick={() => onDigitPress("1")}
          aria-label="Digit 1"
        >
          <span>1</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="0"
          data-pad-col="1"
          onClick={() => onDigitPress("2")}
          aria-label="Digit 2"
        >
          <span>2</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="0"
          data-pad-col="2"
          onClick={() => onDigitPress("3")}
          aria-label="Digit 3"
        >
          <span>3</span>
        </button>

        {/* Row 2: 4, 5, 6 */}
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="1"
          data-pad-col="0"
          onClick={() => onDigitPress("4")}
          aria-label="Digit 4"
        >
          <span>4</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="1"
          data-pad-col="1"
          onClick={() => onDigitPress("5")}
          aria-label="Digit 5"
        >
          <span>5</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="1"
          data-pad-col="2"
          onClick={() => onDigitPress("6")}
          aria-label="Digit 6"
        >
          <span>6</span>
        </button>

        {/* Row 3: 7, 8, 9 */}
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="2"
          data-pad-col="0"
          onClick={() => onDigitPress("7")}
          aria-label="Digit 7"
        >
          <span>7</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="2"
          data-pad-col="1"
          onClick={() => onDigitPress("8")}
          aria-label="Digit 8"
        >
          <span>8</span>
        </button>
        <button
          type="button"
          className="keypad-btn"
          data-pad-row="2"
          data-pad-col="2"
          onClick={() => onDigitPress("9")}
          aria-label="Digit 9"
        >
          <span>9</span>
        </button>

        {/* Row 4: CH ▲, 0, CH ▼ */}
        <button
          type="button"
          className="keypad-btn nav-ch"
          data-pad-row="3"
          data-pad-col="0"
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
          data-pad-row="3"
          data-pad-col="1"
          onClick={() => onDigitPress("0")}
          aria-label="Digit 0"
          title="Digit 0"
        >
          <span>0</span>
        </button>

        <button
          type="button"
          className="keypad-btn nav-ch"
          data-pad-row="3"
          data-pad-col="2"
          onClick={onChannelDown}
          aria-label={`Channel Down (${focusedColumn})`}
          title={`Cycle ${focusedColumn === "genre" ? "Genre" : "Channel"} Down`}
        >
          <span>CH ▼</span>
          <span className="keypad-btn-sub">
            {focusedColumn === "channels" && !isChannelSelected ? "Select" : "Next"}
          </span>
        </button>

        <div className="keypad-actions-row">
          <button
            type="button"
            className="keypad-btn nav-action"
            data-pad-row="4"
            data-pad-col="0"
            onClick={onFavoritesPress}
            aria-label="Open Favorites"
            title="Open Favorites"
          >
            <span>★ Favorites</span>
          </button>
          <button
            type="button"
            className="keypad-btn nav-action"
            data-pad-row="4"
            data-pad-col="1"
            onClick={onRecallPress}
            aria-label="Recall previous channel"
            title="Recall previous channel"
          >
            <span>↶ Recall</span>
          </button>
        </div>

        {/* Row 5: OK Button */}
        <button
          type="button"
          className="keypad-btn nav-ok"
          data-pad-row="5"
          data-pad-col="1"
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
