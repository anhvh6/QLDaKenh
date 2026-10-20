// Run the installed evondev probe in an authenticated, local-only test workspace.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [url,...args]=process.argv.slice(2),origin=new URL(url||'http://127.0.0.1:4493');
if(!['localhost','127.0.0.1'].includes(origin.hostname))throw Error('UI probe authentication is limited to a local test server.');
if(!process.env.UI_TEST_EMAIL||!process.env.UI_TEST_PASSWORD)throw Error('Set UI_TEST_EMAIL and UI_TEST_PASSWORD for the local fixture.');
const login=await fetch(origin.origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.UI_TEST_EMAIL,password:process.env.UI_TEST_PASSWORD})});
if(!login.ok)throw Error('Local test login failed.');
const token=login.headers.get('set-cookie')?.match(/hub_session=([^;]+)/)?.[1];if(!token)throw Error('Missing test session cookie.');
const require=createRequire(import.meta.url),runtime=process.env.UI_PLAYWRIGHT_DIR||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
const {chromium}=require(resolve(runtime,'node_modules/playwright')),launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{const browser=await launch(options),newContext=browser.newContext.bind(browser);browser.newContext=options=>newContext({...options,storageState:{cookies:[{name:'hub_session',value:token,domain:origin.hostname,path:'/',httpOnly:true,secure:false,sameSite:'Strict',expires:-1}],origins:[]}});return browser;};
const script=resolve('.agents/skills/ui-ux/scripts/probe.mjs');process.argv=[process.execPath,script,url,'--pw',runtime,...args];await import(pathToFileURL(script).href);
