import {planProducts} from './product-catalog.mjs';
import {updateConversationTags} from './conversation-tag-update.mjs';
import {commentPresentation} from './comment-presentation.mjs';
import {trackingNotificationTick,recoverTrackingNotifications} from './order-tracking-notifications.mjs';
import {backfillCopyHistory} from './copy-history.mjs';
import {serveFrontendFile} from './frontend-files.mjs';
import {dashboardMessages} from './dashboard-state.mjs';
import {communicationRoute,communicationTick,recoverCommunication} from './communication-campaigns.mjs';
import {orderEditorRoute} from './order-editor.mjs';
import {orderWorkspaceState,saveOrderWorkspace,orderPOSFields} from './order-workspace.mjs';
import {orderRoutingState,saveOrderRouting} from './order-routing.mjs';
import {createSystemMonitor} from './system-metrics.mjs';
import {posRoute,posState,posTick,recoverPosJobs,receivePosWebhook} from './pancake-pos.mjs';
import {automationRoute,automationTick,recoverAutomation} from './copy-automation.mjs';
import {commentsRoute,commentsTick} from './comments.mjs';
import { ingestFacebookEvents, facebookChatTick } from './facebook-chat.mjs';
import { publicationPreflight } from './publish-preflight.mjs';
import { resumePurges } from './customer-purge.mjs';
import { completeDriveOAuth } from './drive-oauth.mjs';
import { copyRoute, copyArchive, copyPreviewMedia, publicCopyMedia, scheduleCopied, recoverCopyJobs, copyTick } from './social-copy.mjs';
import { parseZaloContent } from './zalo-message-content.mjs';
import { isTypeCode } from '../public/chat-media-content.js';
import { quickReplyRoute } from './quick-replies.mjs';
import { refreshLearnerStatuses } from './learner-status-sync.mjs';
import { consultationTick } from './consultation-review.mjs';
import { reminderTick, customerReminderTick, recoverCustomerReminders } from './chat-reminders.mjs';
import { shippingRoute, shippingState, receiveVtpWebhook, carrierOrdersState, importVtpOrder } from './shipping.mjs';
import { interactionRoute } from './chat-interactions.mjs';
import { pushRoute, pushTick } from './web-push.mjs';
import { contextRoute } from './customer-context.mjs';
import { filterDeletedChats } from './chat-delete.mjs';
import { learnerRoute } from './learner-profile.mjs';
import { studyPlanStatus } from './plan-access.mjs';
import { botRoute, botTick, botState, recoverBotJobs } from './chatbot.mjs';
import { mediaRoute } from './media.mjs';
import { mediaUsage } from './media-usage.mjs';
import { defaultNameSettings } from '../public/chat-names.js';
import { chatRoute } from './chat.mjs';
import http from 'node:http';
import { sendJSON } from './http-json.mjs';
import { StateCache } from './state-cache.mjs';
import { readFileSync, createReadStream, createWriteStream, existsSync, statSync, unlinkSync, readdirSync, renameSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve, extname, basename, sep } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Readable } from 'node:stream';
import { backup } from 'node:sqlite';
import { db, dataDir, all, get, put, transaction, now, uid, audit, secret, saveSecret, notification, stateRevision } from './store.mjs';
import { seed } from './seed.mjs';
import * as domain from './domain.mjs';
import { filterDisconnectedChats } from '../public/chat-connection-state.js';
import { studentCareRoute, scopeCareChats, assertCareConversation, filterCareNotifications } from './student-care.mjs';
import { planRoute, syncPlanHandoff } from './plan-bridge.mjs';
import * as care from './taophacdo.mjs';
import { supabaseRoute, integrationState } from './supabase.mjs';
care.migrateLocal();
backfillCopyHistory();
for (const run of all('template_runs').filter(r => ['sending', 'pending'].includes(r.status))) put('template_runs', { ...run, status: run.status === 'sending' ? 'unknown' : 'failed', error: run.status === 'sending' ? 'Máy chủ khởi động lại khi đang gửi. Kiểm tra trên kênh trước khi gửi lại.' : 'Chuỗi bị gián đoạn; có thể tiếp tục phần chưa gửi.' });
import { providers, testConnection, aiDraft, ghn } from './connectors.mjs';
import * as zalo from './zalo.mjs';
import { startOAuth, finishOAuth, oauthConfiguration } from './oauth.mjs';
import { publicMediaFile } from './public-media.mjs';

zalo.recoverSessions();

