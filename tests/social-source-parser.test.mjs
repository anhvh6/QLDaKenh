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

test('public pagination validates cursors, explicit end, authors and recovery for both providers',()=>{
 const script=String.raw`import importlib.util,json,sys,types
spec=importlib.util.spec_from_file_location('source','scripts/social-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response:
    status_code=200
    def __init__(self,data):self.text=json.dumps(data)
    def json(self):return json.loads(self.text)
class Session:pass
sys.modules['curl_cffi']=types.SimpleNamespace(requests=types.SimpleNamespace(Session=lambda **kw:Session()))
fb={'provider':'facebook','url':'https://www.facebook.com/phuong.tran.53181/'}
def video(key):return {'__typename':'Video','id':key,'owner':{'id':'owner','url':fb['url']},'publish_time':1767225600,'title':{'text':'Caption'}}
def collection(cursor,more):return {'id':'collection','aggregated_fb_shorts':{'page_info':{'end_cursor':cursor,'has_next_page':more}}}
initial='<script>'+json.dumps([video('100001'),collection('c1',True)])+'</script>"LSD",[],{"token":"public-token"}'
page={'data':{'node':collection('c2',True)},'videos':[video('100002')]}
def request(session,method,url,**kw):
    if method=='get':return types.SimpleNamespace(text=initial,status_code=200)
    assert kw['data']['doc_id']=='public-doc';assert json.loads(kw['data']['variables'])['renderLocation'] is None
    return Response(page)
m.public_request=request;m.facebook_operation=lambda *a:{'docId':'public-doc','queryName':'ReadOnly','flags':[]}
x=m.scan(fb);assert len(x['videos'])==2 and x['nextCursor']=='c2' and not x['complete']
page['data']['node']=collection(None,False)
x=m.scan({**fb,'cursor':'c2','extractorState':x['extractorState']});assert len(x['videos'])==1 and x['complete'] and x['nextCursor'] is None
page['data']['node']=collection('c1',True)
x=m.scan(fb);assert x['partial'] and x['resumeAvailable'] and len(x['videos'])==2
# Streamed deferred GraphQL chunks are all parsed.
assert len(list(m.documents('for (;;);'+json.dumps({'one':1})+'\n'+json.dumps({'two':2}))))==2
# TikTok query construction is provided by the installed extractor; no login is needed.
class IE:
    def __init__(self,*a):pass
    def _build_web_query(self,sec,cursor):return {'device_id':getattr(self,'_DEVICE_ID','public-device'),'secUid':sec,'cursor':cursor}
sys.modules['yt_dlp']=types.SimpleNamespace(YoutubeDL=lambda *a:None)
sys.modules['yt_dlp.extractor']=types.ModuleType('yt_dlp.extractor')
sys.modules['yt_dlp.extractor.tiktok']=types.SimpleNamespace(TikTokUserIE=IE)
tt={'provider':'tiktok','url':'https://www.tiktok.com/@source','cursor':1800000000000,'extractorState':{'secUid':'public-sec','deviceId':'same-device'}}
assert m.tiktok_identity('<script>'+json.dumps({'uniqueId':'other','secUid':'wrong'})+'</script>','source') is None
assert m.tiktok_identity('<script>'+json.dumps({'uniqueId':'source','secUid':'yes'})+'</script>','source')=='yes'
v={'id':'7533843098787466514','author':{'uniqueId':'source'},'video':{'cover':'https://example.com/v'},'createTime':1767225600,'desc':'Caption'}
data={'itemList':[v],'hasMorePrevious':True,'statusCode':0}
def ttrequest(session,method,url,**kw):
    assert kw['params']['device_id']=='same-device'
    return Response(data)
m.public_request=ttrequest
x=m.scan(tt);assert len(x['videos'])==1 and x['nextCursor']==1767225600000 and not x['complete']
data['hasMorePrevious']=False
assert m.scan(tt)['complete']
data['hasMorePrevious']=True;data['itemList'][0]['author']['uniqueId']='other'
try:m.scan(tt);raise AssertionError('foreign author accepted')
except ValueError:pass
data['itemList']=[];data.pop('hasMorePrevious')
try:m.scan(tt);raise AssertionError('missing pagination accepted')
except ValueError:pass
print('ok')`;
 assert.equal(execFileSync(python,['-c',script],{encoding:'utf8',windowsHide:true}).trim(),'ok');
});
