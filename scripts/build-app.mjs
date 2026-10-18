import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
if(process.argv.includes('--check')){
 const manifest=JSON.parse(readFileSync('public/app.bundle.meta.json','utf8'));
 for(const [file,expected] of Object.entries(manifest.files))if(hash(readFileSync(file))!==expected)throw Error('Frontend bundle is stale: '+file+'. Run npm run build:app.');
 if(!readFileSync('public/index.html','utf8').includes('/app.bundle.js?v='+manifest.version))throw Error('Frontend entry version is stale.');
 console.log('Frontend bundle matches source.');process.exit();
}
let esbuild;try{esbuild=require('esbuild');}catch{esbuild=require('../integrations/taophacdoT4/node_modules/esbuild');}
// Keep source modules editable while shipping one request instead of a long import waterfall.
const result=await esbuild.build({entryPoints:['public/app.js'],outfile:'public/app.bundle.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,metafile:true,logLevel:'warning'});
const bytes=readFileSync('public/app.bundle.js'),version=createHash('sha256').update(bytes).digest('hex').slice(0,12),file='public/index.html';
writeFileSync(file,readFileSync(file,'utf8').replace(/src="\/app(?:\.bundle)?\.js\?v=[^"]+"/,`src="/app.bundle.js?v=${version}"`));
writeFileSync('public/app.bundle.meta.json',JSON.stringify({version,compiler:esbuild.version,files:Object.fromEntries([...Object.keys(result.metafile.inputs),'public/app.bundle.js'].map(file=>[file,hash(readFileSync(file))]))},null,2)+'\n');
console.log(JSON.stringify({modules:Object.keys(result.metafile.inputs).length,bytes:bytes.length,version}));
