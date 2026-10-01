import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(join(dataDir, 'uploads'), { recursive: true });
mkdirSync(join(dataDir, 'backups'), { recursive: true });
const keyPath = join(dataDir, 'encryption.key');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
const key = readFileSync(keyPath);
export const db = new DatabaseSync(join(dataDir, 'hub.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE INDEX IF NOT EXISTS idx_records_kind_updated ON records(kind,updated_at);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS secrets(id TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,source TEXT NOT NULL,received_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,entity TEXT,detail TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
export const uid = (prefix='id') => `${prefix}_${randomUUID()}`;
export const now = () => new Date().toISOString();
import syncFetch from 'sync-fetch';
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqtnzvqyljweppklblni.supabase.co';
export const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_uHPer_Bt1RR9DutO4vcG3w_MUVligrK';
let cachedToken = null;
let tokenExpiresAt = 0;

export function getSupabaseHeaders() {
  if (Date.now() > tokenExpiresAt) {
    const authRes = syncFetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.SUPABASE_SYSTEM_EMAIL || 'anhvh@gmail.com', password: process.env.SUPABASE_SYSTEM_PASSWORD || 'Ttdt123a@' })
    });
    if (authRes.status !== 200) throw new Error('Supabase Auth Failed');
    const auth = authRes.json();
    cachedToken = auth.access_token;
    tokenExpiresAt = Date.now() + ((auth.expires_in - 60) * 1000);
  }
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + cachedToken,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  };
}

export function all(kind) {
  const res = syncFetch(`${SUPABASE_URL}/rest/v1/records?kind=eq.${kind}&order=updated_at.desc`, { headers: getSupabaseHeaders() });
  if (res.status !== 200) throw new Error(res.text());
  return res.json().map(r => ({...r.data, version: r.version}));
}

export function get(kind, id) {
  const res = syncFetch(`${SUPABASE_URL}/rest/v1/records?kind=eq.${kind}&id=eq.${id}`, { headers: getSupabaseHeaders() });
  if (res.status !== 200) throw new Error(res.text());
  const rows = res.json();
  return rows.length ? {...rows[0].data, version: rows[0].version} : null;
}

export function put(kind, data, expected) {
  const id = data.id || uid(kind); const prev = get(kind, id);
  if(expected !== undefined && prev?.version !== expected) throw Object.assign(new Error('Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu.'),{status:409});
  const record = {...data, id, createdAt: prev?.createdAt || data.createdAt || now(), updatedAt: now()}; delete record.version;
  const newVersion = prev ? prev.version + 1 : 1;
  const res = syncFetch(`${SUPABASE_URL}/rest/v1/records`, {
    method: 'POST',
    headers: getSupabaseHeaders(),
    body: JSON.stringify({ kind, id, data: record, version: newVersion, updated_at: record.updatedAt })
  });
  if (res.status > 201) throw new Error(res.text());
  return get(kind, id);
}

export function remove(kind, id) {
  const headers = getSupabaseHeaders();
  delete headers['Prefer'];
  syncFetch(`${SUPABASE_URL}/rest/v1/records?kind=eq.${kind}&id=eq.${id}`, { method: 'DELETE', headers });
}

export function transaction(fn) {
  return fn();
}
export function audit(actor,action,entity='',detail='') { db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(uid('log'),actor,action,entity,typeof detail==='string'?detail:JSON.stringify(detail),now()); }
export function saveSecret(id,value) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]); db.prepare('INSERT OR REPLACE INTO secrets VALUES(?,?)').run(id,Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64')); }
export function secret(id) { const row=db.prepare('SELECT value FROM secrets WHERE id=?').get(id); if(!row)return {}; const b=Buffer.from(row.value,'base64'); const cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12)); cipher.setAuthTag(b.subarray(12,28)); return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString()); }
export function notification(title,body,route='dashboard') { return put('notifications',{title,body,route,read:false}); }
