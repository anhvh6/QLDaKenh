const {existsSync}=require('node:fs');
const {join}=require('node:path');
const {spawn}=require('node:child_process');

const major=(binary)=>{
 try{return Number(require('node:child_process').execFileSync(binary,['--version'],{encoding:'utf8',windowsHide:true}).trim().match(/^v(\d+)/)?.[1]||0);}
 catch{return 0;}
};

const bundled=process.env.USERPROFILE&&join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','bin','node.exe');
const candidates=[process.env.NODE24_PATH,process.execPath,bundled].filter(Boolean);
const binary=candidates.find(path=>existsSync(path)&&major(path)>=24);

if(!binary){
 console.error('Ứng dụng cần Node.js 24 trở lên vì sử dụng node:sqlite.');
 console.error('Cài Node.js 24 hoặc đặt NODE24_PATH tới file node.exe phù hợp.');
 process.exit(1);
}

const child=spawn(binary,['--env-file-if-exists=.env',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exit(1);});
child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??1);});
