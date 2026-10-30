"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getState,
  launchApp,
  sendKey,
  sendText,
  type KeyDirection,
  type StbState,
} from "@/lib/api";

const POLL_MS = 2000;
const HOLD_MS = 180;

type AppEntry =
  | { label: string; kind: "link"; uri: string }
  | { label: string; kind: "key"; key: string };

const COMMON_APPS: AppEntry[] = [
  { label: "YouTube", kind: "link", uri: "https://www.youtube.com/tv" },
  { label: "Netflix", kind: "link", uri: "https://www.netflix.com/browse" },
  { label: "Prime Video", kind: "link", uri: "https://app.primevideo.com/" },
  { label: "Hotstar", kind: "link", uri: "https://www.hotstar.com" },
  { label: "Xstream", kind: "key", key: "TV" },
  { label: "Spotify", kind: "link", uri: "market://search?q=spotify" },
];

/** Mirrors what a physical remote gives you for free. */
const KEY_BINDINGS: Record<string, string> = {
  ArrowUp: "DPAD_UP",
  ArrowDown: "DPAD_DOWN",
  ArrowLeft: "DPAD_LEFT",
  ArrowRight: "DPAD_RIGHT",
  Enter: "DPAD_CENTER",
  Backspace: "BACK",
  Escape: "BACK",
  " ": "MEDIA_PLAY_PAUSE",
  m: "VOLUME_MUTE",
  p: "POWER",
  "+": "VOLUME_UP",
  "=": "VOLUME_UP",
  "-": "VOLUME_DOWN",
  "_": "VOLUME_DOWN",
};

type KeyProps = {
  flash: string | null;
  disabled: boolean;
  onPress: (key: string) => void;
  onStartHold: (key: string) => void;
  onStopHold: () => void;
};

type RemoteKeyProps = KeyProps & {
  label: string;
  keyName: string;
  /** Hold-to-repeat, for rockers like volume and channel. */
  repeat?: boolean;
  className?: string;
  title?: string;
};

function RemoteKey({
  label,
  keyName,
  flash,
  disabled,
  onPress,
  onStartHold,
  onStopHold,
  repeat = false,
  className,
  title,
}: RemoteKeyProps) {
  const interaction: React.ComponentProps<"button"> = repeat
    ? {
        onPointerDown: (event) => {
          // Suppress the default so a long press does not start a text selection or drag.
          event.preventDefault();
          onStartHold(keyName);
        },
        onPointerUp: onStopHold,
        onPointerLeave: onStopHold,
        onPointerCancel: onStopHold,
      }
    : { onClick: () => onPress(keyName) };

  return (
    <button
      type="button"
      className={`key${className ? ` ${className}` : ""}`}
      title={title ?? keyName}
      disabled={disabled}
      data-flash={flash === keyName ? "true" : undefined}
      {...interaction}
    >
      {label}
    </button>
  );
}

