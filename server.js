import express from 'express';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import pkg from 'whatsapp-web.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { Client, LocalAuth, MessageMedia } = pkg;
const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'change-this-development-jwt-secret';
let databaseConnected = false;
let supabase = null;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseKeySource = process.env.SUPABASE_SECRET_KEY
  ? 'SUPABASE_SECRET_KEY'
  : process.env.SUPABASE_SERVICE_ROLE_KEY
  ? 'SUPABASE_SERVICE_ROLE_KEY'
  : process.env.SUPABASE_KEY
  ? 'SUPABASE_KEY'
  : process.env.SUPABASE_PUBLISHABLE_KEY
  ? 'SUPABASE_PUBLISHABLE_KEY'
  : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  : 'none';
const isPublishableKey = Boolean(rawSupabaseKey && /publishable|anon/i.test(rawSupabaseKey));

console.log('Supabase configuration:', {
  source: supabaseKeySource,
  url: supabaseUrl || null
});

async function initializeSupabase() {
  if (!supabaseUrl || !rawSupabaseKey) {
    console.log('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
    return;
  }

  if (isPublishableKey) {
    console.log('Supabase key is a client-side publishable/anon key. Server-side auth operations require SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  supabase = createClient(supabaseUrl, rawSupabaseKey, { auth: { persistSession: false } });

  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) {
      console.error('Supabase key validation failed:', error.message || error);
      supabase = null;
      return;
    }
    const hasUsers = Array.isArray(data)
      ? data.length >= 0
      : data && Array.isArray(data.users);
    if (!hasUsers) {
      console.error('Supabase key validation failed: unexpected auth response.', JSON.stringify(data));
      supabase = null;
      return;
    }
    databaseConnected = true;
    console.log('Supabase client initialized and key validated.');
  } catch (error) {
    console.error('Supabase key validation failed:', error.message || error);
    supabase = null;
  }
}

await initializeSupabase();

if (!databaseConnected) {
  console.log('Supabase is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
}




// Keep the dashboard available if the WhatsApp Web session closes or expires.
// The user can then reconnect from Settings without losing the web server.
process.on('unhandledRejection', error => console.error('WhatsApp session error:', error));
process.on('uncaughtException', error => console.error('WhatsApp session error:', error));

let qrDataUrl = null;
let state = 'starting';
let account = null;
let lastConnectionError = null;
let currentWhatsappClientId = process.env.WEBJS_SESSION_ID || 'group-messaging-bot';

function getWhatsappClientId() {
  return currentWhatsappClientId;
}

function getSessionFolderName() {
  return `session-${getWhatsappClientId()}`;
}

function getSessionPath() {
  return path.join(process.cwd(), '.wwebjs_auth', getSessionFolderName());
}

async function cleanSessionFolder(sessionPath) {
  const maxAttempts = 5;
  const delayMs = 300;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('Deleted WhatsApp session folder:', sessionPath);
      }
      return true;
    } catch (error) {
      console.error(`Failed to remove session folder (attempt ${attempt}/${maxAttempts}):`, error.code || error.message || error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
}

async function isConnected() {
  if (state === 'connected') return true;
  if (!client || typeof client.getState !== 'function') return false;
  try {
    const clientState = await client.getState();
    if (clientState === 'CONNECTED') {
      state = 'connected';
      account = client.info?.wid?.user || account;
      return true;
    }
  } catch { /* session is still loading or disconnected */ }
  return false;
}

function normalizeWhatsappCollection(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw.toArray === 'function') {
    try {
      const result = raw.toArray();
      if (Array.isArray(result)) return result;
    } catch {}
  }
  if (typeof raw[Symbol.iterator] === 'function') {
    try {
      return Array.from(raw);
    } catch {}
  }
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.models)) return raw.models;
    if (raw.models && typeof raw.models[Symbol.iterator] === 'function') {
      try { return Array.from(raw.models); } catch {}
    }
    if (typeof raw.entries === 'function') {
      try { return Array.from(raw.entries()).map(([_, value]) => value); } catch {}
    }
    return Object.values(raw);
  }
  return [];
}

function getWhatsappId(rawId) {
  if (typeof rawId === 'string') return rawId;
  if (!rawId) return '';
  if (typeof rawId._serialized === 'string') return rawId._serialized;
  if (typeof rawId.id === 'string') return rawId.id;
  if (typeof rawId.user === 'string' && typeof rawId.server === 'string') return `${rawId.user}@${rawId.server}`;
  return '';
}

