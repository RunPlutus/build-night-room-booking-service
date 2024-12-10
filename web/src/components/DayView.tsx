import { useState } from 'react';
import { useRooms, useAvailability, Room } from '../hooks/useRooms';

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);
const toMin = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

function RoomRow({ room, date }: { room: Room; date: string }) {
  const busy = useAvailability(room.id, date);
  return (
    <div className="row">
      <div className="row__name">
        {room.name}
        <small>{room.capacity} seats · floor {room.floor}</small>
      </div>
      <div className="row__track">
        {busy?.map((b) => {
          const left = ((toMin(b.start) - 480) / 660) * 100;
          const width = ((toMin(b.end) - toMin(b.start)) / 660) * 100;
          return (
            <span key={b.bookingId + b.start} className="row__busy" style={{ left: `${left}%`, width: `${width}%` }} title={`${b.title} ${b.start.slice(11)}–${b.end.slice(11)}`}>
              {b.title}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function DayView() {
  const rooms = useRooms();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <main className="day">
      <header>
        <h1>Rooms</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day" />
      </header>
      <div className="hours">{HOURS.map((h) => <span key={h}>{h}:00</span>)}</div>
      {rooms.map((r) => <RoomRow key={r.id} room={r} date={date} />)}
    </main>
  );
}
