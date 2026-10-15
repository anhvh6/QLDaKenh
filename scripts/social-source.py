"""Read public profile videos. Never claims a partial embedded page is full history."""
import json, sys, re, datetime, base64, html, time
from urllib.parse import urlparse

def iso(value):
    try:
        return datetime.datetime.fromtimestamp(float(value), datetime.timezone.utc).isoformat()
    except (ValueError, TypeError, OverflowError):
        return None

def walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)

def documents(text):
    """Read HTML hydration or newline-delimited GraphQL without executing scripts."""
    if not text.lstrip().startswith('<'):
        text=text.removeprefix('for (;;);')
        try:
            yield json.loads(text)
            return
        except ValueError:
            pass
        raws=text.splitlines()
    else:
        raws=re.findall(r'<script[^>]*>(.*?)</script>',text,re.S)
    for raw in raws:
        try:
            yield json.loads(raw)
        except (ValueError,TypeError):
            continue

def page_rows(text, req):
    rows={};provider=req['provider'];nodes=[n for root in documents(text) for n in walk(root)]
    owners=set(req.get('ownerIds') or []);owned_videos=set()
    if provider=='facebook':
        profile='/'+urlparse(req['url']).path.strip('/').split('/')[0]
        for node in nodes:
            owner=node.get('owner') or {}
            if isinstance(owner,dict) and urlparse(owner.get('url') or '').path.rstrip('/')==profile:
                owners.add(str(owner.get('id')))
        owned_videos={str(n.get('id')) for n in nodes if n.get('__typename') in ('Video','VideoXFBVideo') and str((n.get('owner') or {}).get('id')) in owners}
    for node in nodes:
            if provider=='tiktok':
                key=str(node.get('id') or node.get('aweme_id') or '')
                if not re.fullmatch(r'\d{15,22}',key) or not (node.get('video') or node.get('videoInfo') or node.get('playAddr')) or node.get('privateItem'):
                    continue
                author=node.get('authorUniqueId') or (node.get('author') or {}).get('uniqueId') if isinstance(node.get('author') or {},dict) else node.get('authorUniqueId')
                if not author or req['url'].rsplit('@',1)[-1].strip('/').lower()!=str(author).lower():
                    continue
                rows[key]={'externalId':key,'url':req['url'].rstrip('/')+'/video/'+key,'caption':node.get('desc') or node.get('text') or '', 'publishedAt':iso(node.get('createTime') or node.get('create_time')), 'thumbnail':node.get('coverUrl') or (node.get('video') or {}).get('cover','')}
            elif node.get('__typename') in ('Video','VideoXFBVideo'):
                key=str(node.get('id') or node.get('video_id') or '')
                if not key.isdigit() or key not in owned_videos:
                    continue
                desc=node.get('savable_description') or node.get('title') or {}
                old=rows.get(key,{})
                caption=desc.get('text','') if isinstance(desc,dict) else str(desc)
                rows[key]={'externalId':key,'url':'https://www.facebook.com/reel/'+key,'caption':caption or old.get('caption',''), 'publishedAt':iso(node.get('publish_time') or node.get('creation_time') or node.get('created_time')) or old.get('publishedAt')}
    if provider=='facebook':
        for node in nodes:
            message=node.get('message') or {}
            if not isinstance(message,dict) or not message.get('text'):
                continue
            ids={str(node.get('id') or '')}
            # Story attachments carry the source video and its original caption/date.
            for child in walk(node.get('attachments') or []):
                if child.get('__typename') in ('Video','VideoXFBVideo'):
                    ids.add(str(child.get('id') or ''))
            for key in ids.intersection(rows):
                rows[key]['caption']=rows[key].get('caption') or message['text']
                rows[key]['publishedAt']=rows[key].get('publishedAt') or iso(node.get('creation_time'))
    return rows

def tiktok_date(row):
    # Only explicit platform metadata is accepted. Do not infer publication dates from IDs.
    if row.get('publishedAt'):
        return row
    from curl_cffi import requests
    urls=[row['url'],'https://www.tiktok.com/embed/v2/'+row['externalId']]
    for url in urls:
        try:
            r=requests.get(url,impersonate='chrome',timeout=8)
            if r.status_code!=200:
                continue
            for raw in re.findall(r'<script[^>]*>(.*?)</script>',r.text,re.S):
                try:
                    data=json.loads(raw)
                except ValueError:
                    continue
                for node in walk(data):
                    if str(node.get('id'))==row['externalId']:
                        value=iso(node.get('createTime') or node.get('create_time'))
                        if value:
                            return {**row,'publishedAt':value}
                    if node.get('@type')=='VideoObject' and node.get('uploadDate') and row['externalId'] in str(node.get('url') or node.get('@id') or node.get('embedUrl') or node.get('identifier') or ''):
                        date=datetime.datetime.fromisoformat(node['uploadDate'].replace('Z','+00:00'))
                        if date.tzinfo:
                            return {**row,'publishedAt':date.isoformat()}
        except Exception:
            pass
    return row

