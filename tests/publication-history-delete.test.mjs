import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';

mkdirSync('test-data', { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(resolve('test-data'), 'publication-history-delete-'));

const { publicationAction } = await import('../server/domain.mjs');
const { get, put, remove, saveSecret } = await import('../server/store.mjs');
const owner = { id: 'owner', role: 'owner' };

test('published history can delete the remote post after local content was removed', async () => {
  const original = globalThis.fetch, calls = [];
  const connection = put('connections', { id: 'history-blogger', provider: 'blogger', name: 'Blog lịch sử', accountId: 'blog-1', status: 'connected' });
  saveSecret(connection.id, { token: 'blog-token', expiresAt: Date.now() + 60000 });
  const content = put('contents', { id: 'removed-content', title: 'Đã xóa trên web' });
  const publication = put('publications', { id: 'orphan-publication', contentId: content.id, connectionId: connection.id, title: content.title, status: 'published', externalId: 'post-1' });
  remove('contents', content.id);

  try {
    globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 204 }); };
    const result = await publicationAction(owner, publication.id, { action: 'delete_remote' });
    assert.equal(result.status, 'deleted_remote');
    assert.ok(result.deletedAt);
    assert.equal(calls[0].url, 'https://www.googleapis.com/blogger/v3/blogs/blog-1/posts/post-1');
    assert.equal(calls[0].options.method, 'DELETE');
    assert.equal(get('publications', publication.id).status, 'deleted_remote');
  } finally {
    globalThis.fetch = original;
  }
});

test('published history without a remote ID cannot claim successful deletion', async () => {
  const publication = put('publications', { id: 'missing-remote-id', connectionId: 'history-blogger', title: 'Thiếu ID', status: 'published', mode: 'api' });
  await assert.rejects(publicationAction(owner, publication.id, { action: 'delete_remote' }), /còn ID nền tảng/);
  assert.equal(get('publications', publication.id).status, 'published');
});
