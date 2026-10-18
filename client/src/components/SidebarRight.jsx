import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import "../styles/Chat.css";

export default function SidebarRight({
  me,
  onClose,
  onGroupCreated,
  onlineIds,
  statusMap,
}) {
  const [profiles, setProfiles] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!me?.id) return;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar")
        .neq("id", me.id)
        .order("username");

      if (error) {
        console.error(error);
        return;
      }

      setProfiles(data || []);
    })();
  }, [me]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return profiles;

    return profiles.filter((p) =>
      p.username?.toLowerCase().includes(q)
    );
  }, [profiles, query]);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const getRealtimeStatus = (userId) => {
    if (!onlineIds?.has(userId)) return "offline";

    return statusMap?.[userId] || "online";
  };

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;

    setCreating(true);

    try {
      const { data: chat, error } = await supabase
        .from("chats")
        .insert({
          is_group: true,
          title: groupName.trim(),
          created_by: me.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("chat_members").insert([
        {
          chat_id: chat.id,
          user_id: me.id,
        },
        ...selected.map((id) => ({
          chat_id: chat.id,
          user_id: id,
        })),
      ]);

      onGroupCreated?.(chat.id);
      onClose?.();
    } catch (e) {
      console.error(e);
      alert("Failed to create group.");
    } finally {
      setCreating(false);
    }
  };

  console.log("ONLINE IDS", onlineIds);
console.log("STATUS MAP", statusMap);

  return (
    <aside className="sidebar-right">
      <div className="sr-header">
        <h3>Create Group</h3>

        <button
          className="sr-close"
          onClick={onClose}
        >
          ✖
        </button>
      </div>

      <div className="sr-body">
        <label>Group name</label>

        <input
          className="sr-input"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Weekend Crew"
        />

        <label>Search people</label>

        <input
          className="sr-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
        />

        <div className="sr-list">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`sr-row ${
                selected.includes(p.id)
                  ? "selected"
                  : ""
              }`}
            >
              <div className="sr-left">
                <img
                  src={p.avatar || "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg"}
                  alt=""
                />

                <div className="sr-uinfo">
                  <div className="sr-uname">
                    {p.username}
                  </div>

                  <div className="sr-status">
                    <span
                      className={`status-dot ${getRealtimeStatus(
                        p.id
                      )}`}
                    />

                    <span>
                      {getRealtimeStatus(p.id)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                className="sr-add"
                onClick={() => toggle(p.id)}
              >
                {selected.includes(p.id)
                  ? "Remove"
                  : "Add"}
              </button>
            </div>
          ))}

          {!filtered.length && (
            <div className="sr-empty">
              No users found
            </div>
          )}
        </div>
      </div>

      <div className="sr-footer">
        <button
          className="sr-create"
          disabled={
            !groupName.trim() ||
            !selected.length ||
            creating
          }
          onClick={createGroup}
        >
          {creating
            ? "Creating..."
            : "Create Group"}
        </button>
      </div>
    </aside>
  );
}