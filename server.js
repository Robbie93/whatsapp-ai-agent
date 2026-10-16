import express from 'express';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Gemini AI with standard model
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "You are a helpful AI assistant for a hospitality business. You can answer customer questions about the menu, opening hours, and policies. Keep your answers brief, friendly, and formatted for WhatsApp."
});

// Helper function to retry when Google returns 503 (Server Overloaded)
async function generateWithRetry(userText, retries = 3, delay = 1500) {
    for (let i = 0; i < retries; i++) {
        try {
            const chat = model.startChat();
            const result = await chat.sendMessage(userText);
            return result.response.text();
        } catch (error) {
            console.warn(`Attempt ${i + 1} failed (${error.message}). Retrying in ${delay}ms...`);
            if (i === retries - 1) throw error; // Re-throw if all attempts fail
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
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
        console.log('Webhook successfully verified!');
        res.status(200).send(challenge); 
    } else {
        console.error('Failed validation. Tokens do not match.');
        res.sendStatus(403);
    }
});

// ==========================================
// 2. WHATSAPP MESSAGE RECEIVER
// ==========================================
app.post('/webhook', async (req, res) => {
    // Acknowledge receipt to Meta immediately
    res.sendStatus(200);

    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;
        console.log(`Received message from ${senderPhone}: ${userText}`);

        // Generate response with auto-retry on 503 overload
        const aiReply = await generateWithRetry(userText);

        // Send back to WhatsApp user
        await sendWhatsAppMessage(senderPhone, aiReply);

    } catch (error) {
        console.error("Error processing message:", error);
    }
});

// ==========================================
// 3. WHATSAPP SENDER FUNCTION
// ==========================================
async function sendWhatsAppMessage(toPhone, text) {
    try {
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
            console.error("Failed to send WhatsApp message:", data.error);
        } else {
            console.log("Message sent successfully!");
        }
    } catch (error) {
        console.error("Network error sending WhatsApp message:", error);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WhatsApp AI Agent running on port ${PORT}`));
