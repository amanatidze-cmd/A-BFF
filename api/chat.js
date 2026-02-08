import fetch from 'node-fetch';

// Ключ и GUID только из переменных окружения (на Vercel: Project → Settings → Environment Variables).
// После добавления/изменения переменных нужен redeploy.
const API_KEY = (process.env.API_KEY || '').trim();
const GUID = (process.env.GUID || '').trim();

const EXTERNAL_API = GUID
  ? `https://api.airia.ai/v2/PipelineExecution/${GUID}`
  : null;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!API_KEY || !GUID || !EXTERNAL_API) {
    console.error('Missing API_KEY or GUID in environment. Set them in Vercel: Project → Settings → Environment Variables, then redeploy.');
    return res.status(503).json({
      error: 'Chat service not configured',
      hint: 'Set API_KEY and GUID in Vercel project environment variables and redeploy.'
    });
  }

  try {
    const { message, image, metadata, fields } = req.body;

    console.log('Received request:', { message: message?.slice(0, 50), hasImage: !!image });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-API-Key': API_KEY,
      'X-GUID': GUID,
    };

    // Sanitize and normalize fields
    const sanitizedFields = Array.isArray(fields)
      ? fields
          .map(f => ({ name: String(f.name || ''), value: f.value == null ? '' : String(f.value) }))
          .filter(f => f.name && f.value)
      : [];

    // Ensure tankSize (if provided in metadata) is numeric when possible
    const normalizedMetadata = Object.assign({}, metadata || {});
    if (normalizedMetadata.tankSize) {
      const n = Number(normalizedMetadata.tankSize);
      if (!Number.isNaN(n)) normalizedMetadata.tankSize = n;
    }

    const payload = {
      UserInput: message || '',
      metadata: normalizedMetadata,
    };
    if (sanitizedFields.length) payload.fields = sanitizedFields;

    console.log('Payload for external API:', JSON.stringify(payload).slice(0, 1000));

    // Try request, retry once on 5xx
    let response = await fetch(EXTERNAL_API, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    let responseText = await response.text();

    if (!response.ok) {
      // If 5xx, retry once
      if (response.status >= 500) {
        console.warn('External API returned 5xx, retrying once...');
        await new Promise((r) => setTimeout(r, 500));
        response = await fetch(EXTERNAL_API, { method: 'POST', headers, body: JSON.stringify(payload) });
        responseText = await response.text();
      }

      console.error('External API error:', { status: response.status, statusText: response.statusText, body: responseText });

      // Attempt to parse executionId from nested details
      let executionId = null;
      try {
        const parsed = JSON.parse(responseText);
        if (parsed && parsed.details) {
          try {
            const d = JSON.parse(parsed.details);
            executionId = d.executionId || null;
          } catch (e) {
            // not JSON, skip
          }
        }
      } catch (e) {
        // responseText not JSON
      }

      const friendly = response.status >= 500
        ? '⚠️ Server error from AI service. Try again later or contact support with the executionId.'
        : `❌ API error ${response.status}: ${response.statusText}`;

      return res.status(response.status).json({
        error: friendly,
        status: response.status,
        statusText: response.statusText,
        details: responseText,
        executionId
      });
    }

    let responseData = {};
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { reply: responseText };
    }

    console.log('API response received:', JSON.stringify(responseData).slice(0, 500));
    
    // Transform response to include 'reply' field if not present
    if (!responseData.reply) {
      if (responseData.response) responseData.reply = responseData.response;
      else if (responseData.text) responseData.reply = responseData.text;
      else if (responseData.content) responseData.reply = responseData.content;
      else if (responseData.result) responseData.reply = responseData.result;
      else if (responseData.message) responseData.reply = responseData.message;
      else {
        responseData.reply = JSON.stringify(responseData);
      }
    }
    
    console.log('Forwarding to client with reply:', responseData.reply?.slice(0, 100));
    res.json(responseData);

  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}
