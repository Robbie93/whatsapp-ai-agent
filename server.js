import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// 1. WEBHOOK VERIFICATION
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// 2. RECEIVE AND ECHO MESSAGE
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Acknowledge Meta immediately

    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || message.type !== 'text') return;

        const senderPhone = message.from;
        const userText = message.text.body;
        
        // HARDCODED REPLY - NO AI INVOLVED
        const replyText = `Success! The server received your message: "${userText}". The WhatsApp connection is 100% working.`;
        
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
        console.error(error);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Echo server running'));
