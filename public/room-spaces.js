// Renamed room records describe the same physical space.
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
  return canonical(first) === canonical(second);
}
