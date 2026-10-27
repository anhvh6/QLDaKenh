// A small bound avoids serial 25-post scans without creating an API request burst.
export async function commentReadBatch(rows, visit, concurrency = 3) {
  let index = 0, failure;
  await Promise.all(Array.from({length: Math.min(concurrency, rows.length)}, async () => {
    while (!failure && index < rows.length) {
      const row = rows[index++];
      try { await visit(row); } catch (error) { failure ||= error; }
    }
  }));
  if (failure) throw failure;
}
