import express from 'express';
import fetch from 'node-fetch';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize official Google GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Call Gemini using the official auto-updating 'gemini-flash-latest' alias
async function callGemini(userText) {
    const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: userText,
        config: {
            systemInstruction: "You are a helpful AI assistant for a hospitality business. Keep your answers brief, friendly, and formatted for WhatsApp."
        }
    });

    return response.text;
}

// ==========================================
// 1. META WEBHOOK VERIFICATION ENDPOINT
// ==========================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ==========================================
// 2. WHATSAPP MESSAGE RECEIVER
// ==========================================
app.post('/webhook', async (req, res) => {
    // Always acknowledge receipt immediately to Meta
    res.sendStatus(200);

    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;
        console.log(`Received message from ${senderPhone}: ${userText}`);

        // Get AI reply
        const aiReply = await callGemini(userText);
        console.log(`AI Reply generated: ${aiReply}`);

        // Send WhatsApp reply
        await sendWhatsAppMessage(senderPhone, aiReply);

    } catch (error) {
        console.error("Error in webhook processing:", error.message);
    }
});

// ==========================================
// 3. WHATSAPP SENDER FUNCTION
// ==========================================
async function sendWhatsAppMessage(toPhone, text) {
    const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: toPhone,
            type: "text",
            text: { preview_url: false, body: text }
        })
    });

    const data = await response.json();
    if (data.error) {
        console.error("WhatsApp API Error:", data.error);
    } else {
        console.log("WhatsApp message delivered successfully!");
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
