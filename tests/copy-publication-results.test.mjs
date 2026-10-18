import test from 'node:test';
import assert from 'node:assert/strict';
import {copyPublicationResults} from '../server/copy-publications.mjs';
import {publicationIcons} from '../public/copy-job-table.js';
import {validateThreadsText} from '../server/connectors.mjs';
test('latest per-channel publication keeps success URL and exact failure without historical failures masking new success',()=>{
 const channels=[{id:'fb',provider:'facebook',name:'Page'},{id:'th',provider:'threads',name:'Threads account'}];const rows=[{id:'old',connectionId:'th',status:'failed',error:'Old error',createdAt:'2026-01-01'},{id:'new',connectionId:'th',status:'published',url:'https://www.threads.net/@qa/post/test',createdAt:'2026-01-03'},{id:'fb-result',connectionId:'fb',status:'failed',error:'Exact error',createdAt:'2026-01-02'}];const targets=copyPublicationResults(rows,channels);assert.equal(targets.length,2);assert.equal(targets[0].success,true);assert.equal(targets[0].error,'');assert.equal(targets[1].error,'Exact error');
 const html=publicationIcons({id:'job',reupTargets:targets});assert.match(html,/href="https:\/\/www.threads.net\/@qa\/post\/test"/);assert.match(html,/data-copy-action="retry-platform" data-id="job" data-publication-id="fb-result"/);assert.match(html,/Exact error/);assert.match(html,/#9299a0/);
});
test('publication icons escape provider errors and reject executable URLs',()=>{
 const html=publicationIcons({id:'job',reupTargets:[{publicationId:'p',provider:'threads',success:true,url:'javascript:alert(1)'},{publicationId:'bad',provider:'facebook',status:'failed',error:'<script>alert(1)</script>'}]});assert.doesNotMatch(html,/href="javascript:/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('Threads limit catches long captions before a remote publish and counts Unicode code points',()=>{assert.doesNotThrow(()=>validateThreadsText('💚'.repeat(500)));assert.throws(()=>validateThreadsText('a'.repeat(501)),/500 ký tự.*501 ký tự/);});


test('publication tooltips identify remote channel names, even for disabled pending icons',()=>{
 const rows=copyPublicationResults([{id:'waiting',connectionId:'page',status:'scheduled'}],[{id:'page',provider:'facebook',name:'Facebook Page',remoteName:'Maximus - Menswear'}]);
 assert.equal(rows[0].channelName,'Maximus - Menswear');const html=publicationIcons({id:'job',reupTargets:rows});
 assert.match(html,/title="Facebook · Maximus - Menswear:/);assert.match(html,/tabindex="0"/);assert.match(html,/disabled/);
});
