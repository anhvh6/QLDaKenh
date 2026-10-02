const fs = require('fs');
const content = fs.readFileSync('server/store.mjs', 'utf8');

const regex = /export function all[\s\S]*?export function remove\(kind, id\) \{[\s\S]*?\}/;
const replacement = `export function all(kind) {
  return db.prepare('SELECT id, data, version FROM records WHERE kind=? ORDER BY updated_at DESC').all(kind).map(r => ({...JSON.parse(r.data), version: r.version, id: r.id}));
}

export function get(kind, id) {
  const row = db.prepare('SELECT data, version FROM records WHERE kind=? AND id=?').get(kind, id);
  if (!row) return null;
  return {...JSON.parse(row.data), version: row.version, id};
}

export function put(kind, data, expected) {
  const id = data.id || uid(kind);
  const prev = get(kind, id);
  if (expected !== undefined && prev?.version !== expected) throw Object.assign(new Error('Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu.'), {status: 409});
  const record = {...data, id, createdAt: prev?.createdAt || data.createdAt || now(), updatedAt: now()};
  delete record.version;
  const newVersion = prev ? prev.version + 1 : 1;
  db.prepare('INSERT OR REPLACE INTO records(kind, id, data, version, updated_at) VALUES(?,?,?,?,?)').run(kind, id, JSON.stringify(record), newVersion, record.updatedAt);
  return get(kind, id);
}

export function remove(kind, id) {
  db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
}`;

if (regex.test(content)) {
  fs.writeFileSync('server/store.mjs', content.replace(regex, replacement));
  console.log("Fixed store.mjs");
} else {
  console.log("Could not find functions to replace in store.mjs");
}
