import {secret} from './store.mjs';
export function metaChatIdentities(channel){return new Set([channel.accountId,...(channel.provider==='instagram'?[secret(channel.id).pageId]:[])].filter(Boolean).map(String));}
export function metaConversationAccount(channel){return channel.provider==='instagram'?String(secret(channel.id).pageId||channel.accountId):String(channel.accountId);}
