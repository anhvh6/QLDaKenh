"""Read public profile videos. Never claims a partial embedded page is full history."""
import json, sys, re, datetime
from urllib.parse import urlparse
from itertools import islice

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

def page_rows(text, req):
    rows={};provider=req['provider'];nodes=[]
    for raw in re.findall(r'<script[^>]*>(.*?)</script>',text,re.S):
        try:
            data=json.loads(raw)
        except ValueError:
            continue
        nodes.extend(walk(data))
    owners=set();owned_videos=set()
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
                if author and req['url'].rsplit('@',1)[-1].lower()!=str(author).lower():
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
    return rows

def tiktok_date(row):
    # Only explicit platform metadata is accepted. Do not infer publication dates from IDs.
    from curl_cffi import requests
    try:
        r=requests.get(row['url'],impersonate='chrome',timeout=10)
        if r.status_code!=200:
            return row
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
                if node.get('@type')=='VideoObject' and node.get('uploadDate'):
                    date=datetime.datetime.fromisoformat(node['uploadDate'].replace('Z','+00:00'))
                    if date.tzinfo:
                        return {**row,'publishedAt':date.isoformat()}
    except Exception:
        pass
    return row

def public_page(req):
    from curl_cffi import requests
    urls=[req['url']]
    if req['provider']=='tiktok':
        embed='https://www.tiktok.com/embed/'+urlparse(req['url']).path.lstrip('/')
        urls.extend([embed,embed+'?lang=en'])
    rows={};last_error=''
    for url in urls:
        try:
            response=requests.get(url,impersonate='chrome',timeout=20)
            if response.status_code==200:
                rows=page_rows(response.text,req)
                if rows:
                    break
            else:
                last_error='HTTP '+str(response.status_code)
        except Exception:
            last_error='Kết nối nguồn công khai bị gián đoạn'
    if not rows:
        raise ValueError('Nguồn chưa trả danh sách video công khai. Có thể yêu cầu đăng nhập hoặc giới hạn máy chủ; chưa thể xác nhận quét đầy đủ. '+last_error)
    videos=list(rows.values())
    if req['provider']=='tiktok':
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as pool:
            videos=list(pool.map(tiktok_date,videos))
    return {'videos':videos,'nextOffset':None,'complete':False,'partial':True,'note':'Chỉ lấy được các video hiện có trong trang công khai/nhúng; chưa xác nhận toàn bộ lịch sử. Video thiếu ngày đăng chưa được tự động xếp lịch.'}

def scan(req):
    import yt_dlp
    offset=max(0,int(req.get('offset',0)));limit=min(50,max(1,int(req.get('limit',20))))
    opts={'quiet':True,'no_warnings':True,'skip_download':True,'extract_flat':True,'lazy_playlist':True,'socket_timeout':15,'retries':0,'extractor_retries':0,'playliststart':offset+1,'playlistend':offset+limit+1,'allowed_extractors':['default','-generic']}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            result=ydl.extract_info(req['url'],download=False)
            if not result or result.get('_type') not in ('playlist','multi_video'):
                raise ValueError('Nguồn không trả danh sách video.')
            entries=list(islice(result.get('entries') or [],limit+1));rows=[]
            for item in entries[:limit]:
                if not item:
                    continue
                key=str(item.get('id') or '')
                if not key.isdigit():
                    continue
                url=item.get('webpage_url') or item.get('url') or ''
                if not url.startswith('https://'):
                    url=req['url'].rstrip('/')+'/video/'+key if req['provider']=='tiktok' else 'https://www.facebook.com/reel/'+key
                published=iso(item.get('timestamp') or item.get('release_timestamp'))
                if not published and item.get('upload_date'):
                    published=datetime.datetime.strptime(item['upload_date'],'%Y%m%d').replace(tzinfo=datetime.timezone.utc).isoformat()
                rows.append({'externalId':key,'url':url,'caption':item.get('description') or item.get('title') or '', 'publishedAt':published,'thumbnail':item.get('thumbnail') or '', 'duration':item.get('duration')})
            if not rows and not offset:
                raise ValueError('Danh sách video rỗng hoặc chưa truy cập được.')
            return {'videos':rows,'nextOffset':offset+limit if len(entries)>limit else None,'complete':len(entries)<=limit,'partial':False}
    except Exception:
        if offset:
            raise
        return public_page(req)

if __name__=='__main__':
    try:
        print(json.dumps(scan(json.load(sys.stdin)),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)[:700]},ensure_ascii=False));sys.exit(1)