def public_request(session,method,url,attempts=3,**kwargs):
    """Bounded retries for transient public network errors; never replay mutations."""
    error=None
    for attempt in range(attempts):
        try:
            r=getattr(session,method)(url,timeout=12,**kwargs)
            if r.status_code==200:
                return r
            error=ValueError('Nguồn trả HTTP '+str(r.status_code))
            if r.status_code not in (500,502,503,504):
                break
        except Exception as exc:
            error=exc
        if attempt<attempts-1:
            time.sleep(.4*(attempt+1))
    raise ValueError('Chưa đọc được nguồn công khai: '+str(error)[:180])

def facebook_context(text,req):
    nodes=[n for root in documents(text) for n in walk(root)]
    profile='/'+urlparse(req['url']).path.strip('/').split('/')[0]
    owners={str(n['owner']['id']) for n in nodes if isinstance(n.get('owner'),dict) and urlparse(n['owner'].get('url') or '').path.rstrip('/')==profile and n['owner'].get('id')}
    collection=next((n for n in nodes if isinstance(n.get('aggregated_fb_shorts'),dict) and n.get('id')),None)
    token=re.search(r'"LSD",\[\],\{"token":"([^"]+)"',text)
    return {'ownerIds':sorted(owners),'collection':collection,'lsd':token[1] if token else ''}

def facebook_operation(text,session):
    """Discover the public page's own read-only pagination document, not a fixed build ID."""
    name='ProfileCometAppCollectionReelsRendererPaginationQuery'
    def extract(js):
        module=name+'_facebookRelayOperation'
        hit=re.search(r'__d\("'+re.escape(module)+r'".{0,350}?\.exports="(\d+)"',js,re.S)
        if not hit:
            return None
        start=js.find('__d("'+name+'.graphql"');end=js.find('__d("',start+6)
        chunk=js[start:end] if start>=0 else ''
        return {'docId':hit[1],'queryName':name,'flags':sorted(set(re.findall(r'__relay_internal__pv__\w+',chunk)))}
    urls=[]
    for url in re.findall(r'<script[^>]*src="([^"]+)"',text):
        url=html.unescape(url)
        if 'base64,' in url and url.startswith('data:'):
            try:
                found=extract(base64.b64decode(url.split('base64,',1)[1]).decode())
                if found:
                    return found
            except (ValueError,UnicodeError):
                pass
        elif url.startswith('https://static.xx.fbcdn.net/'):
            urls.append(url)
    from concurrent.futures import ThreadPoolExecutor
    def load(url):
        try:
            return extract(session.get(url,timeout=12).text)
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(load,urls[:20]):
            if result:
                return result
    raise ValueError('Trang Facebook chưa cung cấp thông tin đọc trang video tiếp theo.')

def facebook_page(req):
    from curl_cffi import requests
    session=requests.Session(impersonate='chrome')
    base='https://www.facebook.com/'+urlparse(req['url']).path.strip('/').split('/')[0]
    url=base+'/reels/'
    response=public_request(session,'get',url)
    ctx=facebook_context(response.text,req)
    rows=page_rows(response.text,{**req,'ownerIds':ctx['ownerIds']})
    collection=ctx['collection'];state=req.get('extractorState') or {};after=req.get('cursor')
    if state.get('collectionId') and collection and state['collectionId']!=collection['id']:
        after=None;state={}
    output=[] if after else list(rows.values())
    continuation=after
    try:
        if not collection or not ctx['ownerIds'] or not ctx['lsd']:
            raise ValueError('Chưa xác định được danh sách video công khai của trang Facebook.')
        connection=collection['aggregated_fb_shorts'];info=connection.get('page_info') or {}
        if not after and info.get('has_next_page') is False:
            return {'videos':output,'complete':True,'partial':False,'nextOffset':None,'nextCursor':None}
        continuation=after or info.get('end_cursor')
        if not continuation:
            raise ValueError('Facebook chưa trả vị trí trang tiếp theo.')
        operation=state.get('operation') or facebook_operation(response.text,session)
        state={'collectionId':collection['id'],'operation':operation}
        variables={key:False for key in operation['flags']}
        variables.update({'count':20,'cursor':continuation,'id':collection['id'],'renderLocation':None,'scale':1,'useDefaultActor':False})
        body={'doc_id':operation['docId'],'variables':json.dumps(variables),'lsd':ctx['lsd'],'__user':'0','__a':'1','__comet_req':'15','fb_api_caller_class':'RelayModern','fb_api_req_friendly_name':operation['queryName']}
        page=public_request(session,'post','https://www.facebook.com/api/graphql/',data=body,headers={'X-FB-LSD':ctx['lsd'],'Referer':url})
        nodes=[n for root in documents(page.text) for n in walk(root)]
        result=next((n for n in nodes if n.get('id')==collection['id'] and isinstance(n.get('aggregated_fb_shorts'),dict)),None)
        if not result:
            raise ValueError('Facebook chưa trả dữ liệu phân trang hợp lệ; giữ lại các video đã tìm thấy.')
        next_info=result['aggregated_fb_shorts'].get('page_info') or {}
        batch=page_rows(page.text,{**req,'ownerIds':ctx['ownerIds']})
        output.extend(batch.values())
        more=next_info.get('has_next_page');next_cursor=next_info.get('end_cursor')
        if more is not False and (more is not True or not next_cursor or next_cursor==continuation or not batch):
            raise ValueError('Facebook trả lại trang cũ hoặc thiếu vị trí tiếp theo; chưa xác nhận quét đủ.')
        return {'videos':list({v['externalId']:v for v in output}.values()),'complete':more is False,'partial':False,'nextOffset':int(req.get('offset') or 0)+len(output) if more else None,'nextCursor':next_cursor if more else None,'extractorState':state,'note':'Đang đọc lần lượt các trang video công khai.' if more else 'Đã đọc đến cuối danh sách Reels công khai Facebook trả về.'}
    except Exception as error:
        if not output:
            raise
        state.pop('operation',None)
        return {'videos':output,'complete':False,'partial':True,'nextOffset':None,'nextCursor':continuation,'resumeAvailable':bool(continuation),'extractorState':state,'note':str(error)+' Có thể bấm Tiếp tục quét; kết quả cũ được giữ nguyên.'}

