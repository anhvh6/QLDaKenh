import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const bundled=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.SOCIAL_COPY_PYTHON||(process.platform==='win32'&&existsSync(bundled)?bundled:'python3');
test('TikTok photo slideshows preserve all pictures and caption while real videos remain video',()=>{
 const script=String.raw`import sys,json,types
sys.path.insert(0,'scripts')
import importlib.util
spec=importlib.util.spec_from_file_location('copy','scripts/social-copy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
spec=importlib.util.spec_from_file_location('source','scripts/social-source.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
payload={'itemInfos':{'id':'7521289942610316551','text':'Exact caption #tag','video':{'urls':[]}},'imagePostInfo':{'displayImages':[{'urlList':['https://example.com/1.jpg'],'width':1080},{'urlList':['https://example.com/2.jpg']} ]}}
r=m.tiktok_payload(payload,'7521289942610316551');assert r['caption']=='Exact caption #tag';assert [x['type'] for x in r['media']]==['image','image'];assert r['media'][1]['url']=='https://example.com/2.jpg'
assert m.tiktok_payload(payload,'other') is None
payload['imagePostInfo']={};payload['itemInfos']['video']={'urls':['https://example.com/v.mp4'],'videoMeta':{'width':720,'height':1280}}
assert m.tiktok_payload(payload,'7521289942610316551')['media'][0]['type']=='video'
req={'provider':'tiktok','url':'https://www.tiktok.com/@faceyoga.megaphuong'}
nodes=[{'id':'7521289942610316551','authorUniqueId':'faceyoga.megaphuong','video':{'playAddr':''},'imagePost':{'images':[{}]}}]
assert not s.page_rows(json.dumps(nodes),req)
nodes[0].pop('imagePost');nodes[0]['video']['playAddr']='https://example.com/v.mp4'
assert len(s.page_rows(json.dumps(nodes),req))==1
# Transient public embed responses retry; unrelated script arrays must not break parsing.
replies=iter([types.SimpleNamespace(status_code=503),types.SimpleNamespace(status_code=200,text='<script>[]</script><script>'+json.dumps({'source':{'data':{'/embed/v2/7521289942610316551':{'videoData':payload}}}})+'</script>')])
sys.modules['curl_cffi']=types.SimpleNamespace(requests=types.SimpleNamespace(get=lambda *a,**kw:next(replies)));m.time.sleep=lambda n:None
assert m.tiktok_embed(req['url']+'/video/7521289942610316551')['media'][0]['type']=='video'
print('ok')`;
 assert.equal(execFileSync(python,['-c',script],{encoding:'utf8',windowsHide:true}).trim(),'ok');
});