function isWhatsappGroup(item) {
  const id = getWhatsappId(item?.id || item?.wid || item);
  const server = item?.id?.server || item?.wid?.server || '';
  return Boolean(
    item?.isGroup ||
    item?.groupMetadata ||
    server === 'g.us' ||
    id.endsWith('@g.us')
  );
}

function dedupeItems(items) {
  const seen = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = typeof item?.id === 'string'
      ? item.id
      : item?.id?._serialized || item?.id?.user || item?.id || '';
    if (!id) continue;
    if (!seen.has(id)) seen.set(id, item);
  }
  return Array.from(seen.values());
}

async function getWhatsappChats() {
  if (typeof client?.getChats === 'function') {
    try {
      const chats = normalizeWhatsappCollection(await client.getChats());
      if (chats.length) return dedupeItems(chats);
    } catch (error) {
      console.error('getWhatsappChats client.getChats error:', error.message || error);
    }
  }

  if (client?.pupPage) {
    try {
      await client.pupPage.waitForFunction('window.WWebJS != undefined', { timeout: 20000 });
      const fallbackChats = await client.pupPage.evaluate(async () => {
        const getArray = value => {
          if (!value) return [];
          if (Array.isArray(value)) return value;
          if (typeof value.toArray === 'function') {
            try { return value.toArray(); } catch { return []; }
          }
          if (typeof value[Symbol.iterator] === 'function') {
            try { return Array.from(value); } catch { return []; }
          }
          if (value?.values && typeof value.values === 'function') {
            try { return Array.from(value.values()); } catch { return []; }
          }
          return Object.values(value || {});
        };

        const rawChats = window.WWebJS && typeof window.WWebJS.getChats === 'function'
          ? await window.WWebJS.getChats()
          : null;
        let chats = getArray(rawChats);
        if (!chats.length && window.require) {
          const collection = window.require('WAWebCollections')?.Chat?.getModelsArray?.();
          chats = getArray(collection);
        }

        chats = Array.isArray(chats) ? chats : Object.values(chats || {});

        return chats.map(chat => ({
          id: chat?.id?._serialized || chat?.id || '',
          name: chat?.formattedTitle || chat?.name || chat?.contact?.name || chat?.contact?.pushname || '',
          isGroup: chat?.isGroup,
          groupMetadata: chat?.groupMetadata,
          contact: chat?.contact ? {
            id: chat.contact?.id?._serialized || chat.contact?.id || '',
            name: chat.contact?.name || chat.contact?.pushname || chat.contact?.formattedName || ''
          } : undefined,
          formattedTitle: chat?.formattedTitle,
        }));
      });
      if (Array.isArray(fallbackChats)) return dedupeItems(fallbackChats);
    } catch (error) {
      console.error('getWhatsappChats fallback error:', error.message || error);
    }
  }

  return [];
}

async function getWhatsappContacts() {
  if (typeof client?.getContacts === 'function') {
    try {
      const contacts = normalizeWhatsappCollection(await client.getContacts());
      if (contacts.length) return dedupeItems(contacts);
    } catch (error) {
      console.error('getWhatsappContacts client.getContacts error:', error.message || error);
    }
  }

  if (client?.pupPage) {
    try {
      await client.pupPage.waitForFunction('window.WWebJS != undefined', { timeout: 20000 });
      const fallbackContacts = await client.pupPage.evaluate(async () => {
        const getArray = value => {
          if (!value) return [];
          if (Array.isArray(value)) return value;
          if (typeof value.toArray === 'function') {
            try { return value.toArray(); } catch { return []; }
          }
          if (typeof value[Symbol.iterator] === 'function') {
            try { return Array.from(value); } catch { return []; }
          }
          if (value?.values && typeof value.values === 'function') {
            try { return Array.from(value.values()); } catch { return []; }
          }
          return Object.values(value || {});
        };

        const rawContacts = window.WWebJS && typeof window.WWebJS.getContacts === 'function'
          ? await window.WWebJS.getContacts()
          : null;
        let contacts = getArray(rawContacts);
        if (!contacts.length && window.require) {
          const collection = window.require('WAWebCollections')?.Contact?.getModelsArray?.();
          contacts = getArray(collection);
        }

        contacts = Array.isArray(contacts) ? contacts : Object.values(contacts || {});

        return contacts.map(contact => ({
          id: contact?.id?._serialized || contact?.id || '',
          formattedName: contact?.formattedName,
          pushname: contact?.pushname,
          name: contact?.name,
          shortName: contact?.shortName,
          verifiedName: contact?.verifiedName,
          isGroup: contact?.isGroup,
        }));
      });
      if (Array.isArray(fallbackContacts)) return dedupeItems(fallbackContacts);
    } catch (error) {
      console.error('getWhatsappContacts fallback error:', error.message || error);
    }
  }

  return [];
}

