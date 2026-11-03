// Winter 2026 roster: applies the group / sub-group sheet to the live players list.
//   node scripts/winter-roster-2026.mjs          dry run
//   node scripts/winter-roster-2026.mjs --apply  writes sportsday_2026_data/players
// Listed names (matched by name): group + sub set, isNew flag set where marked *.
// Listed names not in the roster: added with the next pid, team '', id = pid.
// Players not on the sheet are left exactly as they are.
const DB = 'https://badminton-2026-687e7-default-rtdb.asia-southeast1.firebasedatabase.app';
const apply = process.argv.includes('--apply');
const SHEET = {
  '1.1': 'หมี เพชร ก๊อป ฮิว Jokee ปาย', '1.2': 'ฝ้าย พล* ไทม์* อาร์ม*',
  '2.1': 'บอส เก้ อรรถ เก่ง พี่ต่อ แจ๊ค', '2.2': 'กัปตันต้น พี่ชัย นก ป๋าทัศ ยุ้ย ปูม ดุ๊ก โจ๊ก',
  '2.3': 'นาย* แชป หญิง ต้น ออป', '3.1': 'ไนซ์ โจ แม็กซ์* ปอ รุจิ* โบว์ลิ่ง เอแคลร์ ปอนด์', '3.2': 'เอิ้น โอ๊ต',
};
const players = await (await fetch(`${DB}/sportsday_2026_data/players.json`)).json();
const master = (await (await fetch(`${DB}/masterPlayers.json?shallow=true`)).json()) || {};
const used = new Set([...players.map(p => p.pid), ...Object.keys(master)]);
let n = 0; const nextPid = () => { let p; do { p = 'P' + String(++n).padStart(3, '0'); } while (used.has(p)); used.add(p); return p; };
const byName = new Map(players.map(p => [p.name, p]));
if (byName.size !== players.length) throw new Error('duplicate names in roster');
const out = players.map(p => ({ ...p })), log = [];
for (const [sub, names] of Object.entries(SHEET)) for (const t of names.split(' ')) {
  const isNew = t.endsWith('*'), name = t.replace('*', ''), group = sub[0];
  const cur = out.find(p => p.name === name);
  if (cur) {
    const was = `G${cur.group}${cur.sub ? ' ' + cur.sub : ''}`;
    cur.group = group; cur.sub = sub; if (isNew) cur.isNew = true;
    log.push(`${cur.pid} ${name}: ${was} -> G${group} ${sub}${isNew ? ' NEW' : ''}${was.slice(0, 2) !== 'G' + group ? '   (group changed)' : ''}`);
  } else {
    const pid = nextPid(); const np = { id: pid, pid, name, team: '', group, sub, w: 0, l: 0, d: 0, pts: 0 }; if (isNew) np.isNew = true;
    out.push(np); log.push(`${pid} ${name}: ADDED G${group} ${sub}${isNew ? ' NEW' : ''}`);
  }
}
console.log(log.join('\n')); console.log(`\nroster ${players.length} -> ${out.length}`);
if (!apply) { console.log('DRY RUN'); process.exit(0); }
const r = await fetch(`${DB}/sportsday_2026_data/players.json`, { method: 'PUT', body: JSON.stringify(out) });
console.log(r.ok ? 'APPLIED' : 'FAILED ' + r.status);
