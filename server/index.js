require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const line = require('@line/bot-sdk');
const { parseMessage } = require('./gemini');
const { insertDiary, listDiary, getDiary } = require('./db');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// CORS
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// raw bodyを保持しながらJSONをパース
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// LINE署名検証
function verifyLineSignature(req) {
  const signature = req.headers['x-line-signature'];
  if (!signature) return false;
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest('base64');
  return hash === signature;
}

// LINE webhook
app.post('/webhook', (req, res) => {
  if (!verifyLineSignature(req)) {
    console.error('Invalid signature');
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    handleTextMessage(event).catch(err => console.error('handleTextMessage error:', err));
  }
});

// 日報一覧API
app.get('/api/diary', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  res.json(listDiary({ limit, offset }));
});

// 日報詳細API
app.get('/api/diary/:id', (req, res) => {
  const entry = getDiary(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});

async function handleTextMessage(event) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const nowDate = new Date().toISOString().slice(0, 10);

  let parsed;
  try {
    parsed = await parseMessage(text, nowDate);
  } catch (err) {
    console.error('parse error:', err);
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '⚠️ メッセージの解析に失敗しました。もう少し詳しく書いてみてください。' }],
    });
    return;
  }

  try {
    insertDiary({ ...parsed, raw_message: text });
  } catch (err) {
    console.error('DB insert error:', err);
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '⚠️ 日報の保存に失敗しました。' }],
    });
    return;
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: 'text', text: buildReplyText(parsed) }],
  });
}

function buildReplyText(parsed) {
  const dateObj = parsed.date ? new Date(parsed.date + 'T00:00:00') : new Date();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}（${weekdays[dateObj.getDay()]}）`;
  const workStr = Array.isArray(parsed.work_types) && parsed.work_types.length ? parsed.work_types.join('・') : '（作業内容なし）';

  let timeStr = '';
  if (parsed.start_time && parsed.duration > 0) {
    const [h, m] = parsed.start_time.split(':').map(Number);
    const endMin = h * 60 + m + parsed.duration;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    const dur = parsed.duration >= 60
      ? `${Math.floor(parsed.duration / 60)}時間${parsed.duration % 60 > 0 ? parsed.duration % 60 + '分' : ''}`
      : `${parsed.duration}分`;
    timeStr = `\n⏰ ${parsed.start_time}〜${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}（${dur}）`;
  } else if (parsed.start_time) {
    timeStr = `\n⏰ ${parsed.start_time}〜`;
  }

  const fieldStr = parsed.field_name ? `\n📍 ${parsed.field_name}` : '';
  let matStr = '';
  if (parsed.materials && parsed.materials.length) {
    matStr = '\n🪣 ' + parsed.materials.map(m => `${m.name} ${m.amount}${m.unit}`).join('、');
  }
  const notesStr = parsed.notes ? `\n📝 ${parsed.notes}` : '';

  return `✅ 日報を登録しました！\n📅 ${dateStr}${fieldStr}\n🌱 ${workStr}${timeStr}${matStr}${notesStr}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
