import {readFileSync,writeFileSync} from 'node:fs';

const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=s=>escape(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/https:\/\/[^\s<]+/g,url=>`<a href="${url.replace(/[.,;]$/,'')}">${url.replace(/[.,;]$/,'')}</a>`);
const pages=[['dieu-khoan-su-dung','terms','Điều khoản sử dụng'],['chinh-sach-rieng-tu','privacy','Chính sách riêng tư']];
for(const [source,slug,title] of pages){
 const md=readFileSync(`docs/legal-drafts/${source}.md`,'utf8');
 const paragraphs=md.split(/\r?\n\s*\r?\n/).slice(2);
 const content=paragraphs.map(p=>p.startsWith('## ')?`<h2>${inline(p.slice(3))}</h2>`:p.startsWith('- ')?`<ul>${p.split(/\r?\n/).map(l=>`<li>${inline(l.slice(2))}</li>`).join('')}</ul>`:`<p>${inline(p.replace(/\r?\n/g,' '))}</p>`).join('\n');
 writeFileSync(`public/${slug}.html`,`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${title} của MeGa Phương Social & Care"><title>${title} · MeGa Phương</title><link rel="stylesheet" href="/legal.css"></head>
<body><header><a href="/">MeGa Phương <span>Social & Care</span></a><nav aria-label="Thông tin dịch vụ"><a href="/terms.html" ${slug==='terms'?'aria-current="page"':''}>Điều khoản sử dụng</a><a href="/privacy.html" ${slug==='privacy'?'aria-current="page"':''}>Chính sách riêng tư</a></nav></header><main><p class="eyebrow">THÔNG TIN DỊCH VỤ</p><h1>${title}</h1><p class="effective">Có hiệu lực từ 21/10/2026 · Phiên bản 1.0</p>${content}</main><footer>Hộ kinh doanh Me Ga Phương · <a href="mailto:Anhvh6@gmail.com">Anhvh6@gmail.com</a><br><a href="/">Về hệ thống</a></footer></body></html>\n`);
}
console.log('Built public/terms.html and public/privacy.html');