export default function RemotePage() {
  const [state, setState] = useState<StbState | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [app, setApp] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const holdTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  const press = useCallback((key: string, direction: KeyDirection = "SHORT") => {
    setFlash(key);

    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
    }

    flashTimer.current = window.setTimeout(() => setFlash(null), 140);

    void sendKey(key, direction)
      .then(() => setActionError(null))
      .catch((cause: unknown) =>
        setActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  const stopHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const startHold = useCallback(
    (key: string) => {
      press(key);
      stopHold();

      // The protocol sends discrete presses, so a "held" rocker is repeated presses.
      holdTimer.current = window.setInterval(() => press(key), HOLD_MS);
    },
    [press, stopHold],
  );

  // Poll the device. Only GET /state is polled — the write endpoints are driven by the user.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await getState();

        if (!cancelled) {
          setState(next);
          setLinkError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setLinkError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => stopHold, [stopHold]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }

      const key = KEY_BINDINGS[event.key];

      if (key) {
        event.preventDefault();
        press(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const run = useCallback((action: () => Promise<unknown>, done?: () => void) => {
    void action()
      .then(() => {
        setActionError(null);
        done?.();
      })
      .catch((cause: unknown) =>
        setActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  const connected = state?.connected ?? false;

  const keyProps: KeyProps = {
    flash,
    disabled: !connected,
    onPress: press,
    onStartHold: startHold,
    onStopHold: stopHold,
  };

  const powerLabel = state?.isOn == null ? "—" : state.isOn ? "on" : "standby";

  const volumeLabel = state?.volume
    ? `${state.volume.level}/${state.volume.max}${state.volume.muted ? " muted" : ""}`
    : "—";

  const modelLabel = state?.device
    ? `${state.device.manufacturer} ${state.device.model}`
    : "—";

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">StbLab</span>
        <span className="bar-sub">Android TV Remote v2</span>
        <span className="bar-link">
          <span className="led" data-state={connected ? "on" : "off"} />
          {connected ? "linked" : "offline"}
        </span>
      </header>

      <aside className="rail">
        <section className="block">
          <h2 className="block-title">Telemetry</h2>
          <dl className="rows">
            <dt>Power</dt>
            <dd>{powerLabel}</dd>
            <dt>Volume</dt>
            <dd>{volumeLabel}</dd>
            <dt>App</dt>
            <dd title={state?.currentApp ?? undefined}>{state?.currentApp ?? "—"}</dd>
            <dt>Device</dt>
            <dd title={modelLabel === "—" ? undefined : modelLabel}>{modelLabel}</dd>
          </dl>
        </section>

        {state?.features.length ? (
          <section className="block">
            <h2 className="block-title">Negotiated features</h2>
            <ul className="tags">
              {state.features.map((feature) => (
                <li key={feature}>{feature.toLowerCase()}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="block">
          <h2 className="block-title">Text input</h2>
          <form
            className="field-row"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => sendText(text), () => setText(""));
            }}
          >
            <input
              type="text"
              placeholder="focused field"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className="key key-inline" disabled={text === "" || !connected}>
              Send
            </button>
          </form>
          <p className="hint">Types into whatever has focus on the device.</p>
        </section>

        {actionError ?? linkError ? (
          <div className="banner banner-error">
            <span>{actionError ?? linkError}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setActionError(null);
                setLinkError(null);
              }}
            >
              ✕
            </button>
          </div>
        ) : null}

        {!connected && !linkError ? (
          <div className="banner banner-warn">
            <span>
              No live session. The box may be off, asleep, or already held by another remote — the
              API redials every few seconds.
            </span>
          </div>
        ) : null}
      </aside>

      <main className="deck">
        <section className="block span-7">
          <h2 className="block-title">Navigate</h2>
          <div className="nav-body">
            <div className="dpad">
              <span />
              <RemoteKey label="▲" keyName="DPAD_UP" {...keyProps} />
              <span />
              <RemoteKey label="◀" keyName="DPAD_LEFT" {...keyProps} />
              <RemoteKey label="OK" keyName="DPAD_CENTER" className="key-primary" {...keyProps} />
              <RemoteKey label="▶" keyName="DPAD_RIGHT" {...keyProps} />
              <span />
              <RemoteKey label="▼" keyName="DPAD_DOWN" {...keyProps} />
              <span />
            </div>
            <div className="grid cols-2">
              <RemoteKey label="Back" keyName="BACK" {...keyProps} />
              <RemoteKey label="Home" keyName="HOME" {...keyProps} />
              <RemoteKey label="Search" keyName="SEARCH" {...keyProps} />
              <RemoteKey label="Settings" keyName="SETTINGS" {...keyProps} />
            </div>
          </div>
        </section>

        <div className="stack span-5">
          <section className="block">
            <h2 className="block-title">Volume &amp; channel</h2>
            <div className="grid cols-4">
              <RemoteKey label="Vol +" keyName="VOLUME_UP" repeat {...keyProps} />
              <RemoteKey label="Vol −" keyName="VOLUME_DOWN" repeat {...keyProps} />
              <RemoteKey label="Ch +" keyName="CHANNEL_UP" repeat {...keyProps} />
              <RemoteKey label="Ch −" keyName="CHANNEL_DOWN" repeat {...keyProps} />
            </div>
          </section>

          <section className="block">
            <h2 className="block-title">System</h2>
            <div className="grid cols-4">
              <RemoteKey label="Power" keyName="POWER" {...keyProps} />
              <RemoteKey label="Mute" keyName="VOLUME_MUTE" {...keyProps} />
              <RemoteKey label="Live TV" keyName="TV" {...keyProps} />
              <RemoteKey label="Input" keyName="TV_INPUT" {...keyProps} />
            </div>
          </section>
        </div>

        <section className="block span-7">
          <h2 className="block-title">Transport</h2>
          <div className="grid cols-4">
            <RemoteKey label="Prev" keyName="MEDIA_PREVIOUS" {...keyProps} />
            <RemoteKey label="Rewind" keyName="MEDIA_REWIND" repeat {...keyProps} />
            <RemoteKey label="Forward" keyName="MEDIA_FAST_FORWARD" repeat {...keyProps} />
            <RemoteKey label="Next" keyName="MEDIA_NEXT" {...keyProps} />
            <RemoteKey label="Play/Pause" keyName="MEDIA_PLAY_PAUSE" {...keyProps} />
            <RemoteKey label="Stop" keyName="MEDIA_STOP" {...keyProps} />
            <RemoteKey label="Info" keyName="INFO" {...keyProps} />
            <RemoteKey label="Delete" keyName="DEL" {...keyProps} />
          </div>
        </section>

        <section className="block span-5">
          <h2 className="block-title">Launch</h2>
          <div className="grid cols-3">
            {COMMON_APPS.map((entry) => (
              <button
                key={entry.label}
                type="button"
                className="key"
                disabled={!connected}
                title={entry.kind === "key" ? `Key: ${entry.key}` : entry.uri}
                onClick={() =>
                  run(() =>
                    entry.kind === "key" ? sendKey(entry.key) : launchApp(entry.uri),
                  )
                }
              >
                {entry.label}
              </button>
            ))}
          </div>
          <form
            className="field-row stacked"
            onSubmit={(event) => {
              event.preventDefault();
              const target = app.trim();
              if (!target) return;
              if (
                target.toLowerCase() === "com.airtel.tv" ||
                target.toLowerCase() === "xstream" ||
                target.toLowerCase() === "tv" ||
                target.toLowerCase() === "live"
              ) {
                run(() => sendKey("TV"), () => setApp(""));
              } else {
                run(() => launchApp(target), () => setApp(""));
              }
            }}
          >
            <input
              type="text"
              placeholder="deep link, package or app name"
              value={app}
              onChange={(event) => setApp(event.target.value)}
            />
            <button type="submit" className="key key-inline" disabled={app.trim() === "" || !connected}>
              Open
            </button>
          </form>
        </section>

        <section className="block span-12">
          <h2 className="block-title">Shortcuts</h2>
          <p className="hint">
            <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> navigate · <kbd>Enter</kbd> OK ·{" "}
            <kbd>Backspace</kbd> back · <kbd>Space</kbd> play/pause · <kbd>M</kbd> mute ·{" "}
            <kbd>P</kbd> power · <kbd>+</kbd> <kbd>−</kbd> volume · launching is fire-and-forget:
            the device never acknowledges it, so watch the App row above.
          </p>
        </section>
      </main>
    </div>
  );
}
