import importlib.util
import unittest
import io, json, types, sys
from unittest.mock import patch
from contextlib import redirect_stdout
from pathlib import Path

spec = importlib.util.spec_from_file_location('social_copy', Path(__file__).with_name('social-copy.py'))
copy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy)

class FacebookParserTest(unittest.TestCase):
    def fixture(self, count=2):
        return {'__typename':'Story','post_id':'123','actors':[{'name':'Tác giả'}],
                'comet_sections':{'message_container':{'story':{'message':{'text':'💚 Nội dung\n#hashtag'}}}},
                'attachments':[{'styles':{'attachment':{'all_subattachments':{'count':count,'nodes':[
                    {'media':{'__typename':'Photo','id':'one','image':{'uri':'https://cdn.test/small.jpg','width':100,'height':100},'viewer_image':{'uri':'https://cdn.test/one.jpg','width':1200,'height':1600}}},
                    {'media':{'__typename':'Photo','id':'two','viewer_image':{'uri':'https://cdn.test/two.jpg','width':900,'height':1800}}}
                ]}}}}]}
    def test_preserves_caption_order_and_highest_supplied_resolution(self):
        result=copy.facebook_payload([{'data':self.fixture()}], '123')
        self.assertEqual(result['caption'],'💚 Nội dung\n#hashtag')
        self.assertEqual([m['url'] for m in result['media']],['https://cdn.test/one.jpg','https://cdn.test/two.jpg'])
        self.assertEqual(result['author'],'Tác giả')
    def test_does_not_mistake_another_story_for_requested_post(self):
        self.assertIsNone(copy.facebook_payload([self.fixture()], '456'))
    def test_partial_album_is_rejected_instead_of_silently_truncated(self):
        with self.assertRaisesRegex(ValueError,'một phần album'):
            copy.facebook_payload([self.fixture(5)], '123')
    def test_download_stdout_remains_a_single_json_result_when_provider_has_progress(self):
        class Provider:
            def __init__(self, options): self.options=options
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def extract_info(self, url, download):
                if download and not self.options.get('noprogress'):
                    print('[download] 10% ...')
                return {'title':'QA video','description':'💚 #hashtag','url':'https://cdn.test/video.mp4','ext':'mp4'}
        modules={'gallery_dl':types.SimpleNamespace(extractor=None,config=types.SimpleNamespace(set=lambda *args:None)),
                 'yt_dlp':types.SimpleNamespace(YoutubeDL=Provider),
                 'yt_dlp.networking.impersonate':types.SimpleNamespace(ImpersonateTarget=lambda **kwargs:None)}
        out=io.StringIO()
        with patch.dict(sys.modules,modules), patch.object(sys,'stdin',io.StringIO(json.dumps({'action':'extract','url':'https://www.youtube.com/watch?v=qa','folder':'test-target'}))), redirect_stdout(out):
            copy.main()
        result=json.loads(out.getvalue())
        self.assertEqual(result['caption'],'💚 #hashtag')
        self.assertEqual(len(result['media']),1)

if __name__=='__main__': unittest.main()
