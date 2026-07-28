import express from 'express';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import pkg from 'whatsapp-web.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from './models/User.js';

dotenv.config();

const { Client, LocalAuth, MessageMedia } = pkg;
const app = express();
const port = process.env.PORT || 5173;
const jwtSecret = process.env.JWT_SECRET || 'change-this-development-jwt-secret';
let databaseConnected = false;

function normalizeUri(value) {
  if (!value || typeof value !== 'string') return value;
  let trimmed = value.replace(/^\uFEFF/, '').trim();
  trimmed = trimmed.replace(/^(?:export\s+)?(?:MONGO_URI|MONGODB_URI|MONGO_URL)\s*[:=]\s*/i, '').trim();
  trimmed = trimmed.replace(/^[\"'\u2018\u2019\u201c\u201d]+|[\"'\u2018\u2019\u201c\u201d]+$/g, '').trim();
  return trimmed.replace(/^[\s\uFEFF\u200B\u200C\u200D]+|[\s\uFEFF\u200B\u200C\u200D]+$/gu, '');
}

function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/, '$1$2:*****@');
}

const rawMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || (process.env.NODE_ENV === 'production' ? null : 'mongodb://127.0.0.1:27017/whatsapp_messaging_bot');
const mongoUri = normalizeUri(rawMongoUri);
console.log('MongoDB configuration:', {
  source: process.env.MONGO_URI ? 'MONGO_URI' : process.env.MONGODB_URI ? 'MONGODB_URI' : process.env.MONGO_URL ? 'MONGO_URL' : 'default',
  uri: maskMongoUri(mongoUri)
});

if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => { databaseConnected = true; console.log('MongoDB connected.'); })
    .catch(error => console.error('MongoDB connection error:', error.message));
} else {
  console.log('MongoDB is not configured. Set MONGO_URI, MONGODB_URI, or MONGO_URL in environment variables.');
}

// Keep the dashboard available if the WhatsApp Web session closes or expires.
// The user can then reconnect from Settings without losing the web server.
process.on('unhandledRejection', error => console.error('WhatsApp session error:', error));
process.on('uncaughtException', error => console.error('WhatsApp session error:', error));

let qrDataUrl = null;
let state = 'starting';
let account = null;
async function isConnected() {
  if (state === 'connected') return true;
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
let client;

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
    console.error(message);
  });

  client.on('disconnected', reason => {
    state = 'disconnected';
    account = null;
    console.log('WhatsApp disconnected:', reason);
  });
}

function createClient() {
  const puppeteerArgs = process.env.PUPPETEER_ARGS
    ? process.env.PUPPETEER_ARGS.split(' ')
    : ['--no-sandbox', '--disable-setuid-sandbox'];

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'group-messaging-bot'
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: puppeteerArgs
    }
  });

  registerEvents();

  client.initialize().catch(error => {
    state = 'connection_error';
    console.error('WhatsApp startup failed:', error);
  });
}

createClient();

client.on('qr', async qr => {
  qrDataUrl = await QRCode.toDataURL(qr);
  state = 'awaiting_qr_scan';
  console.log('WhatsApp QR generated. Open the dashboard and scan it.');
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
  if (!databaseConnected) return res.status(503).json({ error: 'MongoDB is not connected. Set MONGO_URI, MONGODB_URI, or MONGO_URL in environment variables.' });
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email, and a password of at least 6 characters are required.' });
  try {
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'Administrator' });
    const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '8h' });
    res.status(201).json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  if (!databaseConnected) return res.status(503).json({ error: 'MongoDB is not connected. Set MONGO_URI, MONGODB_URI, or MONGO_URL in environment variables.' });
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
});

app.get('/api/whatsapp/status', async (_req, res) => {
  await isConnected();
  res.json({ state, account, qr: qrDataUrl });
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

    // Capture current puppeteer browser reference (if any) so it can be closed
    const pupBrowserRef = client && client.pupBrowser ? client.pupBrowser : null;

    try {
      await client.destroy();
    } catch (destroyErr) {
      // Log and continue — attempt best-effort cleanup
      console.error('Error during client.destroy():', destroyErr.message || destroyErr);
    }

    // Try to explicitly close Puppeteer browser if still available
    if (pupBrowserRef && typeof pupBrowserRef.close === 'function') {
      try {
        await pupBrowserRef.close();
        console.log('Explicitly closed Puppeteer browser reference captured before destroy.');
      } catch (err) {
        console.error('Error closing captured Puppeteer browser:', err.message || err);
      }
    }

    const sessionPath = path.join(process.cwd(), '.wwebjs_auth', 'session-group-messaging-bot');

    const removed = await safeRemoveSession(sessionPath);
    if (!removed) {
      console.error('Could not remove session folder after retries. It may be locked by another process.');
      // Do not treat this as a fatal error for the API: return helpful message so user can take manual action
      account = null;
      client.removeAllListeners && client.removeAllListeners();
      try { client = null; } catch {};
      state = 'starting';

      setTimeout(() => { createClient(); }, 2000);

      return res.status(500).json({ success: false, error: 'Could not remove session folder. Ensure no other processes (including Chrome/Node) are using it and try again.' });
    }

    account = null;
    state = 'starting';

    setTimeout(() => { createClient(); }, 2000);

    return res.json({ success: true, message: 'WhatsApp disconnected successfully. New QR will appear shortly.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/whatsapp/groups', async (_req, res) => {
  if (!(await isConnected())) return res.status(409).json({ error: 'WhatsApp is not connected.' });
  try {
    // Avoid getChats(): WhatsApp sometimes rejects its full metadata lookup for
    // a single chat. Only the safe fields needed for sending are read here.
    const groups = await client.pupPage.evaluate(() => {
      const chats = window.require('WAWebCollections').Chat.getModelsArray();
      return chats
        .filter(chat => chat.groupMetadata)
        .map(chat => ({
          name: chat.formattedTitle || chat.name || chat.id?._serialized,
          id: chat.id?._serialized,
          active: true
        }))
        .filter(group => group.name && group.id);
    });
    res.json({ count: groups.length, groups });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not read WhatsApp groups.' });
  }
});

app.get('/api/whatsapp/contacts', async (_req, res) => {
  if (!(await isConnected())) return res.status(409).json({ error: 'WhatsApp is not connected.' });
  try {
    const contacts = await client.pupPage.evaluate(() => {
      const list = window.require('WAWebCollections').Contact.getModelsArray();
      return list
        .filter(contact => !contact.isGroup && contact.id?._serialized?.endsWith('@c.us'))
        .map(contact => ({
          name: contact.formattedName || contact.pushname || contact.name || contact.id.user,
          id: contact.id._serialized,
          type: 'contact'
        }))
        .filter(contact => contact.name && contact.id);
    });
    res.json({ count: contacts.length, contacts });
  } catch (error) {
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
    try { chats = await client.getChats(); }
    catch { return res.status(400).json({ error: 'Refresh Groups first so the app can save each group’s WhatsApp ID.' }); }
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


app.listen(port, () => console.log(`Dashboard: http://127.0.0.1:${port}`));

