"""Isolated extractor and ZIP worker. Input/output is JSON, never shell interpolation."""
import json, sys, os, zipfile, re, html
from pathlib import Path
from urllib.parse import urlparse

def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)

def facebook_payload(payloads, post_id):
    stories = [n for p in payloads for n in walk(p) if n.get('__typename') == 'Story' and str(n.get('post_id','')) == post_id]
    if not stories:
        return None
    story = max(stories, key=lambda s: len(json.dumps(s)))
    text = next((n['message']['text'] for n in walk(story.get('comet_sections', {})) if isinstance(n.get('message'), dict) and isinstance(n['message'].get('text'), str)), '')
    text = text or (story.get('message') or {}).get('text', '')
    media, seen = [], set()
    for attachment in story.get('attachments', []):
        albums = [n['all_subattachments'] for n in walk(attachment) if isinstance(n.get('all_subattachments'), dict)]
        if albums:
            album = max(albums, key=lambda a: len(a.get('nodes', [])))
            if album.get('count', 0) != len(album.get('nodes', [])):
                raise ValueError('Facebook chỉ trả một phần album. Chưa thể tải đầy đủ bài này.')
            nodes = [n.get('media', {}) for n in album.get('nodes', [])]
        else:
            nodes = [n for n in walk(attachment) if n.get('__typename') in ('Photo', 'Video')]
        for node in nodes:
            key = node.get('id')
            if key in seen:
                continue
            if node.get('__typename') == 'Photo':
                images = [v for v in node.values() if isinstance(v, dict) and v.get('uri') and v.get('width')]
                if not images:
                    continue
                image = max(images, key=lambda i: i.get('width',0) * i.get('height',0))
                media.append({'url':image['uri'], 'type':'image', 'ext':'jpg', 'width':image.get('width'), 'height':image.get('height')})
                seen.add(key)
            elif node.get('__typename') == 'Video':
                direct = node.get('playable_url_quality_hd') or node.get('browser_native_hd_url') or node.get('playable_url') or node.get('browser_native_sd_url')
                if not direct:
                    raise ValueError('Facebook chưa cung cấp đầy đủ video của bài này.')
                media.append({'url':direct, 'type':'video', 'ext':'mp4'})
                seen.add(key)
    if not text and not media:
        return None
    author = (story.get('actors') or [{}])[0].get('name', '')
    return {'title':story.get('seo_title') or text[:200] or 'Bài Facebook', 'caption':text, 'author':author, 'media':media, 'engine':'gallery'}

def facebook_post(url):
    from curl_cffi import requests
    response = requests.get(url, impersonate='chrome', timeout=30)
    if response.status_code != 200:
        raise ValueError('Facebook không cho truy cập bài viết này.')
    match = re.search(r'(?:posts|permalink)/(\d+)', response.url)
    if not match:
        canonical = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', response.text)
        match = re.search(r'(?:posts|permalink)/(\d+)', html.unescape(canonical[1]) if canonical else '')
    if not match:
        return None
    payloads = []
    for script in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', response.text, re.S):
        try:
            payloads.append(json.loads(script))
        except ValueError:
            pass
    return facebook_payload(payloads, match[1])

def resolve_source(url):
    if 'facebook.com/share/' not in url:
        return url
    import requests
    response = requests.get(url, headers={'User-Agent':'Mozilla/5.0'}, timeout=25)
    final = response.url
    if urlparse(final).hostname not in ('www.facebook.com','facebook.com','m.facebook.com'):
        raise ValueError('Link chia sẻ chuyển ra ngoài Facebook.')
    return final

def caption(meta):
    for key in ('description', 'caption', 'content', 'text', 'tweet_content'):
        value = meta.get(key)
        if isinstance(value, str) and value:
            return value
    return ''

def extract(url, target=None):
    url = resolve_source(url)
    if 'facebook.com' in url and re.search(r'/(?:posts|permalink)/', url):
        post = facebook_post(url)
        if post:
            return post
    # Gallery extractors preserve carousel order; yt-dlp handles video streams/muxing.
    from gallery_dl import extractor, config
    config.set(('extractor',), 'timeout', 25)
    config.set(('extractor',), 'retries', 1)
    media, text, author = [], '', ''
    if not any(host in url for host in ('youtube.com', 'youtu.be', 'facebook.com', 'fb.watch')):
        ex = extractor.find(url)
        if ex:
            try:
                for kind, value, *rest in ex:
                    meta = rest[0] if rest else value if isinstance(value, dict) else {}
                    text = text or caption(meta)
                    author = author or str(meta.get('username') or meta.get('author') or '')
                    if kind == 3:
                        ext = meta.get('extension', 'jpg')
                        media.append({'url': value, 'type': 'video' if ext in ('mp4','webm','mov') else 'image', 'ext': ext})
                    if len(media) > 100:
                        raise ValueError('Bài có quá 100 media.')
            except Exception:
                media = []
    if media:
        return {'title': (text or 'Bài viết')[:200], 'caption': text, 'author': author, 'media': media, 'engine': 'gallery'}
    import yt_dlp
    opts = {'quiet': True, 'no_warnings': True, 'noplaylist': True, 'socket_timeout': 25,
            'retries': 1, 'extractor_retries': 1, 'format': 'bv*+ba/b', 'merge_output_format': 'mp4',
            'allowed_extractors': ['default', '-generic'], 'playlistend': 100,
            'impersonate': __import__('yt_dlp.networking.impersonate', fromlist=['ImpersonateTarget']).ImpersonateTarget(client='chrome')}
    if target:
        opts['outtmpl'] = str(Path(target) / '%(autonumber)03d-%(id)s.%(ext)s')
        opts['max_filesize'] = 1024 * 1024 * 1024
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=bool(target))
        entries = list(info.get('entries') or [info])
        if len(entries) > 100:
            raise ValueError('Bài có quá 100 media.')
        for e in entries:
            direct = e.get('url') or next((f.get('url') for f in reversed(e.get('formats', [])) if f.get('acodec') != 'none' and f.get('vcodec') != 'none'), None)
            media.append({'type': 'video', 'url': direct, 'poster': e.get('thumbnail'), 'ext': e.get('ext', 'mp4'), 'width': e.get('width'), 'height': e.get('height')})
        return {'title': info.get('title', 'Bài viết'), 'caption': info.get('description') or '', 'author': info.get('uploader') or '', 'media': media, 'engine': 'video'}

def main():
    try:
        req = json.load(sys.stdin)
        if req['action'] == 'zip':
            folder = Path(req['folder'])
            with zipfile.ZipFile(str(folder) + '.zip', 'w', zipfile.ZIP_STORED) as z:
                for p in sorted(folder.iterdir()):
                    if p.is_file():
                        z.write(p, p.name)
            result = {'ok': True}
        else:
            result = extract(req['url'], req.get('folder'))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error)[:600]}, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    main()
