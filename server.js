import express from 'express';
import fetch from 'node-fetch';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize the official Google GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Call Gemini with a 5-attempt auto-retry for 503 high-demand errors
async function callGemini(userText, retries = 5, delay = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: userText,
                config: {
                    systemInstruction: "You are a helpful AI assistant for a hospitality business. Keep your answers brief, friendly, and formatted for WhatsApp."
                }
            });
            return response.text;
        } catch (error) {
            console.warn(`Attempt ${attempt} failed due to Google API demand:`, error.message);
            if (attempt === retries) {
                return "I am currently experiencing high demand, please try again in a moment!";
            }
            // Wait a few seconds before trying again
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    // Always acknowledge Meta immediately
    res.sendStatus(200);

    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;

        const aiReply = await callGemini(userText);
        
        await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: senderPhone,
                text: { body: aiReply }
            })
        });
    } catch (error) {
        console.error("Error:", error);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('AI Agent running'));
