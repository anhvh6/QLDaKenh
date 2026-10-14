import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const bundled=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.SOCIAL_COPY_PYTHON||(process.platform==='win32'&&existsSync(bundled)?bundled:'python3');
test('public source parser validates source author, merges duplicate metadata, excludes private videos and never guesses dates',()=>{
 const script=String.raw`import importlib.util,json
spec=importlib.util.spec_from_file_location('source','scripts/social-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
fb={'provider':'facebook','url':'https://www.facebook.com/phuong.tran.53181/reels/'}
nodes=[{'__typename':'Video','id':'100001','owner':{'id':'owner','url':'https://www.facebook.com/phuong.tran.53181'},'publish_time':1767225600,'title':{'text':'Caption ❤️'}},{'__typename':'Video','id':'100001'},{'__typename':'Video','id':'100002','owner':{'id':'other','url':'https://www.facebook.com/other'},'publish_time':1767225600}]
rows=m.page_rows('<script>'+json.dumps(nodes)+'</script>',fb)
assert list(rows)==['100001'];assert rows['100001']['caption']=='Caption ❤️';assert rows['100001']['publishedAt']
tt={'provider':'tiktok','url':'https://www.tiktok.com/@faceyoga.megaphuong'}
nodes=[{'id':'7533843098787466514','authorUniqueId':'faceyoga.megaphuong','playAddr':'https://example.com/v','desc':'Video'}, {'id':'7533843098787466515','authorUniqueId':'other','playAddr':'https://example.com/v'}, {'id':'7533843098787466516','authorUniqueId':'faceyoga.megaphuong','playAddr':'https://example.com/v','privateItem':True}]
rows=m.page_rows('<script>'+json.dumps(nodes)+'</script>',tt)
assert list(rows)==['7533843098787466514'];assert rows['7533843098787466514']['publishedAt'] is None
print('ok')`;
 assert.equal(execFileSync(python,['-c',script],{encoding:'utf8',windowsHide:true}).trim(),'ok');
});