const port = Number(process.env.PORT || 4317); const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1'); const publicDir = resolve('public');
const hashPassword = (p, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(p, salt, 64).toString('hex')}`;
const verify = (p, hash) => { const [salt, h] = hash.split(':'); return timingSafeEqual(Buffer.from(hashPassword(p, salt).split(':')[1], 'hex'), Buffer.from(h, 'hex')); };
const sha = s => createHash('sha256').update(s).digest('hex');
const json = sendJSON;
const stateCache = new StateCache();
const notificationCache = new StateCache();
async function body(req, limit = 2e6) { let n = 0; const chunks = []; for await (const b of req) { n += b.length; if (n > limit) domain.fail('Dữ liệu quá lớn.', 413); chunks.push(b); } const raw = Buffer.concat(chunks); try { return { raw, value: raw.length ? JSON.parse(raw) : {} }; } catch { domain.fail('JSON không hợp lệ.'); } }
function userFor(req) { const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('hub_session='))?.slice(12); if (!token) return null; const s = db.prepare('SELECT u.id,u.email,u.name,u.role,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1').get(sha(token), Date.now()); return s || null; }
function login(res, user) { const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), user.id, csrf, Date.now() + 7 * 86400000); res.setHeader('Set-Cookie', `hub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`); return { ...user, csrf, password: undefined }; }
const throttles = new Map(); const busy = new Set();
function checkOrigin(req) { if (req.headers['sec-fetch-site'] === 'cross-site') domain.fail('Yêu cầu khác nguồn bị chặn.', 403); if (req.headers.origin) { const origin = new URL(req.headers.origin); if (origin.host !== req.headers.host && origin.host !== req.headers['x-forwarded-host']) domain.fail('Nguồn yêu cầu không hợp lệ.', 403); } }
const generic = /^\/api\/records\/([a-z]+)(?:\/([^/]+))?$/;
async function dispatch(req, res, url, user, input) {
  const path = url.pathname; const method = req.method;
  const communication=await communicationRoute(path,method,input,user);if(communication!==undefined)return communication;
  const editedOrder=orderEditorRoute(path,method,input,user);if(editedOrder!==undefined)return editedOrder;
  if(path==='/api/orders/workspace'&&method==='GET')return orderWorkspaceState(user);
  if(path==='/api/orders/workspace'&&method==='PUT')return saveOrderWorkspace(user,input);
  const pos=await posRoute(path,method,input,user,url);if(pos!==undefined)return pos;
  const comments=await commentsRoute(path,method,input,user);if(comments!==undefined)return comments;
  const automation=await automationRoute(path,method,input,user);if(automation!==undefined)return automation;
  const copy = await copyRoute(path, method, input, user, url); if (copy !== undefined) return copy;
  const careConversation = path.match(/^\/api\/(?:chat\/|care\/|chatbot\/)?conversations\/([^/]+)/);
  const careMessage = path.match(/^\/api\/chat\/messages\/([^/]+)/);
  const guardedConversation = careConversation ? get('conversations', careConversation[1]) : careMessage ? (get('messages', careMessage[1])?.conversationId ? get('conversations', get('messages', careMessage[1]).conversationId) : null) : input.conversationId ? get('conversations', input.conversationId) : null;
  if (guardedConversation && !(path === '/api/chat/student-care-exceptions' && user.role === 'owner')) assertCareConversation(user, guardedConversation);
  const studentCare = await studentCareRoute(path, method, input, user); if (studentCare !== undefined) return studentCare;
  const quickReply = await quickReplyRoute(path, method, input, user); if (quickReply !== undefined) return quickReply;
  const shipping = await shippingRoute(path, method, input, user); if (shipping !== undefined) return shipping;
  const interaction = await interactionRoute(path, method, input, user); if (interaction !== undefined) return interaction;
  const pushResult = await pushRoute(path, method, input, user); if (pushResult !== undefined) return pushResult;
  const botResult = await botRoute(path, method, input, user); if (botResult !== undefined) return botResult;
  const mediaResult = await mediaRoute(path, method, input, user); if (mediaResult !== undefined) return mediaResult;
  const planResult = await planRoute(path, method, input, user, url); if (planResult !== undefined) return planResult;
  const integrated = await supabaseRoute(path, method, input, user); if (integrated !== undefined) return integrated;
  const chatResult = await chatRoute(path, method, input, user, url); if (chatResult !== undefined) return chatResult;
  const contextResult = contextRoute(path, method, input, user); if (contextResult !== undefined) return contextResult;
  const learnerResult = await learnerRoute(path, method, input, user); if (learnerResult !== undefined) return learnerResult;
  const careResult = await care.careRoute(path, method, input, user); if (careResult !== undefined) return careResult;
  // Enforce team/customer scope on object routes, including writes by guessed IDs.
  const object = path.match(/^\/api\/(conversations|contents|publications|orders|shipments|customers)\/([^/]+)/);
  if (object) { const r = get(object[1], object[2]); if (r) { if (r.connectionId) care.assertChannel(user, r.connectionId); if (r.customerId) care.assertCustomer(user, r.customerId); if (object[1] === 'customers') care.assertCustomer(user, r.id); if (r.channels) for (const id of r.channels) care.assertChannel(user, id); if (r.orderId) { const o = get('orders', r.orderId); if (o) care.assertCustomer(user, o.customerId); } } }
  if (input.customerId) care.assertCustomer(user, input.customerId);
  if (input.conversationId) { const c = get('conversations', input.conversationId); if (c) care.assertChannel(user, c.connectionId); }
  if (input.channels) for (const id of input.channels) care.assertChannel(user, id);
  if (input.source && path === '/api/customers/merge') { care.assertCustomer(user, input.source); care.assertCustomer(user, input.target); }
  const genericObject = path.match(/^\/api\/records\/(customers|contents)\/([^/]+)$/); if (genericObject) { const r = get(genericObject[1], genericObject[2]); if (r) { if (genericObject[1] === 'customers') care.assertCustomer(user, r.id); else for (const id of r.channels || []) care.assertChannel(user, id); } }

  if (path === '/api/state' && method === 'GET') {
    const snapshotView=['dashboard','inbox','workspace'].includes(url.searchParams.get('view'))?url.searchParams.get('view'):'full';
    const users = db.prepare('SELECT id,name,email,role,active FROM users').all();
    const revision = createHash('sha256').update(stateRevision() + ':' + JSON.stringify(users) + ':' + user.id + ':' + user.role + ':' + snapshotView).digest('hex'), cacheKey = user.id + ':' + user.role + ':' + snapshotView;
    if (url.searchParams.get('since') === revision) return { unchanged: true, snapshotRevision: revision };
    const cached = stateCache.get(cacheKey, revision); if (cached) return { ...cached, user };
    void refreshLearnerStatuses();
    const state = { user, reminderDefaults: get('settings','chat-reminder-defaults-'+user.id) || null, chatFilters: get('settings','chat-filter-'+user.id)?.filters || null, providers, oauthConfiguration: oauthConfiguration(req), snapshotRevision: revision, snapshotView }; for (const k of [...domain.kinds, ...care.extraKinds]) { if (['settings'].includes(k)) continue; state[k] = k==='messages'&&snapshotView!=='full'?(snapshotView==='dashboard'?dashboardMessages():[]):all(k); }
    state.copyPlanCalendar=all('copy_plan_items').filter(i=>i.userId===user.id&&i.scheduleAt&&['scheduled','preparing','ready','publishing','published','failed','unknown'].includes(i.state)).map(i=>({id:i.id,updatedAt:i.updatedAt,planId:i.planId,channels:i.channels||get('copy_plans',i.planId)?.channels||[],scheduleAt:i.scheduleAt,state:i.state,title:get('copy_videos',i.videoId)?.title||'Video',planName:get('copy_plans',i.planId)?.name||'',campaignId:get('copy_plans',i.planId)?.campaignId}));state.copyPlanSummaries=all('copy_plans').filter(p=>p.userId===user.id).map(p=>({id:p.id,name:p.name,campaignId:p.campaignId,status:p.status,mode:p.mode}));
    state.contents=state.contents.map(c=>c.sourceCopyId&&!c.copyReady?{...c,sourceMediaTypes:[...new Set((get('copy_posts',c.sourceCopyId)?.media||[]).map(m=>m.type))]}:c);
    const learnerFacts = new Map(all('learner_source_facts').map(f => [f.id, f])); state.customers = state.customers.map(c => { const f = learnerFacts.get(c.id); if (!f) return c; const { id, version, createdAt, updatedAt, sourceUpdatedAt, ...fields } = f; return { ...c, ...fields }; });
    state.messages = state.messages.map(m => { if (!m.quoteSource || !isTypeCode(m.text) && !/video|voice|audio/i.test(m.messageType || '')) return m; const content = parseZaloContent(m.quoteSource); return { ...m, ...content, attachments: content.attachments?.length ? content.attachments : m.attachments || [] }; }); state.conversations = state.conversations.map(c => isTypeCode(c.lastMessage) ? { ...c, lastMessage: /video/i.test(c.lastMessage) ? 'Video' : /voice|audio/i.test(c.lastMessage) ? 'Tin nhắn thoại' : /photo|image/i.test(c.lastMessage) ? 'Ảnh' : 'Tệp đính kèm' } : c);
    filterDeletedChats(state);
    Object.assign(state, botState(user, state));
    filterDisconnectedChats(state);
    state.conversations=commentPresentation(state.conversations);
    state.mediaCategories = all('media_categories'); state.mediaFavorites = get('settings', 'media-favorites-' + user.id)?.ids || []; const assetUsage = mediaUsage(state.assets, state.messages, state.publications); state.assets = state.assets.map(a => ({ ...a, usage: assetUsage.get(a.id) }));
    state.chatNameSettings = get('settings', 'chat-names') || defaultNameSettings;
    state.chatPlanSummaries = all('study_plans').filter(p=>!p.registrationOnly||p.customer?.video_date||p.customer?.is_customized).map(p => { const o = get('orders', p.lastOrderId); return { customerId: p.customerId, startDate: p.customer?.start_date, endDate: p.customer?.end_date, link: p.customer?.link, status: studyPlanStatus(p, o) }; });
    state.savedPlanSummaries = all('study_plans').filter(p=>!p.registrationOnly||p.customer?.video_date||p.customer?.is_customized).map(p => ({ id: p.id, customerId: p.customerId, handoffId: p.handoffId || 'draft:' + p.customerId, name: p.customer?.customer_name || get('customers', p.customerId)?.name || 'Học viên', phone: p.customer?.sdt || '', startDate: p.customer?.start_date, endDate: p.customer?.end_date, durationDays: p.customer?.duration_days || 0, group: p.customer?.ma_vd || '', amount: Number(p.customer?.gia_tien || 0), updatedAt: p.updatedAt, version: p.version, status: studyPlanStatus(p, get('orders', p.lastOrderId)) })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    state.studentCareSettings = get('settings', 'student-care') || { version: 0, stages: {} };
    state.settings = get('settings', 'general') || { id: 'general', name: 'Mộc Workspace', timezone: 'Asia/Ho_Chi_Minh' };
    if (user.role !== 'owner') state.connections = state.connections.map(({ accountId, apiVersion, ...c }) => c);
    state.orderWorkspace=orderWorkspaceState(user);state.orders=orderPOSFields(state.orders);state.orderRouting=orderRoutingState();state.pancakePOS=posState(user);state.carrierOrders = carrierOrdersState(user); state.shippingAccounts = shippingState(user); state.integrations = { ai: !!secret('ai').token, aiModel: secret('ai').model || '', ghn: !!secret('shipping').token };
    state.users = users; state.careSettings = get('settings', 'care') || { slaMinutes: 3 }; state.taophacdo = user.role === 'owner' ? integrationState(user) : null; const scoped=scopeCareChats(care.scopeState(state,user),user);if(snapshotView==='workspace'){const ids=new Set(scoped.conversations.map(c=>c.id));scoped.messageSummaries=dashboardMessages().filter(m=>ids.has(m.conversationId));}return stateCache.set(cacheKey,revision,scoped);
  }
  if(path==='/api/order-routing'&&method==='POST')return saveOrderRouting(user,input);
  if(path==='/api/system/metrics'&&method==='GET'){if(!['owner','manager'].includes(user.role))domain.fail('Chỉ quản trị được xem chỉ số hệ thống.',403);return systemMonitor.snapshot();}
  if (path === '/api/logout' && method === 'POST') { db.prepare('DELETE FROM sessions WHERE user_id=? AND csrf=?').run(user.id, user.csrf); res.setHeader('Set-Cookie', 'hub_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return { ok: true }; }
  if(path==='/api/product-catalog'&&method==='GET'){domain.permission(user,'read');res.setHeader('Cache-Control','no-store');return planProducts(all('products'),{includeInactive:true});}
  if(path==='/api/proxy/supabase/rest/v1/products'){
    domain.permission(user,'read');
    if(!['GET','HEAD'].includes(method))domain.fail('Danh mục dùng chung với Sản phẩm. Thêm, sửa hoặc ngừng bán tại mục Sản phẩm.',409);
    res.setHeader('Cache-Control','no-store');
    return planProducts(all('products'),{includeInactive:true}).sort((a,b)=>a.ten_sp.localeCompare(b.ten_sp,'vi'));
  }
  if (path.startsWith('/api/proxy/supabase/')) {
    const targetUrl = 'https://aqtnzvqyljweppklblni.supabase.co' + req.url.substring('/api/proxy/supabase'.length);
    const sKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxdG56dnF5bGp3ZXBwa2xibG5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDg1MDc0NiwiZXhwIjoyMTA2NDI2NzQ2fQ.ccwHd3CyqQcFii9UKT0iKPGOUcw7AA467B4L2zhvee0';
    const opts = { method: req.method, headers: { 'apikey': sKey, 'Authorization': 'Bearer ' + sKey, 'Content-Type': req.headers['content-type'] || 'application/json', 'Prefer': req.headers['prefer'] || '' } };
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) { if (Object.keys(input).length) opts.body = JSON.stringify(input); }
    const r = await fetch(targetUrl, opts);
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
    const ab = await r.arrayBuffer();
    res.end(Buffer.from(ab));
    return;
  }
  if (path === '/api/users' && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const email = domain.required(input.email, 'Email', 200).toLowerCase(); if (!['manager', 'editor', 'support', 'warehouse', 'viewer'].includes(input.role)) domain.fail('Vai trò không hợp lệ.'); if ((input.password || '').length < 10) domain.fail('Mật khẩu cần ít nhất 10 ký tự.'); try { const id = uid('user'); db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(id, email, domain.required(input.name, 'Tên', 150), input.role, hashPassword(input.password)); audit(user.id, 'user_created', id); return { id }; } catch (e) { if (e.code?.startsWith('ERR_SQLITE')) domain.fail('Email đã tồn tại.'); throw e; } }
  if (path.match(/^\/api\/users\/[^/]+$/) && method === 'PATCH') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const id = path.split('/').pop(); if (id === user.id) domain.fail('Không thể khóa tài khoản đang sử dụng.'); db.prepare('UPDATE users SET active=? WHERE id=? AND role!=?').run(input.active ? 1 : 0, id, 'owner'); db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); return { ok: true }; }
  if (path === '/api/password' && method === 'POST') { const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.id); if (!verify(input.current || '', u.password)) domain.fail('Mật khẩu hiện tại không đúng.'); if ((input.password || '').length < 10) domain.fail('Mật khẩu mới cần ít nhất 10 ký tự.'); db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(input.password), user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); return { ok: true }; }
  const match = path.match(generic); if (match) { const [, kind, id] = match; if (method === 'POST' && !id) return domain.editRecord(user, kind, null, input); if (method === 'PATCH' && id) return domain.editRecord(user, kind, id, input); if (method === 'DELETE' && id) return domain.deleteRecord(user, kind, id, input); }
  if (path.match(/^\/api\/contents\/[^/]+\/preflight$/) && method === 'POST') { domain.permission(user, 'content'); const content = get('contents', path.split('/')[3]); if (!content) domain.fail('Không tìm thấy nội dung.', 404); if (input.version !== content.version) domain.fail('Nội dung đã thay đổi. Mở lại trước khi đăng.', 409); return publicationPreflight(user, content, input); }
  if (path.match(/^\/api\/contents\/[^/]+\/schedule$/) && method === 'POST') return scheduleCopied(user, path.split('/')[3], {...input,reviewWarnings:true});
  if (path.match(/^\/api\/contents\/[^/]+\/update-published$/) && method === 'POST') return domain.updatePublishedContent(user, path.split('/')[3]);
  if (path.match(/^\/api\/publications\/[^/]+\/action$/) && method === 'POST') return domain.publicationAction(user, path.split('/')[3], input);
  if (path === '/api/orders' && method === 'POST') return domain.createOrder(user, input);
  if (path.match(/^\/api\/orders\/[^/]+\/action$/) && method === 'POST') return domain.orderAction(user, decodeURIComponent(path.split('/')[3]), input);
  if (path.match(/^\/api\/orders\/[^/]+\/shipments$/) && method === 'POST') return domain.createShipment(user, path.split('/')[3], input);
  if (path.match(/^\/api\/shipments\/[^/]+\/action$/) && method === 'POST') return domain.shipmentAction(user, path.split('/')[3], input);
  if (path === '/api/shipping/quote' && method === 'POST') { domain.permission(user, 'shipping'); const o = get('orders', input.orderId); if (!o) domain.fail('Không tìm thấy đơn.'); return ghn('v2/shipping-order/fee', { service_type_id: 2, to_district_id: domain.number(input.toDistrict, 'Mã quận/huyện', 1), to_ward_code: domain.required(input.toWard, 'Mã phường/xã', 100), weight: o.items.reduce((s, i) => s + (get('products', i.productId).weight || 500) * i.quantity, 0), insurance_value: o.subtotal, length: 20, width: 15, height: 10 }); }
  if (path.match(/^\/api\/conversations\/[^/]+\/messages$/) && method === 'POST') return domain.reply(user, path.split('/')[3], input);
  if (path.match(/^\/api\/messages\/[^/]+\/react$/) && method === 'POST') return domain.reactMessage(user, path.split('/')[3], input);
  if (path.match(/^\/api\/messages\/[^/]+$/) && method === 'DELETE') return domain.deleteCommentMessage(user, path.split('/')[3]);
  if (path === '/api/conversations/demo' && method === 'POST') return domain.ingestDemo(user, input);
  const tagUpdate=path.match(/^\/api\/conversations\/([^/]+)\/tags$/);if(tagUpdate&&method==='POST')return updateConversationTags(user,tagUpdate[1],input.changes);
  if (path.match(/^\/api\/conversations\/[^/]+$/) && method === 'PATCH') { domain.permission(user, 'inbox'); const c = get('conversations', path.split('/')[3]); if (!c || c.deletedAt) domain.fail('Không tìm thấy.', 404); if (input.status && !['open', 'pending', 'resolved'].includes(input.status)) domain.fail('Trạng thái không hợp lệ.'); const p = { ...c }; care.assertChannel(user, c.connectionId); for (const key of ['status', 'assignee', 'unread', 'tags']) if (input[key] !== undefined) p[key] = input[key]; return put('conversations', p, input.version); }
  if (path.match(/^\/api\/connections\/[^/]+\/test$/) && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const c = get('connections', path.split('/')[3]); if (!c) domain.fail('Không tìm thấy kênh.', 404); if (c.mode !== 'api') domain.fail('Kênh này không ở chế độ API.'); const r = await testConnection(c); put('connections', { ...c, status: 'connected', verifiedAt: now(), remoteName: r.name || r.username || r.data?.name || c.name }); return { ok: true, message: 'Token đọc được thông tin tài khoản. Quyền xuất bản/nhắn tin vẫn được API kiểm tra ở từng thao tác.' }; }
  if (path.match(/^\/api\/connections\/[^/]+\/oauth\/start$/) && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const c = get('connections', path.split('/')[3]); if (!c) domain.fail('Không tìm thấy kênh.', 404); return startOAuth(user, c, req); }
  if (path.match(/^\/api\/connections\/[^/]+\/zalo-qr$/) && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); return await zalo.createQR(path.split('/')[3]); }
  if (path.match(/^\/api\/connections\/[^/]+\/sync-zalo$/) && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền.', 403); return await zalo.forceSync(path.split('/')[3], { older: input.older === true }); }
  if (path.match(/^\/api\/connections\/[^/]+\/disconnect-zalo$/) && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền.', 403); return await zalo.disconnect(path.split('/')[3]); }
  if (path === '/api/integrations' && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); if (!['ai', 'shipping'].includes(input.type)) domain.fail('Loại tích hợp không hợp lệ.'); const old = secret(input.type); saveSecret(input.type, { ...old, ...(input.token ? { token: input.token } : {}), ...(input.model ? { model: input.model } : {}), ...(input.shopId ? { shopId: input.shopId } : {}) }); audit(user.id, 'integration_configured', input.type); return { ok: true }; }
  if (path === '/api/ai/draft' && method === 'POST') {
    domain.permission(user, input.kind === 'content' ? 'content' : 'inbox'); const usage = all('tasks').filter(x => x.type === 'ai_usage' && x.createdAt.slice(0, 10) === now().slice(0, 10)); if (usage.length >= 50) domain.fail('Đã đạt giới hạn 50 yêu cầu AI/ngày của bản localhost.');
    let context = ''; if (input.conversationId) { const c = get('conversations', input.conversationId); if (!c) domain.fail('Không tìm thấy hội thoại.'); const p = c.productId ? get('products', c.productId) : null; context = JSON.stringify({ messages: all('messages').filter(m => m.conversationId === c.id).slice(0, 12).map(m => ({ text: m.text, direction: m.direction })), product: p ? { name: p.name, price: p.price, available: p.stock - p.reserved, description: p.description } : null }); }
    const prompt = `Nhiệm vụ: ${domain.required(input.prompt, 'Yêu cầu', 5000)}\nNgữ cảnh: ${context}\nNguồn tri thức nội bộ: ${all('knowledge').map(k => k.title + '\n' + k.body).join('\n').slice(0, 18000)}`; put('tasks', { type: 'ai_usage', name: 'Yêu cầu AI', status: 'done', actor: user.id }); return { text: await aiDraft(prompt) };
  }
  if (path === '/api/customers/merge' && method === 'POST') { domain.permission(user, 'customers'); if (input.source === input.target) domain.fail('Chọn hai khách khác nhau.'); return transaction(() => { const s = get('customers', input.source), t = get('customers', input.target); if (!s || !t) domain.fail('Không tìm thấy khách.'); if (s.origin === 'taophacdo' || t.origin === 'taophacdo') domain.fail('Hồ sơ taophacdo phải gộp tại hệ thống gốc để giữ liên kết phác đồ và thiết bị.'); if (s.mergedInto || t.mergedInto) domain.fail('Khách đã được gộp.'); for (const k of ['conversations', 'orders', 'identities', 'enrollments', 'journey_events']) for (const r of all(k).filter(x => x.customerId === s.id)) put(k, { ...r, customerId: t.id }); put('customers', { ...s, mergedInto: t.id }); audit(user.id, 'customer_merged', t.id, { source: s, target: t }); return put('customers', { ...t, tags: [...new Set([...(t.tags || []), ...(s.tags || [])])] }); }); }
  if (path === '/api/workflows/test' && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const w = get('workflows', input.id); if (!w) domain.fail('Không tìm thấy quy tắc.'); return { matched: !w.keyword || String(input.text || '').toLowerCase().includes(w.keyword.toLowerCase()), action: w.action, value: w.value, executed: false }; }
  if (path === '/api/notifications' && method === 'GET') {
    const key = user.id + ':' + user.role, sourceRevision = stateRevision();
    let snapshot = notificationCache.get(key, sourceRevision);
    if (!snapshot) { const rows = filterCareNotifications(all('notifications'), user); snapshot = notificationCache.set(key, sourceRevision, { rows, revision: createHash('sha256').update(key + JSON.stringify(rows)).digest('hex') }); }
    if (url.searchParams.get('since') === snapshot.revision) return { unchanged: true, revision: snapshot.revision };
    return url.searchParams.has('since') ? snapshot : snapshot.rows;
  }
  if (path === '/api/notifications/read' && method === 'POST') { transaction(() => { for (const n of filterCareNotifications(all('notifications'), user).filter(n => !n.read)) put('notifications', { ...n, read: true }); }); return { ok: true }; }
  if (path === '/api/audit' && method === 'GET') { if (!['owner', 'manager'].includes(user.role)) domain.fail('Cần quyền quản lý.', 403); return db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 300').all(); }
  if (path === '/api/backup' && method === 'POST') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const name = `hub-${now().replace(/[:.]/g, '-')}.sqlite`; await backup(db, join(dataDir, 'backups', name)); audit(user.id, 'backup', name); return { name, note: 'Bản sao database trong data/backups. Để khôi phục đầy đủ, giữ cả uploads và encryption.key.' }; }
  if (path === '/api/export' && method === 'GET') { if (user.role !== 'owner') domain.fail('Cần quyền chủ hệ thống.', 403); const data = { exportedAt: now(), version: 1 }; for (const k of [...domain.kinds, ...care.extraKinds,'copy_sources','copy_videos','copy_plans','copy_plan_items','copy_plan_events']) data[k] = all(k); res.setHeader('Content-Disposition', 'attachment; filename="moc-export.json"'); audit(user.id, 'export'); return data; }
  if (path === '/api/import/customers' && method === 'POST') { domain.permission(user, 'customers'); if (!Array.isArray(input.rows) || input.rows.length > 1000) domain.fail('Tối đa 1.000 khách/lần.'); const result = []; for (const row of input.rows) { try { if (row.phone && all('customers').some(c => c.phone === row.phone)) throw new Error('Số điện thoại đã tồn tại.'); result.push({ ok: true, id: domain.editRecord(user, 'customers', null, { ...row, consent: false }).id }); } catch (e) { result.push({ ok: false, error: e.message }); } } return result; }
  domain.fail('Không tìm thấy API.', 404);
}

async function webhook(req, res, url) {
  const routeId = url.pathname.split('/').pop(); const channels = routeId === 'meta' ? all('connections').filter(c => ['facebook', 'instagram'].includes(c.provider) && c.mode === 'api') : [get('connections', routeId)].filter(c => ['facebook', 'instagram'].includes(c?.provider)); if (!channels.length) domain.fail('Webhook không tồn tại.', 404);
  const verifyTokens = [process.env.META_WEBHOOK_VERIFY_TOKEN, secret('meta-webhook').verifyToken, ...channels.map(c => secret(c.id).verifyToken)].filter(Boolean);
  if (req.method === 'GET') { if (verifyTokens.includes(url.searchParams.get('hub.verify_token'))) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(url.searchParams.get('hub.challenge') || ''); return; } domain.fail('Verify token không hợp lệ.', 403); }
  const { raw, value } = await body(req); const signature = req.headers['x-hub-signature-256'] || ''; const appSecrets = [...new Set([process.env.META_APP_SECRET, ...channels.map(c => secret(c.id).appSecret)].filter(Boolean))]; if (!appSecrets.length) domain.fail('Chưa có META_APP_SECRET.', 403); const validSignature = appSecrets.some(appSecret => { const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex'); return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }); if (!validSignature) domain.fail('Chữ ký không hợp lệ.', 403);
  for(const c of channels)put('facebook_webhook_status',{id:c.id,lastReceivedAt:now(),eventCount:(value.entry||[]).reduce((n,e)=>n+(e.messaging||[]).length+(e.changes||[]).length,0)});
  transaction(() => {
    for (const c of channels) {
      if(['facebook','instagram'].includes(c.provider))ingestFacebookEvents(c, value.entry);care.ingestComments(c, value.entry);
    }
  }); for (const c of channels.filter(c=>c.provider==='facebook')) void care.hydrateCommentAuthors(c, 10).catch(() => { }); json(res, { ok: true });
}
const systemMonitor=createSystemMonitor({onSlowSample:sample=>console.warn('[http-performance]',JSON.stringify(sample))});
const server = http.createServer(async (req, res) => {
  systemMonitor.request(req,res);
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://apis.google.com https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://docs.google.com; frame-src 'self' https://docs.google.com https://accounts.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://localhost'); const path = url.pathname; if (path.startsWith('/plan-ui/') || path.startsWith('/plan-editor/') || path.startsWith('/plan-preview/')) { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"); } const user = userFor(req);
    if (path === '/api/health') return json(res, { ok: true, service: 'Moc Hub' });
    const publicMedia = publicMediaFile(path); if (publicMedia) return serveFile(req, res, publicMedia, false);
    if (path.match(/^\/api\/oauth\/[^/]+\/callback$/)) return await finishOAuth(req, res, url);
    if (path === '/api/drive/callback' && req.method === 'GET') { await completeDriveOAuth(url); res.writeHead(303, { 'Location': '/?drive=connected#settings', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end(); }
    const publicCopyRoute = path.match(/^\/api\/copy\/public-media\/([\w-]+)$/); if (publicCopyRoute && ['GET', 'HEAD'].includes(req.method)) return serveFile(req, res, publicCopyMedia(publicCopyRoute[1], url.searchParams.get('expires'), url.searchParams.get('token')), false);
    const carrierHook = path.match(/^\/api\/shipping\/webhooks\/viettelpost\/([^/]+)$/); if (carrierHook) { if (req.method !== 'POST') domain.fail('Chỉ chấp nhận POST.', 405); const payload = await body(req, 256000); const result = receiveVtpWebhook(carrierHook[1], req.headers, payload.value); json(res, result); if (!all('carrier_orders').some(o => o.accountId === carrierHook[1] && o.tracking === String(payload.value.DATA.ORDER_NUMBER)) && !all('shipments').some(s => s.accountId === carrierHook[1] && s.tracking === String(payload.value.DATA.ORDER_NUMBER))) void importVtpOrder(carrierHook[1], String(payload.value.DATA.ORDER_NUMBER)).catch(() => { }); return; }
    const posHook=path.match(/^\/api\/pos\/webhooks\/([^/]+)$/);if(posHook){if(req.method!=='POST')domain.fail('Chỉ chấp nhận POST.',405);return json(res,receivePosWebhook(posHook[1],req.headers,(await body(req,256000)).value));}
    if (path.startsWith('/api/webhooks/')) return await webhook(req, res, url);
    if (path === '/api/events' && req.method === 'GET') { if (!user) domain.fail('Vui lòng đăng nhập.', 401); res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' }); let revision = stateRevision(), lastHeartbeat = Date.now(); res.write('event: ready\ndata: {}\n\n'); const timer = setInterval(() => { if (Date.now() - lastHeartbeat >= 15000) { if (!userFor(req)) { clearInterval(timer); res.end(); return; } lastHeartbeat = Date.now(); res.write(': keepalive\n\n'); } const next = stateRevision(); if (next !== revision) { if (!userFor(req)) { clearInterval(timer); res.end(); return; } revision = next; res.write('event: changed\ndata: {}\n\n'); } }, 250); req.on('close', () => clearInterval(timer)); return; }
    if (path === '/api/bootstrap') { const setup = !db.prepare('SELECT id FROM users LIMIT 1').get(); return json(res, { setup, user }); }
    if (path === '/api/setup' && req.method === 'POST') {
      checkOrigin(req); if (db.prepare('SELECT id FROM users LIMIT 1').get()) domain.fail('Hệ thống đã được thiết lập.', 409); const { value: b } = await body(req);
      if ((b.password || '').length < 10) domain.fail('Mật khẩu cần ít nhất 10 ký tự.'); const email = domain.required(b.email, 'Email', 200).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) domain.fail('Email không hợp lệ.'); const u = { id: uid('user'), email, name: domain.required(b.name, 'Tên', 150), role: 'owner' };
      transaction(() => { if (db.prepare('SELECT id FROM users LIMIT 1').get()) domain.fail('Hệ thống đã được thiết lập.', 409); db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(u.id, u.email, u.name, u.role, hashPassword(b.password)); put('settings', { id: 'general', name: b.workspace || 'Mộc Workspace', timezone: 'Asia/Ho_Chi_Minh' }); if (b.demo === true) seed(); }); return json(res, login(res, u));
    }
    if (path === '/api/login' && req.method === 'POST') {
      checkOrigin(req); const ip = req.socket.remoteAddress; const record = throttles.get(ip) || { count: 0, until: Date.now() + 60000 }; if (Date.now() > record.until) { record.count = 0; record.until = Date.now() + 60000; } record.count++; throttles.set(ip, record); if (record.count > 12) domain.fail('Quá nhiều lần thử. Vui lòng chờ một phút.', 429);
      const { value: b } = await body(req); const u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(b.email || '').toLowerCase()); if (!u || !verify(String(b.password || ''), u.password)) domain.fail('Email hoặc mật khẩu không đúng.', 401); return json(res, login(res, u));
    }
    if (path.startsWith('/api/') || path.startsWith('/uploads/')) {
      if (!user) domain.fail('Vui lòng đăng nhập.', 401);
      const previewMedia = path.match(/^\/api\/copy\/media\/([\w-]+)\/(\d+)$/); if (previewMedia && req.method === 'GET') { const response = await copyPreviewMedia(user, previewMedia[1], previewMedia[2], url.searchParams.has('poster'), req.headers.range); for (const header of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) if (response.headers.has(header)) res.setHeader(header, response.headers.get(header)); res.setHeader('Cache-Control', 'private, no-store'); res.writeHead(response.status); try { await pipeline(Readable.fromWeb(response.body), res); } catch (error) { if (!res.destroyed) throw error; } return; }
      const archive = path.match(/^\/api\/copy\/archive\/([\w-]+)$/); if (archive && req.method === 'GET') { res.setHeader('Content-Disposition', 'attachment; filename="bai-viet-' + archive[1] + '.zip"'); return serveFile(req, res, copyArchive(user, archive[1]), true); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { checkOrigin(req); if (!path.startsWith('/api/proxy/supabase/') && req.headers['x-csrf-token'] !== user.csrf) domain.fail('Phiên làm việc không hợp lệ. Tải lại trang.', 403); }
      if (path === '/api/upload/chunk' && req.method === 'POST') {
        domain.permission(user, 'assets');const uploadId=String(url.searchParams.get('uploadId')||''),index=Number(url.searchParams.get('index')),total=Number(url.searchParams.get('total')),offset=Number(req.headers['x-upload-offset']);
        if(!/^[a-zA-Z0-9-]{16,80}$/.test(uploadId)||!Number.isInteger(index)||!Number.isInteger(total)||index<0||index>=total||total>200||!Number.isSafeInteger(offset)||offset<0)domain.fail('Phiên upload không hợp lệ.');
        const name=decodeURIComponent(req.headers['x-filename']||'media'),mime=String(req.headers['content-type']||''),types={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/ogg':'.ogg','audio/mp4':'.m4a'};if(!types[mime])domain.fail('Upload từng phần chỉ hỗ trợ ảnh, video và âm thanh.');
        const partial=join(dataDir,'uploads','.upload-'+uploadId+'.part');if(index===0&&existsSync(partial))unlinkSync(partial);if(index>0&&!existsSync(partial))domain.fail('Phiên upload đã hết hạn. Vui lòng chọn lại file.',409);if((existsSync(partial)?statSync(partial).size:0)!==offset)domain.fail('Thứ tự phần upload không hợp lệ. Vui lòng chọn lại file.',409);
        let chunkSize=0;const limiter=new Transform({transform(chunk,enc,cb){chunkSize+=chunk.length;if(chunkSize>4*1024*1024)return cb(Object.assign(new Error('Phần upload vượt 4 MB.'),{status:413}));cb(null,chunk);}});try{await pipeline(req,limiter,createWriteStream(partial,{flags:index===0?'w':'a'}));const size=statSync(partial).size;if(size>500*1024*1024)domain.fail('File vượt 500 MB.',413);if(index<total-1)return json(res,{ok:true,received:size});const head=Buffer.alloc(32),fd=openSync(partial,'r');let read=0;try{read=readSync(fd,head,0,head.length,0);}finally{closeSync(fd);}const b=head.subarray(0,read),valid=mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?b[0]===255&&b[1]===216:mime==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':mime==='video/webm'?b.subarray(0,4).equals(Buffer.from([26,69,223,163])):mime==='audio/mpeg'?b.toString('ascii',0,3)==='ID3'||b[0]===255&&(b[1]&224)===224:['audio/wav','audio/x-wav'].includes(mime)?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE':mime==='audio/ogg'?b.toString('ascii',0,4)==='OggS':b.toString('ascii',4,8)==='ftyp';if(!valid)domain.fail('Nội dung file không khớp loại media.');const id=uid('asset'),filename=id+types[mime],target=join(dataDir,'uploads',filename);renameSync(partial,target);const asset=put('assets',{id,connectionId:null,conversationId:null,uploadedBy:user.id,active:true,categoryIds:[],tags:[],scopes:['chat','post','template'],description:'',name:basename(name).slice(0,200),mime,size,url:'/uploads/'+filename,type:mime.startsWith('video')?'video':mime.startsWith('audio')?'audio':'image'});return json(res,asset,201);}catch(error){if(index===total-1&&existsSync(partial))unlinkSync(partial);throw error;}
      }
      if (path === '/api/upload' && req.method === 'POST') {
        const conversationId = url.searchParams.get('conversationId'); let chatConnection = null; if (conversationId) { domain.permission(user, 'inbox'); const conv = get('conversations', conversationId); if (!conv || conv.deletedAt) domain.fail('Hội thoại không hợp lệ.', 404); care.assertChannel(user, conv.connectionId); chatConnection = conv.connectionId; } else domain.permission(user, 'assets'); const name = decodeURIComponent(req.headers['x-filename'] || 'media'); const mime = String(req.headers['content-type'] || ''); const types = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'application/pdf': '.pdf', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx', 'text/plain': '.txt', 'application/zip': '.zip' }; if (!types[mime]) domain.fail('Hỗ trợ ảnh, video, PDF, Word, Excel, TXT và ZIP, MP3, WAV, OGG, M4A.');
        const id = uid('asset'); const filename = id + types[mime]; const target = join(dataDir, 'uploads', filename); let size = 0; const sniff = [];
        const limiter = new Transform({ transform(chunk, enc, cb) { size += chunk.length; if (size > 500 * 1024 * 1024) return cb(Object.assign(new Error('File vượt 500 MB.'), { status: 413 })); if (sniff.reduce((s, b) => s + b.length, 0) < 32) sniff.push(chunk.subarray(0, 32)); cb(null, chunk); } });
        try { await pipeline(req, limiter, createWriteStream(target, { flags: 'wx' })); const b = Buffer.concat(sniff); const valid = mime === 'application/pdf' ? b.toString('ascii', 0, 5) === '%PDF-' : mime === 'text/plain' ? !b.includes(0) : ['application/msword', 'application/vnd.ms-excel'].includes(mime) ? b.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])) : mime.startsWith('application/') ? b[0] === 80 && b[1] === 75 : mime === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : mime === 'image/jpeg' ? b[0] === 255 && b[1] === 216 : mime === 'image/webp' ? b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' : mime === 'video/webm' ? b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) : mime === 'audio/mpeg' ? b.toString('ascii', 0, 3) === 'ID3' || b[0] === 255 && (b[1] & 224) === 224 : ['audio/wav', 'audio/x-wav'].includes(mime) ? b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' : mime === 'audio/ogg' ? b.toString('ascii', 0, 4) === 'OggS' : b.toString('ascii', 4, 8) === 'ftyp'; if (!valid) domain.fail('Nội dung file không khớp loại media.'); const asset = put('assets', { id, connectionId: chatConnection, conversationId, uploadedBy: user.id, active: true, categoryIds: [], tags: [], scopes: mime.startsWith('application/') || mime === 'text/plain' ? ['chat', 'template'] : ['chat', 'post', 'template'], description: '', name: basename(name).slice(0, 200), mime, size, url: '/uploads/' + filename, type: mime.startsWith('video') ? 'video' : mime.startsWith('audio') ? 'audio' : mime.startsWith('image') ? 'image' : 'file' }); return json(res, asset, 201); } catch (e) { if (existsSync(target)) unlinkSync(target); throw e; }
      }
      if (path.startsWith('/uploads/')) { const asset = all('assets').find(a => a.url === path); if (asset?.connectionId) care.assertChannel(user, asset.connectionId); return serveFile(req, res, join(dataDir, 'uploads', basename(path)), true); }
      let input = {}; if (!['GET', 'HEAD'].includes(req.method)) input = (await body(req)).value;
      let key = null; const supplied = req.headers['idempotency-key']; const mutating = req.method === 'POST' && !['/api/ai/draft', '/api/backup'].includes(path);
      if (mutating && supplied) { key = user.id + ':' + path + ':' + String(supplied).slice(0, 150); const hash = sha(JSON.stringify(input)); const prior = db.prepare('SELECT * FROM idempotency WHERE key=?').get(key); if (prior) { if (prior.hash !== hash) domain.fail('Khóa thao tác đã dùng với dữ liệu khác.', 409); return json(res, JSON.parse(prior.result)); } if (busy.has(key)) domain.fail('Thao tác đang xử lý, vui lòng chờ.', 409); busy.add(key); }
      try { const result = await dispatch(req, res, url, user, input); if (key) db.prepare('INSERT INTO idempotency VALUES(?,?,?,?)').run(key, sha(JSON.stringify(input)), JSON.stringify(result), now()); return json(res, result); } finally { if (key) busy.delete(key); }
    }
    if (!['GET', 'HEAD'].includes(req.method)) domain.fail('Không hỗ trợ.', 405);
    const file = path === '/' ? join(publicDir, 'index.html') : resolve(publicDir, '.' + decodeURIComponent(path)); if (!file.startsWith(publicDir + sep)) domain.fail('Không được phép.', 403);
    return serveFile(req, res, file, false);
  } catch (e) { if (!res.headersSent) json(res, { error: e.message || 'Lỗi hệ thống.' }, e.status || 500); else res.end(); }
});
function serveFile(req, res, file, privateFile) { if (!existsSync(file) || !statSync(file).isFile()) return json(res, { error: 'Không tìm thấy file.' }, 404); const st = statSync(file); const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' }[extname(file)] || 'application/octet-stream'; res.setHeader('Content-Type', mime); res.setHeader('Cache-Control', privateFile ? 'private, no-store' : 'no-cache'); res.setHeader('Accept-Ranges', 'bytes'); if(serveFrontendFile(req,res,file,st,privateFile))return; const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/); if (range) { const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1; if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); } res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }); return createReadStream(file, { start, end }).pipe(res); } res.setHeader('Content-Length', st.size); if (req.method === 'HEAD') return res.end(); createReadStream(file).pipe(res); }
domain.recoverJobs(); for (const o of all('orders')) syncPlanHandoff(o); for (const r of all('template_runs').filter(r => ['sending', 'pending'].includes(r.status))) put('template_runs', { ...r, status: r.status === 'sending' ? 'unknown' : 'failed', error: 'Máy chủ đã khởi động lại; kiểm tra trước khi tiếp tục.' });
setInterval(() => { try { care.serviceTick(); } catch (e) { console.error('Care worker:', e.message); } }, 15000).unref(); setInterval(() => domain.tick().catch(e => console.error('Scheduler:', e.message)), 5000).unref();
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()), 3600000).unref();
recoverBotJobs(); setInterval(() => botTick().catch(e => console.error('Chatbot:', e.message)), 2000).unref();
server.listen(port, host, () => console.log(`Mộc Hub: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\nDatabase: ${join(dataDir, 'hub.sqlite')}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));

