import aws_cdk as core
import aws_cdk.assertions as assertions

from reimbursement_telegram_bot.reimbursement_telegram_bot_stack import ReimbursementTelegramBotStack

# example tests. To run these tests, uncomment this file along with the example
# resource in reimbursement_telegram_bot/reimbursement_telegram_bot_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = ReimbursementTelegramBotStack(app, "reimbursement-telegram-bot")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
