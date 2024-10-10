import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';
import axios from 'axios';

const config = new pulumi.Config();
const containerPort = config.getNumber('containerPort') || 80;
const cpu = config.getNumber('cpu') || 512;
const memory = config.getNumber('memory') || 1024;

const OPENAI_API_KEY = config.requireSecret('OPENAI_API_KEY');
const TELEGRAM_BOT_TOKEN = config.requireSecret('TELEGRAM_BOT_TOKEN');
const DB_PASSWORD = config.requireSecret('DB_PASSWORD');
const DB_USERNAME = config.requireSecret('DB_USERNAME');

const TAGS = { Name: 'diablo-experiments' };

// An ECS cluster to deploy into
const cluster = new aws.ecs.Cluster('cluster', {
  name: 'reimbursement-bot-cluster',
  tags: TAGS,
});

// An Application Load Balancer to server the container endpoint to the internet
const loadBalancer = new awsx.lb.ApplicationLoadBalancer('loadBalancer', {
  name: 'reimbursement-bot-load-balancer',
  tags: TAGS,
});

// An ECR repository to store the container image
const repository = new awsx.ecr.Repository('repository', {
  name: 'reimbursement-bot-repository',
  forceDelete: true,
  tags: TAGS,
});

// Build and publish our application's container image from ./app to the ECR repository

const image = new awsx.ecr.Image('image', {
  imageName: 'reimbursement-bot-image',
  repositoryUrl: repository.url,
  context: './app',
  dockerfile: './app/Dockerfile',
  platform: 'linux/amd64',
});

// Create a new VPC to get subnet IDs
const vpc = new awsx.ec2.Vpc('diabloReimbursementBotVpc', {
  cidrBlock: '10.0.0.0/16',
  tags: TAGS,
});

// Create a serverless PostgreSQL RDS instace
const dbSubnetGroup = new aws.rds.SubnetGroup(
  'diablo_reimbursement_bot_db_subnet_group',
  {
    subnetIds: vpc.privateSubnetIds,
    tags: TAGS,
  }
);

const dbSecurityGroup = new aws.ec2.SecurityGroup(
  'diabloReimbursementBotDbSecurityGroup',
  {
    vpcId: vpc.vpcId,
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        cidrBlocks: ['0.0.0.0/0'], // Allow inbound traffic from any IP address 😅
      },
    ],
    egress: [
      {
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
    tags: TAGS,
  }
);

const db = new aws.rds.Cluster('diabloReimbursementBotServerlessPostgres', {
  engine: 'aurora-postgresql',
  engineMode: 'serverless',
  databaseName: 'reimbursement',
  masterUsername: DB_USERNAME,
  masterPassword: DB_PASSWORD,
  dbSubnetGroupName: dbSubnetGroup.name,
  deletionProtection: true,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  scalingConfiguration: {
    autoPause: true,
    minCapacity: 2,
    maxCapacity: 2,
    secondsUntilAutoPause: 300,
  },
  skipFinalSnapshot: false,
  tags: TAGS,
});

// Deploy an ECS service on Fargate to host the application container
const service = new awsx.ecs.FargateService(
  'diabloReimbursementBotFargateService',
  {
    name: 'reimbursement-bot-fargate-service',
    cluster: cluster.arn,
    assignPublicIp: true,
    taskDefinitionArgs: {
      container: {
        name: 'reimbursement-bot',
        image: image.imageUri,
        cpu,
        memory,
        essential: true,
        portMappings: [
          {
            containerPort,
            hostPort: containerPort,
            targetGroup: loadBalancer.defaultTargetGroup,
          },
        ],
        environment: [
          { name: 'OPENAI_API_KEY', value: OPENAI_API_KEY },
          { name: 'TELEGRAM_BOT_TOKEN', value: TELEGRAM_BOT_TOKEN },
          {
            name: 'DATABASE_URL',
            value: pulumi.interpolate`postgresql://${DB_USERNAME}:${DB_PASSWORD}@${db.endpoint}:${db.port}/${db.databaseName}`,
          },
        ],
      },
    },
    tags: TAGS,
  }
);

// Create a CloudFront distribution
const distribution = new aws.cloudfront.Distribution(
  'diabloReimbursementBotDistribution',
  {
    enabled: true,
    httpVersion: 'http2',
    defaultCacheBehavior: {
      targetOriginId: loadBalancer.loadBalancer.arn,
      viewerProtocolPolicy: 'redirect-to-https',
      allowedMethods: [
        'GET',
        'HEAD',
        'OPTIONS',
        'PUT',
        'POST',
        'PATCH',
        'DELETE',
      ],
      cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
      forwardedValues: {
        queryString: true,
        headers: [
          'Origin',
          'Access-Control-Request-Headers',
          'Access-Control-Request-Method',
        ],
        cookies: {
          forward: 'all',
        },
      },
      compress: true,
    },
    origins: [
      {
        originId: loadBalancer.loadBalancer.arn,
        domainName: loadBalancer.loadBalancer.dnsName,
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: 'http-only',
          originSslProtocols: ['TLSv1.2'],
        },
      },
    ],
    priceClass: 'PriceClass_100',
    restrictions: {
      geoRestriction: {
        restrictionType: 'none',
      },
    },
    viewerCertificate: {
      cloudfrontDefaultCertificate: true,
    },
    tags: TAGS,
  }
);

// Export the HTTPS URL of the CloudFront distribution
export const url = pulumi.interpolate`https://${distribution.domainName}`;
export const dbEndpoint = pulumi.interpolate`${db.endpoint}`;

// After creating the distribution, set the Telegram webhook

pulumi
  .all([distribution.domainName, TELEGRAM_BOT_TOKEN])
  .apply(([domainName, botToken]) => {
    const telegramWebhookUrl = `https://${domainName}/webhook`;

    axios
      .post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: telegramWebhookUrl,
      })
      .then((response) => {
        console.log('Telegram webhook set successfully:', response.data);
      })
      .catch((error) => {
        console.error(
          'Error setting Telegram webhook:',
          error.response ? error.response.data : error.message
        );
      });
  });
