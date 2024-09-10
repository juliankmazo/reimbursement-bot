import express from 'express';

const app = express();
const port = process.env.PORT || 80;

app.get('/', (req, res) => {
  res.json({ message: 'Hello World from Pulumi' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
