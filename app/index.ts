import express from 'express';
import twilio from 'twilio';

const app = express();
const port = process.env.PORT || 80;

app.use(express.urlencoded({ extended: false }));

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

type ITwilioWebhookSchema = {
  Body: string;
  From: string;
  To: string;
  MessageSid: string;
};
app.post('/webhook', async (req, res) => {
  const payload = req.body as ITwilioWebhookSchema;

  const response = await twilioClient.messages.create({
    body: `Message received. I'm the 🐴: ${payload.Body}`,
    from: payload.To,
    to: payload.From,
  });

  console.log(response);

  res.json({ message: 'Message received' });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Hello World from Pulumi',
    didWeGetTwilioAccount: process.env.TWILIO_ACCOUNT_SID != null,
    didWeGetTwilioAuthToken: process.env.TWILIO_AUTH_TOKEN != null,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
