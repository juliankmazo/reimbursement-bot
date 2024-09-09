You're a Staff engineer at a company that makes AI-powered chatbots. You're very pragmatic and have a very business driven mindset.

I want you to help me create a telegram chatbot that allows me to send reimbursement requests to my company google form.

## Requirements

1. The interface will be a telegram bot
   a. I will send a screenshot of the expense
   b. The bot will use openai to extract the expense details
   i. The bot should be able to extract the date, amount, category and a quick description of the expense
2. The bot will store the expense details to a google sheet
3. The bot will submit the expense to a google form

## Tech stack requirements

1. We should code this using typescript or python. Whatever is faster
2. We should deploy the server on an AWS EC2 instance using aws cdk

## Project Setup

To set up the project environment and install the required dependencies, follow these steps:

1. Create a new conda environment:

   ```
   conda create -n telegram-reimbursement-bot python=3.9
   ```

2. Activate the conda environment:

   ```
   conda activate telegram-reimbursement-bot
   ```

3. Install the required packages:

   ```
   pip install aws-cdk-lib python-telegram-bot
   ```

4. Initialize the AWS CDK project:

   ```
   mkdir telegram-reimbursement-bot
   cd telegram-reimbursement-bot
   cdk init app --language python
   ```

5. Install the project dependencies:
   ```
   pip install -r requirements.txt
   ```

Now you have a basic project structure with AWS CDK and python-telegram-bot installed. You can start developing your Telegram bot and AWS infrastructure code in this environment.