async function getWhatsappGroups() {
  const chats = await getWhatsappChats();
  const groupsFromChats = chats.filter(isWhatsappGroup);
  if (groupsFromChats.length) return groupsFromChats;

  // Some WhatsApp Web builds expose group entries through the contact store
  // before they appear in the chat collection. Use that store as a fallback.
  const contacts = await getWhatsappContacts();
  return contacts.filter(isWhatsappGroup);
}


let client;

async function safeDestroyWhatsappClient() {
  if (!client) return;
  try {
    await client.destroy();
  } catch (error) {
    console.error('Error destroying WhatsApp client:', error.message || error);
  }

  try {
    if (client.pupBrowser && typeof client.pupBrowser.close === 'function') {
      await client.pupBrowser.close();
      console.log('Closed Puppeteer browser during cleanup.');
    }
  } catch (error) {
    console.error('Error closing Puppeteer browser during cleanup:', error.message || error);
  }

  try {
    client.removeAllListeners && client.removeAllListeners();
  } catch (error) {
    console.error('Error removing client listeners:', error.message || error);
  }

  client = null;
  state = 'starting';
}

function registerEvents() {
  client.on('qr', async qr => {
    qrDataUrl = await QRCode.toDataURL(qr);
    state = 'awaiting_qr_scan';
    console.log('WhatsApp QR generated.');
  });

  client.on('authenticated', () => {
    state = 'authenticated';
  });

  client.on('ready', () => {
    state = 'connected';
    qrDataUrl = null;
    account = client.info?.wid?.user || null;
    console.log('WhatsApp connected.');
  });

  client.on('auth_failure', message => {
    state = 'auth_failed';
    qrDataUrl = null;
    console.error('WhatsApp authentication failure:', message);
    setTimeout(() => {
      console.log('Reinitializing WhatsApp client after auth failure.');
      initializeWhatsappClient().catch(error => console.error('Failed to reinitialize after auth failure:', error.message || error));
    }, 1500);
  });

  client.on('disconnected', reason => {
    state = 'disconnected';
    account = null;
    console.log('WhatsApp disconnected:', reason);
  });
}

async function initializeWhatsappClient(retryAllowed = true) {
  if (client) {
    await safeDestroyWhatsappClient();
  }

  const sessionPath = getSessionPath();
  const puppeteerArgs = process.env.PUPPETEER_ARGS
    ? process.env.PUPPETEER_ARGS.split(' ')
    : ['--no-sandbox', '--disable-setuid-sandbox'];

  state = 'starting';
  qrDataUrl = null;
  lastConnectionError = null;

  const clientId = getWhatsappClientId();
  console.log('Starting WhatsApp client with session id:', clientId, 'session path:', sessionPath);

  client = new Client({
    authStrategy: new LocalAuth({
      clientId
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: puppeteerArgs
    }
  });

  registerEvents();

  client.initialize().catch(async error => {
    const message = error instanceof Error ? error.message : String(error);
    lastConnectionError = message;
    state = 'connection_error';
    console.error('WhatsApp startup failed:', message);

    const lockedError = /already running|in use|userDataDir|userdatadir|EPERM|Permission denied/i.test(message);
    if (retryAllowed && lockedError) {
      try {
        console.log('WhatsApp session path looks locked or already in use. Cleaning old session and retrying with a fresh session id.');
        await safeDestroyWhatsappClient();
        const cleaned = await cleanSessionFolder(sessionPath);
        if (!cleaned) {
          console.warn('Could not remove locked session folder; using a fresh session folder instead.');
        }
        currentWhatsappClientId = `${process.env.WEBJS_SESSION_ID || 'group-messaging-bot'}-${Date.now()}`;
        console.log('Retrying with new WhatsApp session id:', currentWhatsappClientId);
        await initializeWhatsappClient(false);
      } catch (retryError) {
        console.error('Retrying WhatsApp initialization failed:', retryError instanceof Error ? retryError.message : retryError);
      }
    }
  });
}

initializeWhatsappClient();

// Enable basic CORS for local dashboard and file:// clients
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// JSON body parsing for API endpoints
app.use(express.json({ limit: '5mb' }));
app.use(express.static('.'));

// Multer setup for handling attachments in /api/whatsapp/send
const uploadDir = path.join(process.cwd(), '.uploads_tmp');
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); } catch (e) { console.error('Could not ensure upload dir:', e.message || e); }
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // keep original name to preserve extension
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB per file

app.get('/api/auth/status', (_req, res) => res.json({ databaseConnected }));

