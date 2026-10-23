import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'qlda-aggregate-test-'));process.env.PLAN_REMOTE_CATALOG='0';
const {put,db}=await import('../server/store.mjs');const {dashboardCountsFor,dashboardRevision}=await import('../server/dashboard-aggregate.mjs');
test('counts use existing channel access rules and persist no customer data',()=>{
 for(const id of ['a','b']){put('connections',{id,status:'connected',provider:'facebook',mode:'demo'});put('customers',{id,name:'PRIVATE '+id,phone:'0900000000'});put('contents',{id,title:'Private content '+id,channels:[id]});}
 put('team_members',{id:'member',teamId:'t',userId:'staff'});put('channel_teams',{id:'channel',teamId:'t',connectionId:'a'});
 put('conversations',{id:'ca',connectionId:'a',customerId:'a',status:'open',kind:'message'});put('staff_handoffs',{id:'handoff',conversationId:'ca',assignedStaffId:'owner',status:'pending'});
 assert.equal(dashboardCountsFor({id:'owner',role:'owner'}).counts.prepared,2);assert.equal(dashboardCountsFor({id:'owner',role:'owner'}).counts.tasks,1);assert.equal(dashboardCountsFor({id:'staff',role:'support'}).counts.tasks,0);
 const staff=dashboardCountsFor({id:'staff',role:'support'});assert.equal(staff.counts.prepared,1);assert.equal(JSON.stringify(staff).includes('PRIVATE'),false);assert.equal(JSON.stringify(staff).includes('0900000000'),false);
 const before=dashboardRevision();put('channel_teams',{id:'channel',teamId:'t',connectionId:'b'});assert.notEqual(dashboardRevision(),before);
 assert.equal(dashboardCountsFor({id:'nobody',role:'support'}).counts.prepared,0);
});
