import { makeApi, SCENARIOS } from './scenarios.js';

const api = makeApi('');
const DAY_START = 8 * 60;
const DAY_END = 19 * 60;
const SPAN = DAY_END - DAY_START;

const $ = (id) => document.getElementById(id);
const state = { date: '2026-10-05', replica: 'a', rooms: [], highlight: new Set(), lastResults: {} };

const pad = (n) => String(n).padStart(2, '0');
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const minutesOf = (local) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

function describeResponse(r) {
  if (r.status === 201) return 'Booked';
  if (r.status === 409) {
    const c = r.body?.error?.details?.[0];
    return c ? `Rejected: clashes with “${c.title}” (${c.start.slice(11)}–${c.end.slice(11)})` : 'Rejected: conflict';
  }
  return `Error ${r.status}: ${r.body?.error?.message ?? 'request failed'}`;
}

/* ---------- rooms ---------- */

function orderRooms(rooms) {
  const byParent = new Map();
  for (const r of rooms) {
    const p = r.parentId ?? '';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(r);
  }
  const ids = new Set(rooms.map((r) => r.id));
  const top = rooms.filter((r) => !r.parentId || !ids.has(r.parentId)).sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name));
  const out = [];
  for (const r of top) {
    out.push({ ...r, depth: 0 });
    for (const c of (byParent.get(r.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))) out.push({ ...c, depth: 1 });
  }
  return out;
}

async function loadRooms() {
  const r = await api.rooms(state.replica);
  state.rooms = orderRooms(r.body?.rooms ?? []);
}

/* ---------- calendar ---------- */

function renderHours() {
  const hours = $('hours');
  hours.innerHTML = '';
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) {
    const s = document.createElement('span');
    s.style.left = `${((h * 60 - DAY_START) / SPAN) * 100}%`;
    s.textContent = `${h}:00`;
    if (h === DAY_END / 60) s.style.transform = 'translateX(-100%)';
    if (h === DAY_START / 60) s.style.transform = 'none';
    hours.append(s);
  }
}

function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const laneEnds = [];
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end <= it.s);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = it.e;
    it.lane = lane;
    it.clash = sorted.some((o) => o !== it && o.s < it.e && it.s < o.e);
  }
  return Math.max(1, laneEnds.length);
}

async function renderCalendar() {
  const d = new Date(`${state.date}T00:00:00Z`);
  $('dayLabel').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  $('date').value = state.date;
  const rowsEl = $('rows');
  const busy = await Promise.all(state.rooms.map((room) => api.busy(state.replica, room.id, state.date)));
  rowsEl.innerHTML = '';
  state.rooms.forEach((room, i) => {
    const row = document.createElement('div');
    row.className = `row${room.depth ? ' child' : ''}${state.highlight.has(room.id) ? ' hl' : ''}`;
    row.title = room.id;
    row.innerHTML = `<div class="row__name"><b>${esc(room.name)}</b><small>${room.capacity} seats · floor ${room.floor}</small></div>`;
    const track = document.createElement('div');
    track.className = 'track';
    track.setAttribute('aria-label', `${room.name} timeline`);
    const items = (busy[i].body?.busy ?? []).map((b) => ({ ...b, s: minutesOf(b.start), e: minutesOf(b.end) }));
    const lanes = layoutLanes(items);
    track.style.minHeight = `${Math.max(2.9, lanes * 1.6 + 0.6)}rem`;
    for (const it of items) {
      if (it.e <= DAY_START || it.s >= DAY_END) continue;
      const s = Math.max(it.s, DAY_START);
      const e = Math.min(it.e, DAY_END);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `block${it.clash ? ' clash' : ''}`;
      btn.style.left = `${((s - DAY_START) / SPAN) * 100}%`;
      btn.style.width = `calc(${((e - s) / SPAN) * 100}% - 2px)`;
      btn.style.top = `${0.3 + it.lane * 1.6}rem`;
      btn.style.height = '1.4rem';
      btn.innerHTML = `${esc(it.title)}<small>${hm(it.s)}–${hm(it.e)}</small>`;
      btn.setAttribute('aria-label', `${it.title}, ${hm(it.s)} to ${hm(it.e)}${it.clash ? ', clashes with another booking' : ''}`);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openInfo(room, it);
      });
      track.append(btn);
    }
    track.addEventListener('click', (ev) => {
      const rect = track.getBoundingClientRect();
      const min = DAY_START + ((ev.clientX - rect.left) / rect.width) * SPAN;
      const start = Math.min(DAY_END - 15, Math.floor(min / 15) * 15);
      openBook(room, start, Math.min(DAY_END, start + 60));
    });
    row.append(track);
    rowsEl.append(row);
  });
}

async function refresh() {
  await loadRooms();
  await renderCalendar();
}

/* ---------- dialogs ---------- */

