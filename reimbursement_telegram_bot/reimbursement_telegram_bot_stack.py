from aws_cdk import (
    # Duration,
    Stack,
    aws_ec2 as ec2,
    aws_iam as iam,
    # aws_sqs as sqs,
)
from constructs import Construct


class ReimbursementTelegramBotStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        vpc = ec2.Vpc(self, "ReimbursementTelegramBotVpc", max_azs=2)

        # Create security group
        security_group = ec2.SecurityGroup(
            self,
            "ReimbursementTelegramBotSecurityGroup",
            vpc=vpc,
            allow_all_outbound=True,
            description="Security group for the reimbursement telegram bot",
        )

        # Add ingress rule for the security group
        security_group.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.tcp(80),
        )

        # Create a new EC2 instance
        instance = ec2.Instance(
            self,
            "ReimbursementTelegramBotInstance",
            instance_type=ec2.InstanceType("t2.micro"),
            machine_image=ec2.AmazonLinuxImage(
                generation=ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023
            ),
            vpc=vpc,
            security_group=security_group,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
        )

        # Add EC2 Instance Connect permissions
        instance.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "AmazonSSMManagedInstanceCore"
            )
        )

        # User data to set up a simple web server
        instance.add_user_data(
            "yum update -y",
            "yum install -y httpd",
            "systemctl start httpd",
            "systemctl enable httpd",
            'echo "<h1>Hello World from $(hostname -f)</h1>" > /var/www/html/index.html',
        )

        # Output the public IP of the instance
        self.output = ec2.CfnOutput(
            self,
            "InstancePublicIp",
            value=instance.instance_public_ip,
            description="Public IP of the EC2 instance",
        )
        # The code that defines your stack goes here
