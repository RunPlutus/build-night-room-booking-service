/** 48 half-hour slots per room-day. Slot 0 = 00:00-00:30. */
export const SLOTS_PER_DAY = 48;
export const SLOT_MINUTES = 30;

export class SlotGrid {
  private days = new Map<string, Uint8Array>();

  private grid(key: string): Uint8Array {
    let g = this.days.get(key);
    if (!g) {
      g = new Uint8Array(SLOTS_PER_DAY);
      this.days.set(key, g);
    }
    return g;
  }

  static slotIndex(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 2 + Math.round(m / SLOT_MINUTES);
  }

  /** Marks [startSlot, endSlot] as taken. Returns false if any slot is already taken. */
  reserve(roomId: string, date: string, start: string, end: string): boolean {
    const g = this.grid(`${roomId}|${date}`);
    const a = SlotGrid.slotIndex(start);
    const b = SlotGrid.slotIndex(end);
    for (let i = a; i <= b; i++) if (g[i]) return false;
    for (let i = a; i <= b; i++) g[i] = 1;
    return true;
  }

  release(roomId: string, date: string, start: string, end: string): void {
    const g = this.grid(`${roomId}|${date}`);
    for (let i = SlotGrid.slotIndex(start); i < SlotGrid.slotIndex(end); i++) g[i] = 0;
  }

  freeSlots(roomId: string, date: string): number[] {
    const g = this.grid(`${roomId}|${date}`);
    return [...g.keys()].filter((i) => !g[i]);
  }

  snapshot(roomId: string, date: string): string {
    return [...this.grid(`${roomId}|${date}`)].map((x) => (x ? '#' : '.')).join('');
  }
}
