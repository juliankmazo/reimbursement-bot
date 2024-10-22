import express from 'express';
import axios from 'axios';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';

const app = express();
const port = process.env.PORT || 80;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];
const GOOGLE_APPLICATION_CREDENTIALS = './google-key.json';

const uploadMediaToGoogleDrive = async ({
  auth,
  receiptFileUrl,
  fileName,
}: {
  auth: JWT;
  receiptFileUrl: string;
  fileName?: string;
}) => {
  const drive = google.drive({ version: 'v3', auth });
  const media = {
    mimeType: 'image/jpeg',
    body: (await axios.get(receiptFileUrl, { responseType: 'stream' })).data,
  };

  try {
    const uploadedFile = await drive.files.create({
      requestBody: {
        parents: ['1UM0eF0yB4EOPEVfZ0Ye7uyo0wQJe_9Yz'],
        name: fileName,
      },
      media: media,
      fields: 'id,permissions',
    });

    if (uploadedFile.data?.id) {
      await drive.permissions.create({
        fileId: uploadedFile.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    console.log('File uploaded to Google Drive with ID:', uploadedFile.data.id);
    return {
      fileUrl: `https://drive.google.com/file/d/${uploadedFile.data.id}/view?usp=sharing`,
    };
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error);
    throw error;
  }
};

const sendToGoogleSheet = async (parsedFieldsResponse: {
  transactionDate: string;
  originalAmount: number;
  amountInUSD: number;
  currency: string;
  description: string;
  conversionRate: number;
  receiptFileUrl: string;
}) => {
  const spreadsheetId = '1RWQsMfO_J5aqobNdHC0c5mCCIJq4xOF_gKWcMuP8U9M';
  const range = 'Form Responses 1'; // Update this to the desired range

  try {
    const auth = new JWT({
      keyFile: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });

    const { fileUrl } = await uploadMediaToGoogleDrive({
      auth,
      receiptFileUrl: parsedFieldsResponse.receiptFileUrl,
      fileName: parsedFieldsResponse.description,
    });

    const fieldsToSend = [
      'Timestamp',
      'Name',
      'Email',
      'Item Description',
      'Date of the Transaction',
      'Date received (Reimbursement requested)',
      'Amount in USD (convert to USD for other currencies)',
      'PDF/Copy of Receipt or invoice',
    ];

    const valuesToSend = fieldsToSend.map((field) => {
      switch (field) {
        case 'Timestamp':
          return new Date().toISOString();
        case 'Name':
          return 'Julian';
        case 'Email':
          return 'julian@snappr.com';
        case 'Item Description':
          return parsedFieldsResponse.description;
        case 'Date of the Transaction':
          return parsedFieldsResponse.transactionDate;
        case 'Date received (Reimbursement requested)':
          return '2024-10-21';
        case 'Amount in USD (convert to USD for other currencies)':
          return parsedFieldsResponse.amountInUSD;
        case 'PDF/Copy of Receipt or invoice':
          return fileUrl;
        default:
          return '';
      }
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS', // Ensure data is always appended
      requestBody: { values: [valuesToSend] },
    });

    console.log('Data sent to Google Sheet successfully');
    return response.data;
  } catch (error) {
    console.error('Error sending data to Google Sheet:', error);
    throw error;
  }
};

const extractInvoiceFieldsFromImage = async ({
  base64Image,
}: {
  base64Image: string;
}) => {
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
              text: 'Analyze the attached invoice image and extract the specified details. Respond ONLY with the JSON object, no additional text.',
              //         text: `Please analyze the attached invoice image and extract the following details in a structured JSON format:
              //         {
              //           "transactionDate": "YYYY-MM-DD",
              //           "originalAmount": 123456,
              //           "amountInUSD": 123456,
              //           "currency": "USD",
              //           "description": "Dinner at McDonald's",
              //           "conversionRate": 123456,
              //         }

              // where
              // \`transactionDate\`: is the exact date of the transaction in the format of YYYY-MM-DD.
              // \`originalAmount\`: is the original amount of the transaction, including any tip or additional charges.
              // \`amountInUSD\`: is the amount of the transaction in USD. If the original amount is in COP, you should convert it to USD using the current exchange rate on the transaction date plus a 3% fee.
              // \`currency\`: is the currency of the transaction. It can be USD or COP
              // \`description\`: is a one line description of the invoice. Ideally include the name of the establishment and the type of expense: eg dinner at mcdonalds, drinks at irish pub
              // \`conversionRate\`: is the conversion rate of the transaction in the format of 1234.56. It should be a floating point number.
              // `,
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
      functions: [
        {
          name: 'extract_invoice_data',
          description: 'Extracts invoice data from an image',
          parameters: {
            type: 'object',
            properties: {
              transactionDate: {
                type: 'string',
                description:
                  'The exact date of the transaction in YYYY-MM-DD format',
              },
              originalAmount: {
                type: 'number',
                description:
                  'The original amount of the transaction, including any tip or additional charges',
              },
              amountInUSD: {
                type: 'number',
                description:
                  'The amount of the transaction in USD. If original amount is in COP, convert to USD using current exchange rate plus 3% fee. Use python code for this operation',
              },
              currency: {
                type: 'string',
                enum: ['USD', 'COP'],
                description: 'The currency of the transaction',
              },
              description: {
                type: 'string',
                description:
                  'A one-line description of the invoice, including establishment name and expense type',
              },
              conversionRate: {
                type: 'number',
                description:
                  'The conversion rate of the transaction as a floating point number',
              },
            },
            required: [
              'transactionDate',
              'originalAmount',
              'amountInUSD',
              'currency',
              'description',
              'conversionRate',
            ],
          },
        },
      ],
      function_call: { name: 'extract_invoice_data' },
      response_format: { type: 'json_object' },
      max_tokens: 300,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // const fieldsResponse = openAIResponse.data.choices[0].message.content;
  const functionCall = openAIResponse.data.choices[0].message.function_call;

  const parsedFieldsResponse =
    functionCall?.name === 'extract_invoice_data'
      ? JSON.parse(functionCall.arguments)
      : null;

  return { parsedFieldsResponse, functionCall };
};

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

      const receiptFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

      const mediaResponse = await axios.get(receiptFileUrl, {
        responseType: 'arraybuffer',
      });

      // Encode the image in base64
      const base64Image = Buffer.from(mediaResponse.data).toString('base64');

      // Send the image to OpenAI Vision API to extract details
      const { parsedFieldsResponse } = await extractInvoiceFieldsFromImage({
        base64Image,
      });

      console.log(parsedFieldsResponse);

      await sendToGoogleSheet({
        ...parsedFieldsResponse,
        receiptFileUrl,
      });

      const response = await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: payload.message.chat.id,
          text: `Invoice fields extracted:\n${JSON.stringify(
            parsedFieldsResponse
          )}`,
        }
      );

      console.log('Response sent to Telegram with status:', response.status);

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
    didWeGetTwilioAccount: process.env.TELEGRAM_BOT_TOKEN != null,
    didWeGetTwilioAuthToken: process.env.TWILIO_AUTH_TOKEN != null,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
