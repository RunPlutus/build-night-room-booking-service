// Shared-room calendars can contain independent bookings in separate parts.
// Time overlap is a clash only when the booked physical spaces also overlap.
export function sameOccupiedSpace(first, second, rooms) {
  if (!first || !second) return true;
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const canonical = (id) => {
    const seen = new Set();
    while (byId.get(id)?.replacedBy && !seen.has(id)) {
      seen.add(id);
      id = byId.get(id).replacedBy;
    }
    return id;
  };
  const parents = new Map();
  for (const room of rooms) if (room.parentId) parents.set(canonical(room.id), canonical(room.parentId));
  const ancestors = (id) => {
    const result = new Set();
    let current = canonical(id);
    while (current && !result.has(current)) {
      result.add(current);
      current = parents.get(current);
    }
    return result;
  };
  return ancestors(first).has(canonical(second)) || ancestors(second).has(canonical(first));
}
