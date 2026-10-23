import test from 'node:test';import assert from 'node:assert/strict';import {operationalReportTotals} from '../public/report-model.js';
test('materialized reporting preserves cancelled order exclusion, signed refunds and care denominator',()=>{
 const r=operationalReportTotals({orders:[{status:'draft',total:100},{status:'cancelled',total:999},{status:'paid',total:50}],payments:[{amount:100},{amount:-20}],customers:[{id:'a'},{id:'b',mergedInto:'a'}],publications:[{status:'published'},{status:'published'},{status:'demo_published'},{status:'unknown'}],conversations:[{status:'open'},{status:'resolved'},{status:'other'}]});
 assert.equal(r.total,150);assert.equal(r.paid,80);assert.equal(r.customers,1);assert.equal(r.published,2);assert.equal(r.outcomes.demo_published,1);assert.equal(r.care.resolved,1);assert.equal(r.conversationCount,3);
});
