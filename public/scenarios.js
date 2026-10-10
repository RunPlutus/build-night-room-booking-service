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
    rooms: (rep = 'a') => call(rep, 'GET', '/api/rooms'),
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
      ];
    },
  },
  {
    id: 'cancelled',
    title: 'Cancelled but still busy',
    room: 'Kilimanjaro',
    complaint: 'Fri 9 Oct: quarterly planning was cancelled the night before, but Kilimanjaro still showed busy all afternoon.',
    date: '2026-11-10',
    rooms: ['rm-kilimanjaro'],
    async run(api) {
      const d = this.date;
      const created = await api.book('a', booking('rm-kilimanjaro', d, '13:00', '17:00', 'Quarterly planning'));
      const before = await api.busy('a', 'rm-kilimanjaro', d);
      const cancelled = await api.cancel('a', created.body?.id ?? 'missing');
      const after = await api.busy('a', 'rm-kilimanjaro', d);
      return [
        expectStatus('Book Kilimanjaro 13:00–17:00', 201, created),
        { label: 'Someone opens the calendar', expected: 'Shows the meeting', actual: titlesOf(before).includes('Quarterly planning') ? 'Shows the meeting' : 'Not shown', ok: titlesOf(before).includes('Quarterly planning') },
        { label: 'Organizer cancels', expected: 'Done', actual: describe(cancelled), ok: cancelled.status === 204 },
        { label: 'Calendar after the cancel', expected: 'Free', actual: titlesOf(after).length ? `Busy (${titlesOf(after).join(', ')})` : 'Free', ok: titlesOf(after).length === 0 },
      ];
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
  {
    id: 'divider',
    title: 'Summit divider (ticket 2)',
    room: 'Summit',
    complaint: 'Summit can be booked whole, or as Summit A / Summit B. Whole blocks both halves; halves don’t block each other.',
    date: '2026-11-12',
    rooms: ['rm-summit', 'rm-summit-a', 'rm-summit-b'],
    requires: 'rm-summit-a',
    async run(api) {
      const d = this.date;
      const steps = [
        expectStatus('Book whole Summit 10:00–11:00', 201, await api.book('a', booking('rm-summit', d, '10:00', '11:00', 'All-hands rehearsal'))),
        expectStatus('Book Summit A 10:30–11:30', 409, await api.book('a', booking('rm-summit-a', d, '10:30', '11:30', 'Workshop A'))),
        expectStatus('Book Summit A 11:00–12:00', 201, await api.book('a', booking('rm-summit-a', d, '11:00', '12:00', 'Workshop A'))),
        expectStatus('Book Summit B 11:00–12:00', 201, await api.book('a', booking('rm-summit-b', d, '11:00', '12:00', 'Workshop B'))),
        expectStatus('Book whole Summit 11:30–12:30', 409, await api.book('a', booking('rm-summit', d, '11:30', '12:30', 'Town hall'))),
      ];
      const race = await Promise.all([
        api.book('a', booking('rm-summit', d, '14:00', '15:00', 'Whole-room offsite')),
        api.book('b', booking('rm-summit-b', d, '14:00', '15:00', 'Half-room interview')),
      ]);
      const won = race.filter((r) => r.status === 201).length;
      steps.push({ label: 'Whole room (server A) and Summit B (server B) at the same moment', expected: '1 booked, 1 rejected', actual: `${won} booked, ${2 - won} rejected`, ok: won === 1 });
      return steps;
    },
  },
];
