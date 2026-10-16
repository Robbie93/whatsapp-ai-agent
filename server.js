import express from 'express';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables (like your VERIFY_TOKEN)
dotenv.config();

const app = express();
app.use(express.json());

// Initialize Gemini AI
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    systemInstruction: "You are a helpful AI assistant for a hospitality business. You can answer customer questions about the menu, opening hours, and policies. Keep your answers brief, friendly, and formatted for WhatsApp."
});

// ==========================================
// 1. META WEBHOOK VERIFICATION ENDPOINT
// ==========================================
// Meta hits this URL once when you click "Verify and Save" in their dashboard
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Check if the token Meta sent matches the one in your Environment Variables
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
// Meta hits this URL every time someone sends a WhatsApp message to your bot
app.post('/webhook', async (req, res) => {
    // Acknowledge receipt to Meta immediately so they don't retry sending the message
    res.sendStatus(200);

    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        // If it's not a text message, ignore it
        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;
        console.log(`Received message from ${senderPhone}: ${userText}`);

        // Send the user's message to Gemini
        const chat = model.startChat();
        const result = await chat.sendMessage(userText);
        const aiReply = result.response.text();

        // Send the AI's reply back to the user via WhatsApp
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WhatsApp AI Agent running on port ${PORT}`));
