import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ==========================================
// 1. GEMINI AI INTEGRATION
// ==========================================
async function callGemini(userText) {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{ text: userText }]
        }],
        systemInstruction: {
            parts: [{ text: "You are a helpful AI assistant for a hospitality business. Keep your answers brief, friendly, and formatted for WhatsApp." }]
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Gemini Error:", data);
        return "I am currently experiencing high demand, please try again in a moment!";
    }

    return data.candidates[0].content.parts[0].text;
}

// ==========================================
// 2. META WEBHOOK VERIFICATION
// ==========================================
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// ==========================================
// 3. WHATSAPP MESSAGE RECEIVER
// ==========================================
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Acknowledge Meta immediately

    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;
        console.log(`Received message from ${senderPhone}: ${userText}`);

        // Generate AI Reply instead of echo
        const replyText = await callGemini(userText);
        
        await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: senderPhone,
                text: { body: replyText }
            })
        });
    } catch (error) {
        console.error("Error:", error);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('AI Agent running'));
