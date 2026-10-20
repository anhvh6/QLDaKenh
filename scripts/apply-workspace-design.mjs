import {readFileSync,writeFileSync} from 'node:fs';
export function applyWorkspaceDesign(file,embedded=false){
 let html=readFileSync(file,'utf8');const href=embedded?'/plan-design.css?v=20261020-contrast-3':'/workspace-design.css?v=20261020-contrast-3';
 html=html.replace(/<link[^>]*href=["'][^"']*(?:workspace-design|plan-design)\.css[^"']*["'][^>]*>\s*/g,'');
 if(embedded)html=html.replace(/<link[^>]*href=["']https:\/\/fonts\.googleapis\.com[^"']*["'][^>]*>\s*/g,'');
 html=html.replace('</head>',`<link rel="stylesheet" href="${href}">\n</head>`);writeFileSync(file,html);
}