def tiktok_identity(text,username):
    for root in documents(text):
        for node in walk(root):
            name=node.get('uniqueId') or node.get('unique_id')
            if str(name or '').lower()==username.lower() and node.get('secUid') and not node.get('privateAccount'):
                return node['secUid']
    return None


def tiktok_page(req):
    from curl_cffi import requests
    from yt_dlp.extractor.tiktok import TikTokUserIE
    import yt_dlp
    session=requests.Session(impersonate='chrome')
    state=dict(req.get('extractorState') or {});username=urlparse(req['url']).path.lstrip('/@').strip('/')
    cursor=int(req.get('cursor') or time.time()*1000)
    rows={};sec=state.get('secUid')
    try:
        if not sec:
            # Public creator embed supplies video IDs; each video's public embed identifies its author.
            for url in ['https://www.tiktok.com/embed/@'+username,req['url']]:
                try:
                    response=public_request(session,'get',url,attempts=2)
                    rows.update(page_rows(response.text,req));sec=tiktok_identity(response.text,username)
                    if sec or rows:break
                except ValueError:
                    continue
            if not sec:
                for row in list(rows.values())[:2]:
                    try:
                        response=public_request(session,'get','https://www.tiktok.com/embed/v2/'+row['externalId'],attempts=1)
                        sec=tiktok_identity(response.text,username)
                        if sec:break
                    except ValueError:
                        continue
            if not sec:
                raise ValueError('TikTok chưa trả mã định danh công khai của đúng kênh nguồn.')
        ie=TikTokUserIE(yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True}))
        if state.get('deviceId'):ie._DEVICE_ID=state['deviceId']
        query=ie._build_web_query(sec,cursor)
        state={**state,'secUid':sec,'deviceId':query['device_id']}
        response=public_request(session,'get','https://www.tiktok.com/api/creator/item_list/',params=query)
        try:data=response.json()
        except ValueError:raise ValueError('TikTok trả trang rỗng thay vì danh sách video; chưa xác nhận quét đủ.')
        if data.get('statusCode',data.get('status_code',0)) not in (None,0) or not isinstance(data.get('itemList'),list) or data.get('hasMorePrevious') not in (True,False):
            raise ValueError('TikTok chưa trả danh sách phân trang hợp lệ.')
        batch=page_rows(json.dumps(data),req)
        # Reject recommendations/foreign authors rather than silently importing them.
        if data['itemList'] and not batch:raise ValueError('Không xác minh được tác giả của trang video TikTok.')
        more=data['hasMorePrevious'];dates=[int(v.get('createTime') or 0)*1000 for v in data['itemList']]
        next_cursor=min(dates) if dates and all(dates) else cursor-7*86400000
        ids=sorted(batch)
        if more and (next_cursor>=cursor or ids and ids==state.get('lastIds')):
            raise ValueError('TikTok trả lại trang cũ; giữ vị trí quét để thử lại.')
        state['lastIds']=ids
        return {'videos':list(batch.values()),'complete':not more,'partial':False,'nextOffset':int(req.get('offset') or 0)+len(batch) if more else None,'nextCursor':next_cursor if more else None,'extractorState':state,'note':'Đang đọc lần lượt các trang video công khai TikTok.' if more else 'Đã đọc đến cuối danh sách video công khai TikTok trả về.'}
    except Exception as error:
        if not rows:raise
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as pool:
            videos=list(pool.map(tiktok_date,list(rows.values())))
        return {'videos':videos,'complete':False,'partial':True,'nextOffset':None,'nextCursor':cursor if sec else None,'resumeAvailable':bool(sec),'extractorState':state,'note':str(error)+' Các video đã đọc được giữ lại; chưa xác nhận toàn bộ lịch sử.'}


def scan(req):
    if req.get('provider')=='facebook':return facebook_page(req)
    if req.get('provider')=='tiktok':return tiktok_page(req)
    raise ValueError('Nền tảng nguồn không được hỗ trợ.')

if __name__=='__main__':
    try:
        print(json.dumps(scan(json.load(sys.stdin)),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)[:700]},ensure_ascii=False));sys.exit(1)
