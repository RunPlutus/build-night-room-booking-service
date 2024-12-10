import { useEffect, useState } from 'react';

export interface Room { id: string; name: string; floor: number; capacity: number }
export interface Busy { bookingId: string; title: string; start: string; end: string }

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then((b) => setRooms(b.rooms)).catch(() => setRooms([]));
  }, []);
  return rooms;
}

export function useAvailability(roomId: string, date: string, pollMs = 30_000) {
  const [busy, setBusy] = useState<Busy[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/rooms/${roomId}/availability?date=${date}`)
        .then((r) => r.json())
        .then((b) => live && setBusy(b.busy))
        .catch(() => live && setBusy(null));
    load();
    const t = setInterval(load, pollMs);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [roomId, date, pollMs]);
  return busy;
}
