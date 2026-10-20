import {applyWorkspaceDesign} from './apply-workspace-design.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const checkout=resolve('integrations/taophacdoT4'),source=resolve('integrations/plan-workspace'),target=join(checkout,'omni');
for(const file of ['ProductCatalog.tsx','productService.ts','management.vite.config.ts'])writeFileSync(join(target,file),readFileSync(join(source,file)));
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','omni/management.vite.config.ts'],{cwd:checkout,stdio:'inherit',windowsHide:true});
const html='public/plan-ui/index.html';writeFileSync(html,readFileSync(html,'utf8').replace(/\r\n?/g,'\n').replace('</head>','<script type="module" src="./overview-entry.js"></script></head>'));

applyWorkspaceDesign('public/plan-ui/index.html',true);