setInterval(() => { try { reminderTick(); consultationTick(); } catch (error) { console.error('Reminder tick:', error.message); } }, 10000).unref();
setInterval(() => pushTick().catch(error => console.error('Push tick:', error.message)), 5000).unref();

setInterval(() => resumePurges().catch(e => console.error('Customer purge:', e.message)), 30000).unref();
recoverCopyJobs(); setInterval(copyTick, 2000).unref();

void facebookChatTick(); setInterval(() => void facebookChatTick(), 10000).unref();

recoverCustomerReminders();setInterval(() => void customerReminderTick().catch(e=>console.error('Customer reminders:',e.message)), 5000).unref();

void commentsTick().catch(e=>console.error('Comments:',e.message));setInterval(()=>void commentsTick().catch(e=>console.error('Comments:',e.message)),15000).unref();

recoverAutomation();setInterval(()=>void automationTick().catch(e=>console.error('Copy automation:',e.message)),5000).unref();

recoverPosJobs();setInterval(()=>void posTick().catch(e=>console.error('POS worker:',e.message)),1000).unref();

recoverCommunication();setInterval(()=>void communicationTick().catch(e=>console.error('Communication worker:',e.message)),1000).unref();

recoverTrackingNotifications();setInterval(()=>void trackingNotificationTick().catch(e=>console.error('Tracking notification:',e.message)),2000).unref();
