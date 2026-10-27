import {db,get} from './store.mjs';
db.exec(`CREATE INDEX IF NOT EXISTS idx_publication_copy_item ON records(json_extract(data,'$.copyPlanItemId')) WHERE kind='publications';
CREATE INDEX IF NOT EXISTS idx_publication_content ON records(json_extract(data,'$.contentId')) WHERE kind='publications';`);
// Do not deserialize every publication once for each of thousands of plan items.
export function publicationCandidates(item) {
  return db.prepare(`SELECT id FROM records WHERE kind='publications' AND json_extract(data,'$.copyPlanItemId')=?
    UNION SELECT id FROM records WHERE kind='publications' AND json_extract(data,'$.contentId')=?`)
    .all(item.id,item.contentId||null).map(row=>get('publications',row.id));
}
