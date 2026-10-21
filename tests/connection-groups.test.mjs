import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionGroup,groupConnections} from '../public/connection-groups.js';
test('connection groups distinguish failures, pending permissions, reconnecting, manual and disconnected channels',()=>{
 assert.equal(connectionGroup({status:'connected',health:{checks:[{key:'chat',status:'error'}]}}),'attention');
 assert.equal(connectionGroup({status:'connected',health:{checks:[{status:'ok'}]}}),'connected');
 assert.equal(connectionGroup({provider:'zalo_personal',status:'connected',listenerState:'stopped'}),'attention');
 assert.equal(connectionGroup({provider:'zalo_personal',status:'connected',listenerState:'listening'}),'connected');
 assert.equal(connectionGroup({status:'reconnecting'}),'connecting');
 assert.equal(connectionGroup({status:'configured'}),'pending');
 assert.equal(connectionGroup({mode:'assisted',status:'assisted'}),'manual');
 assert.equal(connectionGroup({mode:'assisted',status:'disconnected',health:{checks:[{status:'error'}]}}),'disconnected');
});
test('grouping excludes simulation and deleted records, preserves all real channels exactly once and sorts groups consistently',()=>{
 const channels=[{id:'ok',status:'connected'},{id:'demo',mode:'demo'},{id:'legacy',status:'demo'},{id:'removed',deletedAt:'today'},{id:'bad',status:'error'},{id:'pending',status:'configured'}];
 const groups=groupConnections(channels);
 assert.deepEqual(groups.map(g=>g.key),['attention','pending','connected']);
 assert.deepEqual(groups.flatMap(g=>g.channels.map(c=>c.id)),['bad','pending','ok']);
 assert.deepEqual(groupConnections([]),[]);
});
