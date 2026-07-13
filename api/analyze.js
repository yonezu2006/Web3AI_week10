const CATEGORIES = ['食費', '交際費', '交通費', '推し活', '娯楽費', '医療美容費', 'その他'];
const INCOME_TYPES = ['お小遣い', 'バイト代', 'その他'];

const SYSTEM_PROMPT = `あなたは日記の文章からお金の動き（支出・収入）を抽出するアシスタントです。
ユーザーが書いた日記本文を読み、買い物・支払い・収入など「お金が動いたこと」がわかる一文だけを抜き出し、必ず次のJSON形式のみで返してください。説明文やコードブロックは付けないでください。

{
  "items": [
    {
      "type": "expense または income",
      "description": "10文字以内の短い説明（例: カフェ代, ランチ代, バイト代）",
      "sourceText": "元の日記文からそのまま抜き出した一文",
      "category": "type が expense の場合のみ、次のいずれか1つ: ${CATEGORIES.join('、')}",
      "incomeType": "type が income の場合のみ、次のいずれか1つ: ${INCOME_TYPES.join('、')}。expense の場合は null",
      "amount": "日本の物価感覚での妥当な推定金額（円、数値のみ）。不明な場合は500程度"
    }
  ],
  "undetected": ["お金の動きに関係しない、または金額を特定できない残りの文をそのまま列挙"]
}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: '日記のテキストが必要です' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'サーバーにOPENAI_API_KEYが設定されていません' });
    return;
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      res.status(502).json({ error: 'OpenAIへのリクエストに失敗しました', detail });
      return;
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { items: [], undetected: [] };
    }

    res.status(200).json({
      items: Array.isArray(parsed.items) ? parsed.items : [],
      undetected: Array.isArray(parsed.undetected) ? parsed.undetected : [],
    });
  } catch (e) {
    res.status(500).json({ error: '分析中にエラーが発生しました', detail: String(e) });
  }
};