app.post('/api/auth/register', async (req, res) => {
  if (!databaseConnected) return res.status(503).json({ error: 'Supabase is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables.' });
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email, and a password of at least 6 characters are required.' });

  const emailLower = String(email).toLowerCase();
  try {
    const { data: user, error } = await supabase.auth.admin.createUser({
      email: emailLower,
      password,
      user_metadata: { name, role: 'Administrator' },
      email_confirm: true
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      throw error;
    }

    const token = jwt.sign({ id: user.id, role: user.user_metadata?.role || 'Administrator' }, jwtSecret, { expiresIn: '8h' });
    res.status(201).json({
      token,
      user: {
        name: user.user_metadata?.name || name,
        email: user.email,
        role: user.user_metadata?.role || 'Administrator'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not create user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!databaseConnected) return res.status(503).json({ error: 'Supabase is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables.' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const emailLower = String(email).toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password
    });

    if (error || !data?.user) return res.status(401).json({ error: 'Incorrect email or password.' });

    const user = data.user;
    const role = user.user_metadata?.role || 'Operator';
    const token = jwt.sign({ id: user.id, role }, jwtSecret, { expiresIn: '8h' });
    res.json({
      token,
      user: {
        name: user.user_metadata?.name || '',
        email: user.email,
        role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not authenticate user.' });
  }
});

app.get('/api/whatsapp/status', async (_req, res) => {
  // Keep startup failures visible. Retrying on every dashboard poll clears the
  // error and leaves the UI stuck at "starting" with no QR code.
  if (!client || ['disconnected', 'auth_failed'].includes(state)) {
    await initializeWhatsappClient();
  }
  await isConnected();
  res.json({ state, account, qr: qrDataUrl, error: lastConnectionError });
});

app.post('/api/whatsapp/disconnect', async (_req, res) => {
  // Safer disconnect: ensure the WhatsApp client and Puppeteer browser are closed
  // before attempting to delete the LocalAuth session folder. Windows can return
  // EPERM if files are still in use by a running process.
  async function safeRemoveSession(sessionPath) {
    const maxAttempts = 8;
    const delayMs = 500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!fs.existsSync(sessionPath)) return true;
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('Session deleted.');
        return true;
      } catch (err) {
        console.error(`Attempt ${attempt} to remove session failed:`, err.message);
        // If the client still has a Puppeteer browser attached, try closing it.
        try {
          if (client && client.pupBrowser && typeof client.pupBrowser.close === 'function') {
            await client.pupBrowser.close();
            console.log('Closed underlying Puppeteer browser.');
          }
        } catch (closeErr) {
          console.error('Error closing Puppeteer browser:', closeErr.message || closeErr);
        }
        // Small delay before retrying
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return false;
  }

  try {
    state = 'disconnecting';
    qrDataUrl = null;
    await safeDestroyWhatsappClient();

    const sessionPath = getSessionPath();

    const removed = await safeRemoveSession(sessionPath);
    if (!removed) {
      console.error('Could not remove session folder after retries. It may be locked by another process.');
      // Do not treat this as a fatal error for the API: return helpful message so user can take manual action
      account = null;
      client.removeAllListeners && client.removeAllListeners();
      try { client = null; } catch {};
      state = 'starting';

      setTimeout(() => { initializeWhatsappClient(); }, 2000);

      return res.status(500).json({ success: false, error: 'Could not remove session folder. Ensure no other processes (including Chrome/Node) are using it and try again.' });
    }

    account = null;
    state = 'starting';

    setTimeout(() => { initializeWhatsappClient(); }, 2000);

    return res.json({ success: true, message: 'WhatsApp disconnected successfully. New QR will appear shortly.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/whatsapp/groups', async (_req, res) => {
  if (!(await isConnected())) return res.status(409).json({ error: 'WhatsApp is not connected.' });
  try {
    const groupItems = await getWhatsappGroups();
    const groups = dedupeItems(groupItems
      .map(group => {
        const id = getWhatsappId(group.id) || getWhatsappId(group.wid);
        return {
          name: group?.formattedTitle || group?.name || group?.subject || group?.pushname || (group?.contact && (group.contact.name || group.contact.pushname)) || id,
          id,
          active: true,
        };
      }))
      .filter(group => group.name && group.id);

    res.json({ count: groups.length, groups });
  } catch (error) {
    console.error('WhatsApp groups error:', error.message || error);
    res.status(500).json({ error: error.message || 'Could not read WhatsApp groups.' });
  }
});

app.get('/api/whatsapp/contacts', async (_req, res) => {
  if (!(await isConnected())) return res.status(409).json({ error: 'WhatsApp is not connected.' });
  try {
    const contactsData = await getWhatsappContacts();
    const contacts = dedupeItems((Array.isArray(contactsData) ? contactsData : [])
      .filter(contact => !contact?.isGroup && contact?.id)
      .map(contact => {
        const id = getWhatsappId(contact.id) || (typeof contact.id === 'string' ? contact.id : contact?.id?.user || '');
        return {
          name:
            contact?.formattedName || contact?.pushname || contact?.name || contact?.shortName || contact?.verifiedName || id,
          id,
          type: 'contact',
        };
      }))
      .filter(contact => contact.name && contact.id && contact.id.endsWith('@c.us'));

    res.json({ count: contacts.length, contacts });
  } catch (error) {
    console.error('WhatsApp contacts error:', error.message || error);
    res.status(500).json({ error: error.message || 'Could not read WhatsApp contacts.' });
  }
});

app.post('/api/whatsapp/send', upload.array('attachments'), async (req, res) => {
  if (!(await isConnected())) return res.status(409).json({ error: 'WhatsApp is not connected. Scan the QR code first.' });

  // Support both JSON body and multipart/form-data uploads
  const body = req.body || {};
  const files = Array.isArray(req.files) ? req.files : [];
  const { message: rawMessage } = body;
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';

  // Parse recipients/groups which may be sent as JSON strings when using multipart/form-data
  const parseTargets = val => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { /* ignore */ }
    }
    return [];
  };

  const recipients = parseTargets(body.recipients);
  const groups = parseTargets(body.groups);
  const targets = recipients.length ? recipients : groups;

  if ((!message || message.length === 0) && files.length === 0) return res.status(400).json({ error: 'Message or at least one attachment is required.' });
  if (!Array.isArray(targets) || targets.length === 0) return res.status(400).json({ error: 'Select at least one group or contact.' });

  const results = [];
  let chats = [];
  if (targets.some(group => !String(group.id || '').trim().match(/@(g|c)\.us$/))) {
    try {
      chats = await getWhatsappChats();
      if (!Array.isArray(chats) || chats.length === 0) {
        throw new Error('No chats loaded yet.');
      }
    } catch (error) {
      console.error('Could not load chats for sending message:', error.message || error);
      return res.status(400).json({ error: 'Refresh Groups first so the app can save each group’s WhatsApp ID.' });
    }
  }

  // Helper to cleanup uploaded temp files
  const cleanupFiles = () => {
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
    }
  };

  for (const group of targets) {
    let id = String(group.id || '').trim();
    if (!id.match(/@(g|c)\.us$/)) {
      const matchingGroup = chats.find(chat => chat.isGroup && chat.name === group.name);
      id = matchingGroup?.id?._serialized || '';
    }
    if (!id) {
      results.push({ name: group.name || 'Unknown group', status: 'failed', error: 'Group not found. Make the group name match WhatsApp exactly, or add its ID ending in @g.us.' });
      continue;
    }

    try {
      // If attachments present, send them. Attach message as caption to the first file.
      if (files.length > 0) {
        let first = true;
        for (const file of files) {
          try {
            const media = MessageMedia.fromFilePath(file.path);
            const sendOptions = {};
            if (first && message) sendOptions.caption = message;
            await client.sendMessage(id, media, sendOptions);
            first = false;
          } catch (mediaErr) {
            console.error('Error sending media to', id, mediaErr.message || mediaErr);
            throw mediaErr;
          }
        }
        results.push({ name: group.name || id, status: 'success', sentAt: new Date().toISOString() });
      } else {
        // No attachments — simple text message
        await client.sendMessage(id, message);
        results.push({ name: group.name || id, status: 'success', sentAt: new Date().toISOString() });
      }
    } catch (error) {
      results.push({ name: group.name || id, status: 'failed', error: error.message, attemptedAt: new Date().toISOString() });
    }
  }

  // Cleanup temp uploaded files
  try { cleanupFiles(); } catch (e) { /* ignore */ }

  res.json({ results });
});


const portNumber = Number.isInteger(Number(process.env.PORT)) && Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;
let currentPort = portNumber;
const server = app.listen(currentPort, () => console.log(`Dashboard: http://127.0.0.1:${currentPort}`));
server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    const fallbackPort = currentPort + 1;
    console.warn(`Port ${currentPort} is in use. Trying port ${fallbackPort} instead.`);
    currentPort = fallbackPort;
    app.listen(currentPort, () => console.log(`Dashboard: http://127.0.0.1:${currentPort}`));
  } else {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
});

