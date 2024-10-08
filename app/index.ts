import express from 'express';
import twilio from 'twilio';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 80;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

type ITwilioWebhookSchema = {
  Body: string;
  From: string;
  To: string;
  MessageSid: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
};

app.post('/webhook', async (req, res) => {
  const payload = req.body as ITwilioWebhookSchema;

  try {
    // Check if there is an attached image
    if (parseInt(payload.NumMedia) > 0 && payload.MediaUrl0) {
      console.log('Media detected, attempting to extract...');

      // Fetch image from Twilio's MediaUrl
      const mediaResponse = await axios.get(payload.MediaUrl0, {
        responseType: 'arraybuffer',
      });

      // Encode the image in base64
      const base64Image = Buffer.from(mediaResponse.data).toString('base64');

      // Send the image to OpenAI Vision API to extract details
      const openAIResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an AI specialized in accounting and extracting data from invoices. You are exceptionally good at recognizing image-based data and providing structured information from accounting documents.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Please analyze the attached invoice image and extract the following details in a structured format:
1. The exact date of the transaction (including any formatting as shown on the invoice).
2. The total amount of the transaction, including any tip or additional charges.
3. A brief description of the transaction, including any information about the vendor, items, or services provided.`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const fieldsResponse = openAIResponse.data.choices[0].message.content;

      const response = await twilioClient.messages.create({
        body: `Invoice fields extracted:\n${fieldsResponse}`,
        from: payload.To,
        to: payload.From,
      });

      console.log(response);

      res.json({ message: 'Message received and processed' });
    } else {
      // If there's no image or text extracted
      const response = await twilioClient.messages.create({
        body: `Message received. I'm the 🐴: ${payload.Body}`,
        from: payload.To,
        to: payload.From,
      });

      console.log(response);

      res.json({ message: 'Message received, no invoice detected' });
    }
  } catch (error) {
    console.error('Error processing the message:', error);
    res.status(500).json({ error: 'Failed to process the request' });
  }
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
