import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/CalendarView.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarView({ me }) {
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    start: "",
    end: "",
  });

  // Load events
  useEffect(() => {
    if (!me?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", me.id)
        .order("start_time", { ascending: true });

      if (error) console.error("Load events failed:", error.message);
      setEvents(data || []);
    })();
  }, [me]);

  const monthLabel = useMemo(() => {
    return cursor.toLocaleString("default", { month: "long", year: "numeric" });
  }, [cursor]);

  // Build 42 cells (6 weeks) always, so layout never gets weird
  const monthCells = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);

    const firstGrid = new Date(first);
    firstGrid.setDate(first.getDate() - first.getDay()); // back to Sunday

    const cells = [];
    const d = new Date(firstGrid);
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    return { first, last, cells };
  }, [cursor]);

  const eventsByDayKey = useMemo(() => {
    // key: YYYY-MM-DD
    const map = new Map();
    for (const e of events) {
      const start = new Date(e.start_time);
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(start.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }, [events]);

  const createEvent = async () => {
    if (!me?.id) return;
    if (!newEvent.title || !newEvent.start || !newEvent.end) return;

    const { error } = await supabase.from("calendar_events").insert({
      user_id: me.id,
      title: newEvent.title,
      description: newEvent.description || "",
      start_time: newEvent.start,
      end_time: newEvent.end,
    });

    if (error) {
      console.error("Create event failed:", error.message);
      return;
    }

    setShowModal(false);
    setNewEvent({ title: "", description: "", start: "", end: "" });

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", me.id)
      .order("start_time", { ascending: true });

    setEvents(data || []);
  };

  const today = useMemo(() => new Date(), []);

  return (
    <div className="rvCal">
      <div className="rvCalHeader">
  <div className="rvCalToolbar">
    <button
      type="button"
      className="rvBtnPrimary"
      onClick={() => setShowModal(true)}
    >
      + New event
    </button>

    <button
      type="button"
      className="rvBtn"
      onClick={() => setCursor(new Date())}
    >
      Today
    </button>

    <div className="rvCalArrows">
      <button
        type="button"
        className="rvBtn rvArrow"
        aria-label="Previous month"
        onClick={() => setCursor(addMonths(cursor, -1))}
      >
        ‹
      </button>

      <button
        type="button"
        className="rvBtn rvArrow"
        aria-label="Next month"
        onClick={() => setCursor(addMonths(cursor, 1))}
      >
        ›
      </button>
    </div>

    <div className="rvMonth">{monthLabel}</div>
  </div>

  <span className="rvCalViewLabel">Month</span>
</div>

      <div className="rvCalGridWrap">
        <div className="rvWeekdays">
          {WEEKDAYS.map((d) => (
            <div key={d} className="rvWeekday">
              {d}
            </div>
          ))}
        </div>

        <div className="rvMonthGrid">
          {monthCells.cells.map((d) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isTodayFlag = isSameDay(d, today);

            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
              2,
              "0"
            )}-${String(d.getDate()).padStart(2, "0")}`;

            const dayEvents = eventsByDayKey.get(key) || [];

            return (
              <div
                key={d.toISOString()}
                className={[
                  "rvDay",
                  inMonth ? "inMonth" : "outMonth",
                  isTodayFlag ? "today" : "",
                ].join(" ")}
              >
                <div className="rvDayTop">
                  <div className="rvDayNum">{d.getDate()}</div>
                </div>

                <div className="rvEvents">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="rvEvent" title={ev.title}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="rvMore">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="rvModal" onClick={() => setShowModal(false)}>
          <div className="rvModalCard" onClick={(e) => e.stopPropagation()}>
            <h3>New Event</h3>

            <input
              type="text"
              placeholder="Title"
              value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            />

            <textarea
              placeholder="Description"
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            />

            <label>Start</label>
            <input
              type="datetime-local"
              value={newEvent.start}
              onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
            />

            <label>End</label>
            <input
              type="datetime-local"
              value={newEvent.end}
              onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
            />

            <div className="rvModalActions">
              <button className="rvBtnPrimary" onClick={createEvent}>
                Save
              </button>
              <button className="rvBtn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
