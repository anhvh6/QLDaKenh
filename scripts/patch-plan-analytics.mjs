// Apply this after importing a management UI build; analytics needs the same source data as its dashboard.
import {readFileSync,writeFileSync} from 'node:fs';
const htmlPath='public/plan-ui/index.html',html=readFileSync(htmlPath,'utf8'),asset=html.match(/src="((?:\.\/|\/plan-ui\/)assets\/index-[^"?]+\.js)/)?.[1];
if(!asset)throw Error('Management UI entry not found.');
const file=asset.startsWith('./')?'public/plan-ui/'+asset.slice(2):'public'+asset,before=readFileSync(file,'utf8'),old='["dashboard","management"].includes',updated='["dashboard","management","analytics"].includes';
if(!before.includes(updated)&&before.split(old).length!==2)throw Error('Management data-loading guard changed; review the source before applying.');
writeFileSync(file,before.replace(old,updated));
writeFileSync(htmlPath,html.replace(new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\?[^\"]*)?'),asset+'?v=20261016-analytics-data'));
console.log('Management analytics now loads customers and products on direct entry.');