let bookTarget = null;
function openBook(room, start, end) {
  bookTarget = room;
  const f = $('bookForm');
  $('bookTitle').textContent = `Book ${room.name} · ${state.date}`;
  f.start.value = hm(start);
  f.end.value = hm(end);
  f.weekly.checked = false;
  $('bookVia').textContent = `Sent to server ${state.replica.toUpperCase()}.`;
  $('bookDlg').showModal();
}

$('bookDlg').addEventListener('close', async () => {
  if ($('bookDlg').returnValue !== 'ok' || !bookTarget) return;
  const f = $('bookForm');
  const body = {
    roomId: bookTarget.id,
    title: f.title.value,
    organizer: 'demo@example.com',
    start: `${state.date}T${f.start.value}`,
    end: `${state.date}T${f.end.value}`,
  };
  if (f.weekly.checked) body.recurrence = { freq: 'WEEKLY', count: Number(f.count.value) };
  const r = await api.book(state.replica, body);
  toast(`${bookTarget.name}: ${describeResponse(r)}`, r.status !== 201);
  await renderCalendar();
});

let infoTarget = null;
function openInfo(room, it) {
  infoTarget = it;
  $('infoTitle').textContent = it.title;
  $('infoBody').textContent = `${room.name} · ${state.date} · ${hm(it.s)}–${hm(it.e)} · ${it.bookingId}`;
  $('infoDlg').showModal();
}

$('infoDlg').addEventListener('close', async () => {
  if ($('infoDlg').returnValue !== 'cancelBooking' || !infoTarget) return;
  const r = await api.cancel(state.replica, infoTarget.bookingId);
  toast(r.status === 204 ? `Cancelled “${infoTarget.title}”` : `Cancel failed (${r.status})`, r.status !== 204);
  await renderCalendar();
});

/* ---------- scenarios ---------- */

function renderScenarios() {
  const hasRoom = (id) => state.rooms.some((r) => r.id === id);
  const list = $('scenarios');
  list.innerHTML = '';
  for (const sc of SCENARIOS) {
    const available = !sc.requires || hasRoom(sc.requires);
    const prev = state.lastResults[sc.id];
    const li = document.createElement('li');
    li.className = 'scen';
    li.setAttribute('aria-disabled', String(!available));
    li.innerHTML = `
      <div><div class="scen__title">${esc(sc.title)} ${prev === undefined ? '' : `<span class="scen__badge ${prev ? 'ok' : 'bad'}">${prev ? 'works' : 'bug'}</span>`}</div>
      <div class="scen__room">${esc(sc.room)}</div></div>
      <button type="button" ${available ? '' : 'disabled'}>Replay</button>
      <div class="scen__complaint">${esc(available ? sc.complaint : 'Needs the Summit A/B rooms from ticket 2 in data/rooms.json.')}</div>`;
    li.querySelector('button').addEventListener('click', () => runScenario(sc, li.querySelector('button')));
    list.append(li);
  }
}

async function runScenario(sc, btn) {
  btn.disabled = true;
  btn.textContent = 'Running…';
  const out = $('result');
  out.hidden = false;
  out.innerHTML = `<h3>${esc(sc.title)}</h3><p class="hint">Resetting data and replaying…</p>`;
  try {
    await api.reset();
    const steps = await sc.run(api);
    const ok = steps.every((s) => s.ok);
    state.lastResults[sc.id] = ok;
    out.innerHTML = `<h3>${esc(sc.title)}</h3>
      <p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Behaves correctly' : 'Bug reproduced'}</p>
      <ol class="steps">${steps
        .map(
          (s) => `<li class="step ${s.ok ? 'ok' : 'bad'}"><span class="step__icon">${s.ok ? '✓' : '✗'}</span><span>${esc(s.label)}</span>
          <span class="step__detail">Expected: ${esc(s.expected)} · Got: <strong>${esc(s.actual)}</strong></span></li>`,
        )
        .join('')}</ol>`;
    state.date = sc.date;
    state.highlight = new Set(sc.rooms);
    await refresh();
  } catch (err) {
    out.innerHTML = `<h3>${esc(sc.title)}</h3><p class="verdict bad">The replay crashed</p><p class="hint">${esc(err?.message ?? err)}</p>`;
  } finally {
    renderScenarios();
  }
}

/* ---------- wiring ---------- */

$('prev').addEventListener('click', () => { state.date = shiftDate(state.date, -1); state.highlight.clear(); renderCalendar(); });
$('next').addEventListener('click', () => { state.date = shiftDate(state.date, 1); state.highlight.clear(); renderCalendar(); });
$('date').addEventListener('change', (e) => { if (e.target.value) { state.date = e.target.value; state.highlight.clear(); renderCalendar(); } });
$('replica').addEventListener('change', (e) => { state.replica = e.target.value; refresh(); });
$('reset').addEventListener('click', async () => {
  await api.reset();
  state.lastResults = {};
  state.highlight.clear();
  toast('Seed data reloaded, both servers restarted');
  await refresh();
  renderScenarios();
});

(async () => {
  try {
    const info = await api.info();
    $('repo').textContent = info.repo;
  } catch {}
  renderHours();
  await refresh();
  renderScenarios();
})();
