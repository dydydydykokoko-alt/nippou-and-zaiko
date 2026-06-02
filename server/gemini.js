const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `あなたは農業の作業日報を管理するアシスタントです。
ユーザーが送ってくるテキストから作業内容を読み取り、必ず以下のJSON形式のみで返してください（説明文は不要）。

{
  "date": "YYYY-MM-DD",
  "field_name": "圃場名（例: 北圃場）",
  "work_types": ["作業内容1", "作業内容2"],
  "start_time": "HH:MM",
  "duration": 作業時間（分単位の整数）,
  "notes": "メモ・備考",
  "materials": [{"name": "資材名", "amount": 数量, "unit": "単位"}]
}

ルール:
- date: 「今日」「昨日」などは現在日時から計算。省略時は今日の日付。
- field_name: 圃場・畑名が書かれていれば抽出。なければ空文字。
- work_types: 施肥/農薬散布/除草/定植/収穫/土寄せ 等。複数可。
- start_time: 「9時」「09:00」「午前9時」等を"HH:MM"形式に。省略時は空文字。
- duration: 終了時刻から開始時刻を引いた分数。省略時は0。
- notes: 特記事項があれば。なければ空文字。
- materials: 資材・農薬・肥料の記述があれば抽出。なければ空配列。
- 必ずJSON以外の文字を含めないこと。`;

async function parseMessage(text, nowDate) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `現在日時: ${nowDate}\n\nメッセージ:\n${text}` },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0].message.content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('応答をJSONとして解析できませんでした');

  return JSON.parse(jsonMatch[0]);
}

module.exports = { parseMessage };
