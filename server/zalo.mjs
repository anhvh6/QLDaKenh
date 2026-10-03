import { Zalo, ThreadType } from 'zca-js';
import { db, put, get, all, now, uid, audit, saveSecret, secret } from './store.mjs';
import * as domain from './domain.mjs';

const instances = new Map();
const qrSessions = new Map();

export async function createQR(connectionId) {
    const connection = get('connections', connectionId);
    if (!connection) throw new Error('Connection not found');

    const zalo = new Zalo();
    qrSessions.set(connectionId, zalo);

    return new Promise((resolve, reject) => {
        let isResolved = false;
        zalo.loginQR({}, (event) => {
            if (event.type === 0) { // QRCodeGenerated
                if (!isResolved) {
                    isResolved = true;
                    resolve({ image: event.data.image, code: event.data.code });
                }
            } else if (event.type === 2) { // QRCodeScanned
                put('connections', { ...get('connections', connectionId), status: 'scanned', name: event.data.display_name, avatar: event.data.avatar });
            } else if (event.type === 3) { // QRCodeDeclined
                put('connections', { ...get('connections', connectionId), status: 'declined' });
            } else if (event.type === 4) { // GotLoginInfo
                const { cookie, imei, userAgent } = event.data;
                saveSecret(`zalo_session_${connectionId}`, { cookie, imei, userAgent });
                put('connections', { ...get('connections', connectionId), status: 'connected', verifiedAt: now() });
                qrSessions.delete(connectionId);
                
                // Login API
                zalo.login({ cookie, imei, userAgent }).then(api => {
                    setupListener(connectionId, api);
                }).catch(e => console.error('Zalo login error:', e));
            }
        }).catch(e => {
            if (!isResolved) reject(e);
        });
    });
}

export async function recoverSessions() {
    const connections = all('connections').filter(c => c.provider === 'zalo_personal' && c.status === 'connected');
    for (const c of connections) {
        try {
            const sess = secret(`zalo_session_${c.id}`);
            if (sess && sess.cookie) {
                const zalo = new Zalo();
                const api = await zalo.login({ cookie: sess.cookie, imei: sess.imei, userAgent: sess.userAgent });
                setupListener(c.id, api);
                console.log(`Recovered Zalo session for ${c.id}`);
            }
        } catch (e) {
            console.error(`Failed to recover Zalo session for ${c.id}:`, e.message);
            put('connections', { ...c, status: 'error' });
        }
    }
}

function setupListener(connectionId, api) {
    instances.set(connectionId, api);
    
    api.listener.on('message', (message) => {
        try {
            const isPlainText = typeof message.data.content === 'string';
            const externalId = message.msgId || Date.now().toString();
            
            // Check if we already processed this message
            if (db.prepare('SELECT id FROM events WHERE id=?').get(connectionId + externalId)) return;
            
            db.prepare('INSERT INTO events(id, source, received_at, payload) VALUES(?,?,?,?)').run(connectionId + externalId, connectionId, now(), JSON.stringify(message));
            
            const senderId = message.isSelf ? 'self' : message.senderId;
            const threadId = message.threadId; // is the user id or group id

            // We only process plain text for now, but we can extend this
            let text = isPlainText ? message.data.content : '[Attachment/Sticker]';

            // Upsert customer
            let customerId;
            const existingConv = all('conversations').find(x => x.connectionId === connectionId && x.externalUserId === threadId);
            let conv = existingConv;

            db.transaction(() => {
                if (!conv) {
                    const customer = put('customers', { name: `Zalo ${threadId}`, phone: '', tags: [], consent: false, origin: 'zalo' });
                    customerId = customer.id;
                    conv = put('conversations', { customerId, connectionId, externalUserId: threadId, kind: 'message', status: 'open', tags: [], mode: 'api' });
                } else {
                    customerId = conv.customerId;
                }

                const msg = put('messages', {
                    conversationId: conv.id,
                    direction: message.isSelf ? 'outgoing' : 'incoming',
                    text: text,
                    externalId: externalId,
                    status: message.isSelf ? 'sent' : 'received'
                });

                put('conversations', {
                    ...conv,
                    unread: !message.isSelf,
                    status: 'open',
                    lastMessage: text,
                    lastAt: now(),
                    lastInboundAt: message.isSelf ? conv.lastInboundAt : now()
                });

                if (!message.isSelf) {
                    domain.runWorkflows('message_received', msg);
                }
            })();
        } catch (e) {
            console.error('Error processing Zalo message:', e);
        }
    });

    api.listener.on('closed', () => {
        console.warn(`Zalo listener closed for ${connectionId}, will attempt to reconnect`);
    });

    api.listener.on('error', (e) => {
        console.error(`Zalo listener error for ${connectionId}:`, e);
    });

    api.listener.start();
}

export async function sendMessage(connectionId, externalUserId, text) {
    const api = instances.get(connectionId);
    if (!api) throw new Error('Zalo connection not active');
    
    // Zalo API takes threadId (which is externalUserId for 1-1)
    await api.sendMessage({ msg: text }, externalUserId, ThreadType.User);
}
