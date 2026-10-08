import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
const checkout=resolve('integrations/taophacdoT4'),revision=execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim();
if(revision!=='6190d99c2d4be9e40f1a19c53f1441d872e52bd2')throw Error('Review source revision before building the plan preview.');
const target=join(checkout,'omni-preview');mkdirSync(target,{recursive:true});for(const file of ['index.html','main.tsx','services.ts','normalizeCustomer.ts','style.css','vite.config.ts'])writeFileSync(join(target,file),readFileSync(join('integrations/plan-preview',file)));
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','omni-preview/vite.config.ts'],{cwd:checkout,stdio:'inherit',windowsHide:true});
