import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
mkdirSync('public/icons',{recursive:true});
try{const page=await browser.newPage();const svg=readFileSync('public/favicon.svg','utf8');
 for(const size of [192,512]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${svg.replace('rx="14"','rx="0"')}`);await page.screenshot({path:`public/icons/app-${size}.png`});}
 await page.setViewportSize({width:96,height:96});await page.setContent(`<style>body{margin:0;background:transparent}svg{width:96px;height:96px;display:block}</style>${svg.replace(/<rect[^>]*\/>/,'').replace(/<circle[^>]*\/>/,'')}`);await page.screenshot({path:'public/icons/badge-96.png',omitBackground:true});
}finally{await browser.close();}
