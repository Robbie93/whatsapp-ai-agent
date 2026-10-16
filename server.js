import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ==========================================
// DIRECT GEMINI API CALL WITH RETRIES
// ==========================================
async function callGemini(userText, retries = 3, delay = 1000) {
    const apiKey = process.env.GEMINI_API_KEY;
    // Using the stable, standard Gemini endpoint directly
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{ text: userText }]
        }],
        systemInstruction: {
            parts: [{ text: "You are a helpful AI assistant for a hospitality business. Keep your answers brief, friendly, and formatted for WhatsApp." }]
        }
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                return data.candidates[0].content.parts[0].text;
            }

            console.warn(`Gemini API Attempt ${attempt} issue:`, JSON.stringify(data));
            if (attempt === retries) throw new Error(data.error?.message || "Failed to get response from Gemini");

        } catch (err) {
            console.error(`Attempt ${attempt} failed: ${err.message}`);
            if (attempt === retries) throw err;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
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
    res.sendStatus(200); // Always acknowledge immediately to Meta

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
