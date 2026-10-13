// Loaded only by the isolated HTTP regression test, never by the application.
const realFetch=global.fetch;
global.fetch=(url,options)=>String(url)==='https://oauth2.googleapis.com/token'?Promise.resolve(Response.json({refresh_token:'test-only-http-refresh'})):realFetch(url,options);
