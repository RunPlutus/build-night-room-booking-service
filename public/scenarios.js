// Scripted replays of the Facilities complaints. Each runs against a fresh
// seeded database and reports what the service did vs. what it should do.
// Shared by the browser UI and the facilitator's command-line check.

export function makeApi(base = '', fetchImpl = (...a) => fetch(...a)) {
  const call = async (replica, method, p, data) => {
    const res = await fetchImpl(`${base}/${replica}${p}`, {
      method,
      headers: data ? { 'content-type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  };
  return {
    reset: () => fetchImpl(`${base}/__demo/reset`, { method: 'POST' }),
    info: async () => (await fetchImpl(`${base}/__demo/info`)).json(),
    contracts: async () => {
      const response = await fetchImpl(`${base}/__demo/contracts`);
      if (!response.ok) throw new Error(`Shared engine check failed: HTTP ${response.status}`);
      return (await response.json()).checks;
    },
    rooms: (rep = 'a', includeRetired = false) => call(rep, 'GET', `/api/rooms${includeRetired ? '?includeRetired=true' : ''}`),
    busy: (rep, roomId, date) => call(rep, 'GET', `/api/rooms/${roomId}/availability?date=${date}`),
    book: (rep, b) => call(rep, 'POST', '/api/bookings', b),
    cancel: (rep, id) => call(rep, 'DELETE', `/api/bookings/${id}`),
    list: (rep, roomId, from, to) => call(rep, 'GET', `/api/bookings?roomId=${roomId}&from=${from}&to=${to}`),
  };
}

const booking = (roomId, date, s, e, title = 'Demo meeting', extra = {}) => ({
  roomId,
  title,
  organizer: 'demo@example.com',
  start: `${date}T${s}`,
  end: `${date}T${e}`,
  ...extra,
});

function describe(r) {
  if (r.status === 201) return 'Booked';
  if (r.status === 204) return 'Done';
  if (r.status === 409) {
    const c = r.body?.error?.details?.[0];
    return c ? `Rejected: clashes with "${c.title}"` : 'Rejected: conflict';
  }
  return `Error ${r.status}${r.body?.error?.message ? `: ${r.body.error.message}` : ''}`;
}

const expectStatus = (label, want, r) => ({
  label,
  expected: want === 201 ? 'Booked' : want === 409 ? 'Rejected (conflict)' : String(want),
  actual: describe(r),
  ok: r.status === want,
});

const titlesOf = (r) => (r.body?.busy ?? []).map((b) => b.title);

export const SCENARIOS = [
  {
    id: 'back-to-back',
    title: 'Back-to-back meetings',
    room: 'Fuji',
    complaint: 'Wed 7 Oct: someone couldn’t book Fuji 15:00–16:00. The 1:1 before it ended at 15:00.',
    date: '2026-11-03',
    rooms: ['rm-fuji'],
    async run(api) {
      const d = this.date;
      return [
        expectStatus('Book Fuji 14:00–15:00', 201, await api.book('a', booking('rm-fuji', d, '14:00', '15:00', '1:1 Sam / Alex'))),
        expectStatus('Book Fuji 15:00–16:00 (starts as the 1:1 ends)', 201, await api.book('a', booking('rm-fuji', d, '15:00', '16:00', 'Design sync'))),
        ...(await api.contracts()).filter((check) => check.group === 'boundary'),
      ];
    },
  },
  {
    id: 'race',
    title: 'Two clicks, two servers',
    room: 'Rainier',
    complaint: 'Thu 8 Oct: a customer call and an interview loop were both confirmed for Rainier 13:00–14:00.',
    date: '2026-11-05',
    rooms: ['rm-rainier'],
    async run(api) {
      const d = this.date;
      const names = ['Customer call', 'Interview loop', 'Team sync', 'Hiring debrief'];
      const results = await Promise.all(
        ['a', 'b', 'a', 'b'].map((rep, i) => api.book(rep, booking('rm-rainier', d, '13:00', '14:00', names[i]))),
      );
      const won = results.filter((r) => r.status === 201).length;
      const list = await api.list('a', 'rm-rainier', d, d);
      const stored = (list.body?.occurrences ?? []).filter((o) => o.status === 'confirmed' && o.start === `${d}T13:00`).length;
      return [
        {
          label: '4 people book Rainier 13:00–14:00 at the same moment, via servers A and B',
          expected: '1 booked, 3 rejected',
          actual: `${won} booked, ${results.length - won} rejected`,
          ok: won === 1,
        },
        { label: 'Bookings stored for that slot', expected: '1', actual: String(stored), ok: stored === 1 },
      ];
    },
  },
  {
    id: 'standup',
    title: 'The standup that vanished',
    room: 'Fuji',
    complaint: 'Tue 6 Oct: the platform standup (every Tuesday since July) collided with an offsite planning session.',
    date: '2026-10-20',
    rooms: ['rm-fuji'],
    async run(api) {
      const d = this.date;
      const cal = await api.busy('a', 'rm-fuji', d);
      return [
        {
          label: 'Calendar shows “Platform standup” on Tue 20 Oct',
          expected: 'Shown',
          actual: titlesOf(cal).includes('Platform standup') ? 'Shown' : 'Missing',
          ok: titlesOf(cal).includes('Platform standup'),
        },
        expectStatus('Book Fuji 09:30–10:00 on Tue 20 Oct', 409, await api.book('a', booking('rm-fuji', d, '09:30', '10:00', 'Offsite planning'))),
        ...(await api.contracts()).filter((check) => check.group === 'series'),
      ];
    },
  },
  {
  id: 'cancelled',
  title: 'The meeting that will not leave',
  room: 'Kilimanjaro',
  complaint: 'A cancelled meeting remains on the room calendar and lobby kiosk. New meetings also appear on only one screen.',
  date: '2026-11-10',
  rooms: ['rm-kilimanjaro'],
  async run(api) {
    const room = this.rooms[0], d = this.date;
    const checks = [];
    const day = async (rep, label, want) => {
      const r = await api.busy(rep, room, d);
      const got = titlesOf(r).slice().sort();
      checks.push({ label, expected: want.length ? want.slice().sort().join(', ') : 'Free', actual: r.status === 200 ? (got.join(', ') || 'Free') : `HTTP ${r.status}`, ok: r.status === 200 && JSON.stringify(got) === JSON.stringify(want.slice().sort()) });
    };
    await day('b', 'Lobby kiosk opens an empty calendar on server B', []);
    const meeting = await api.book('a', booking(room, d, '13:00', '17:00', 'Quarterly planning'));
    checks.push(expectStatus('Organizer books through server A', 201, meeting));
    await day('a', 'Room calendar on server A shows the meeting', ['Quarterly planning']);
    await day('b', 'Previously open lobby kiosk on server B sees the new meeting', ['Quarterly planning']);
    checks.push(expectStatus('Organizer cancels through server A', 204, await api.cancel('a', meeting.body?.id ?? 'missing')));
    await day('a', 'Room calendar is free after cancellation', []);
    await day('b', 'Lobby kiosk is free after cancellation', []);
    const again = await api.book('b', booking(room, d, '13:00', '17:00', 'Team workshop'));
    checks.push(expectStatus('Another organizer reuses the released slot on server B', 201, again));
    await day('a', 'Server A now shows only the replacement meeting', ['Team workshop']);
    await day('b', 'Server B now shows only the replacement meeting', ['Team workshop']);
    return checks;
  },
},
  {
    id: 'renamed',
    title: 'The Monday all-hands',
    room: 'Everest',
    complaint: 'Mon 5 Oct: Sales showed up to Everest for their sync and the Monday all-hands was already there. Both confirmed.',
    date: '2026-11-02',
    rooms: ['rm-everest', 'rm-4b'],
    async run(api) {
      const d = this.date;
      const cal = await api.busy('a', 'rm-everest', d);
      return [
        {
          label: 'Everest calendar shows “Monday all-hands” on Mon 2 Nov',
          expected: 'Shown',
          actual: titlesOf(cal).includes('Monday all-hands') ? 'Shown' : 'Missing',
          ok: titlesOf(cal).includes('Monday all-hands'),
        },
        expectStatus('Book Everest 10:00–11:00 on Mon 2 Nov', 409, await api.book('a', booking('rm-everest', d, '10:00', '11:00', 'Sales sync'))),
      ];
    },
  },
];
