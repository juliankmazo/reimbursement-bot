import express from 'express';
import twilio from 'twilio';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 80;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

type ITelegramWebhookSchema = {
  message: {
    chat: {
      id: number;
    };
    text?: string;
    photo?: Array<{ file_id: string }>;
  };
};

app.post(`/telegram-webhook`, async (req, res) => {
  const payload = req.body as ITelegramWebhookSchema;

  try {
    // Check if there is an attached image
    if (payload.message.photo && payload.message.photo.length > 0) {
      console.log('Media detected, attempting to extract...');

      // Fetch the file from Telegram
      const fileId =
        payload.message.photo[payload.message.photo.length - 1].file_id;
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const filePath = fileResponse.data.result.file_path;
      const mediaResponse = await axios.get(
        `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`,
        {
          responseType: 'arraybuffer',
        }
      );

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
      1. The exact date of the transaction in the format of YYYY-MM-DD.
      2. The final amount of the transaction, including any tip or additional charges formatted as money with commas as the thousands separator and dots for decimals. Make sure is the total. The total is normally the highest amount in the invoice.
      3. A one line description of the invoice. Ideally include the name of the establishment and the type of expense: eg dinner at mcdonalds, drinks at irish pub`,
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

      const response = await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: payload.message.chat.id,
          text: `Invoice fields extracted:\n${fieldsResponse}`,
        }
      );

      console.log(response);

      res.json({ message: 'Message received and processed' });
    } else {
      // If there's no image or text extracted
      const response = await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: payload.message.chat.id,
          text: `Message received. I'm the 🐴: ${payload.message.text}`,
        }
      );

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
