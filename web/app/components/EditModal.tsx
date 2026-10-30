"use client";

import { useState } from "react";
import {
  type Genre,
  type Channel,
  createGenre,
  updateGenre,
  deleteGenre,
  createChannel,
  updateChannel,
  deleteChannel,
  reorderChannels,
} from "@/lib/api";

type EditModalProps = {
  genres: Genre[];
  selectedGenreId: number | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

export default function EditModal({
  genres,
  selectedGenreId,
  onClose,
  onRefresh,
}: EditModalProps) {
  const [activeGenreId, setActiveGenreId] = useState<number | null>(
    selectedGenreId ?? (genres.length > 0 ? genres[0].id : null),
  );

  // Genre form states
  const [isAddingGenre, setIsAddingGenre] = useState(false);
  const [editingGenre, setEditingGenre] = useState<Genre | null>(null);
  const [genreName, setGenreName] = useState("");
  const [genreOrder, setGenreOrder] = useState("0");

  // Channel form states
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [channelName, setChannelName] = useState("");
  const [channelDummy, setChannelDummy] = useState("");
  const [channelRedirect, setChannelRedirect] = useState("");
  const [channelOrder, setChannelOrder] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeGenre = genres.find((g) => g.id === activeGenreId) ?? null;

  // ----------------- GENRE ACTIONS -----------------

  const handleStartAddGenre = () => {
    setIsAddingGenre(true);
    setEditingGenre(null);
    setGenreName("");
    setGenreOrder(String(genres.length + 1));
  };

  const handleStartEditGenre = (g: Genre) => {
    setEditingGenre(g);
    setIsAddingGenre(false);
    setGenreName(g.name);
    setGenreOrder(String(g.sortOrder));
  };

  const handleSaveGenre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genreName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const order = parseInt(genreOrder, 10) || 0;
      if (editingGenre) {
        await updateGenre(editingGenre.id, genreName.trim(), order);
      } else {
        const created = await createGenre(genreName.trim(), order);
        setActiveGenreId(created.id);
      }
      await onRefresh();
      setIsAddingGenre(false);
      setEditingGenre(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGenre = async (id: number) => {
    if (!confirm("Are you sure you want to delete this genre and all its channels?")) return;

    setLoading(true);
    try {
      await deleteGenre(id);
      await onRefresh();
      if (activeGenreId === id) {
        const remaining = genres.filter((g) => g.id !== id);
        setActiveGenreId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // ----------------- CHANNEL ACTIONS -----------------

  const handleStartAddChannel = () => {
    if (!activeGenre) return;
    setIsAddingChannel(true);
    setEditingChannel(null);
    setChannelName("");
    setChannelDummy("");
    setChannelRedirect("");
    setChannelOrder(String((activeGenre.channels?.length || 0) + 1));
  };

  const handleStartEditChannel = (c: Channel) => {
    setEditingChannel(c);
    setIsAddingChannel(false);
    setChannelName(c.name);
    setChannelDummy(String(c.dummyNumber));
    setChannelRedirect(String(c.redirectNumber));
    setChannelOrder(String(c.sortOrder));
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGenreId || !channelName.trim()) return;

    const dummy = parseInt(channelDummy.replace(/[^0-9]/g, ""), 10);
    const redirect = parseInt(channelRedirect.replace(/[^0-9]/g, ""), 10);
    if (isNaN(dummy) || isNaN(redirect)) {
      setError("Dummy and Redirect channel numbers must be numbers.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const order = parseInt(channelOrder, 10) || 0;
      if (editingChannel) {
        await updateChannel(editingChannel.id, {
          genreId: activeGenreId,
          name: channelName.trim(),
          dummyNumber: dummy,
          redirectNumber: redirect,
          sortOrder: order,
        });
      } else {
        await createChannel({
          genreId: activeGenreId,
          name: channelName.trim(),
          dummyNumber: dummy,
          redirectNumber: redirect,
          sortOrder: order,
        });
      }
      await onRefresh();
      setIsAddingChannel(false);
      setEditingChannel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: number) => {
    if (!confirm("Are you sure you want to delete this channel?")) return;

    setLoading(true);
    try {
      await deleteChannel(id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Channel reordering: move up or down in the array
  const handleMoveChannel = async (index: number, direction: "up" | "down") => {
    if (!activeGenre || !activeGenre.channels) return;
    const channels = [...activeGenre.channels];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= channels.length) return;

    const [moved] = channels.splice(index, 1);
    channels.splice(targetIndex, 0, moved);

    setLoading(true);
    try {
      await reorderChannels(
        activeGenre.id,
        channels.map((c) => c.id),
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Channels &amp; Genres</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div style={{ background: "#4a1212", color: "#ffb4b4", padding: "8px 20px" }}>{error}</div>}

        <div className="modal-body">
          {/* Left Pane: Genres */}
          <div className="modal-pane left">
            <div className="pane-title-row">
              <span className="pane-title">Genres</span>
              <button
                className="btn-small"
                onClick={handleStartAddGenre}
                disabled={loading}
              >
                + Add Genre
              </button>
            </div>

            {(isAddingGenre || editingGenre) && (
              <form className="form-card" onSubmit={handleSaveGenre}>
                <div className="form-row">
                  <label>Genre Name</label>
                  <input
                    type="text"
                    required
                    value={genreName}
                    onChange={(e) => setGenreName(e.target.value)}
                    placeholder="e.g. Sports"
                    autoFocus
                  />
                </div>
                <div className="form-row">
                  <label>Order (1 = Top priority)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={genreOrder}
                    onChange={(e) => setGenreOrder(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setIsAddingGenre(false);
                      setEditingGenre(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {editingGenre ? "Update" : "Save"}
                  </button>
                </div>
              </form>
            )}

            <div className="edit-list">
              {genres.map((g) => (
                <div
                  key={g.id}
                  className={`edit-item ${g.id === activeGenreId ? "active" : ""}`}
                  onClick={() => setActiveGenreId(g.id)}
                >
                  <span>
                    <b>{g.sortOrder > 0 ? `#${g.sortOrder} ` : ""}</b>
                    {g.name} ({g.channels?.length || 0})
                  </span>
                  <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-action-btn"
                      title="Edit genre"
                      onClick={() => handleStartEditGenre(g)}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-action-btn del"
                      title="Delete genre"
                      onClick={() => handleDeleteGenre(g.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Pane: Channels in Selected Genre */}
          <div className="modal-pane">
            <div className="pane-title-row">
              <span className="pane-title">
                {activeGenre ? `Channels in ${activeGenre.name}` : "Select a genre"}
              </span>
              {activeGenre && (
                <button
                  className="btn-small"
                  onClick={handleStartAddChannel}
                  disabled={loading}
                >
                  + Add Channel
                </button>
              )}
            </div>

            {(isAddingChannel || editingChannel) && (
              <form className="form-card" onSubmit={handleSaveChannel}>
                <div className="form-row">
                  <label>Channel Name</label>
                  <input
                    type="text"
                    required
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="e.g. Sun TV HD"
                    autoFocus
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="form-row">
                    <label>Dummy Display # (Shown in UI)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="e.g. 2"
                      value={channelDummy}
                      onChange={(e) => setChannelDummy(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                  <div className="form-row">
                    <label>Redirect STB # (Dialed on box)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="e.g. 102"
                      value={channelRedirect}
                      onChange={(e) => setChannelRedirect(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label>Sort Order Index (1 = Top priority)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={channelOrder}
                    onChange={(e) => setChannelOrder(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setIsAddingChannel(false);
                      setEditingChannel(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {editingChannel ? "Update Channel" : "Save Channel"}
                  </button>
                </div>
              </form>
            )}

            <div className="edit-list">
              {activeGenre?.channels && activeGenre.channels.length > 0 ? (
                activeGenre.channels.map((c, i) => (
                  <div key={c.id} className="edit-item">
                    <div>
                      <span style={{ color: "var(--focus)", fontWeight: 700, marginRight: "8px" }}>
                        [{c.dummyNumber}]
                      </span>
                      <span>{c.name}</span>
                      <span style={{ fontSize: "12px", color: "var(--dim)", marginLeft: "8px" }}>
                        (redirects to: {c.redirectNumber})
                      </span>
                    </div>

                    <div className="item-actions">
                      <button
                        className="icon-action-btn"
                        title="Move Up"
                        disabled={i === 0 || loading}
                        onClick={() => handleMoveChannel(i, "up")}
                      >
                        ▲
                      </button>
                      <button
                        className="icon-action-btn"
                        title="Move Down"
                        disabled={i === activeGenre.channels.length - 1 || loading}
                        onClick={() => handleMoveChannel(i, "down")}
                      >
                        ▼
                      </button>
                      <button
                        className="icon-action-btn"
                        title="Edit channel"
                        onClick={() => handleStartEditChannel(c)}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-action-btn del"
                        title="Delete channel"
                        onClick={() => handleDeleteChannel(c.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--dim)", padding: "20px 0", textAlign: "center" }}>
                  No channels in this genre yet. Click &quot;+ Add Channel&quot; above.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

