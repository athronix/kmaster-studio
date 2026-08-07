// 独立抽查：直连 sqlite 文件，验证 F22 用量账本是否真的落盘（而非内存回退）
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const home = process.env.KMASTER_STUDIO_HOME
  ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), '.kmaster-studio');
const dbPath = path.join(home, 'kmaster.db');
console.log('KMASTER_STUDIO_HOME =', home);
console.log('dbPath       =', dbPath, 'exists =', fs.existsSync(dbPath), fs.existsSync(dbPath) ? `size=${fs.statSync(dbPath).size}` : '');

if (!fs.existsSync(dbPath)) {
  console.log('=> sqlite 文件不存在：服务端实际走了内存回退，F22 用量为进程内数据，重启即丢');
  process.exit(0);
}
const Database = (await import('better-sqlite3')).default;
const db = new Database(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
console.log('tables       =', tables.join(','));
for (const t of ['sessions', 'messages', 'queue', 'usage']) {
  if (!tables.includes(t)) { console.log(`${t}: <表不存在>`); continue; }
  const c = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  console.log(`${t}: rows=${c}`);
}
if (tables.includes('usage')) {
  const rows = db.prepare('SELECT session_id, model, input_tokens, output_tokens, cost, ts, day FROM "usage" ORDER BY ts').all();
  console.log('usage 明细:');
  for (const r of rows) console.log('  ', JSON.stringify(r));
  const sids = [...new Set(rows.map((r) => r.session_id))];
  console.log('涉及会话数 =', sids.length, sids);
  const alive = tables.includes('sessions')
    ? sids.filter((s) => db.prepare('SELECT 1 FROM sessions WHERE id=?').get(s))
    : [];
  console.log('其中会话仍存在的 =', alive.length, '（用量行是否在删会话后保留：', sids.length > alive.length ? '是，已保留孤儿用量行' : '无法判定/全部会话仍在', '）');
}
