import {db,get} from './store.mjs';
db.exec(`CREATE INDEX IF NOT EXISTS idx_publication_copy_item ON records(json_extract(data,'$.copyPlanItemId')) WHERE kind='publications';
CREATE INDEX IF NOT EXISTS idx_publication_content ON records(json_extract(data,'$.contentId')) WHERE kind='publications';`);
// Do not deserialize every publication once for each of thousands of plan items.
// In a UNION SQLite ignores these partial indexes and scans every publication per call (~1.4 ms with 1,500 rows, versus 0.004 ms with the
// index), which kept a production core busy; INDEXED BY pins the plan. Called for every plan item on every automation tick, so the
// statement is compiled once.
export const publicationCandidatesSql=`SELECT id FROM records INDEXED BY idx_publication_copy_item WHERE kind='publications' AND json_extract(data,'$.copyPlanItemId')=?
    UNION SELECT id FROM records INDEXED BY idx_publication_content WHERE kind='publications' AND json_extract(data,'$.contentId')=?`;
let candidates;
export function publicationCandidates(item) {
  candidates??=db.prepare(publicationCandidatesSql);
  return candidates.all(item.id,item.contentId||null).map(row=>get('publications',row.id));
}
