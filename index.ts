import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';
import * as acm from '@pulumi/aws/acm';

const config = new pulumi.Config();
const containerPort = config.getNumber('containerPort') || 80;
const cpu = config.getNumber('cpu') || 512;
const memory = config.getNumber('memory') || 1024;

// An ECS cluster to deploy into
const cluster = new aws.ecs.Cluster('cluster', {
  name: 'reimbursement-bot-cluster',
});

// An Application Load Balancer to server the container endpoint to the internet
const loadBalancer = new awsx.lb.ApplicationLoadBalancer('loadBalancer', {
  name: 'reimbursement-bot-load-balancer',
});

// An ECR repository to store the container image
const repository = new awsx.ecr.Repository('repository', {
  name: 'reimbursement-bot-repository',
  forceDelete: true,
});

// Build and publish our application's container image from ./app to the ECR repository

const image = new awsx.ecr.Image('image', {
  imageName: 'reimbursement-bot-image',
  repositoryUrl: repository.url,
  context: './app',
  dockerfile: './app/Dockerfile',
  platform: 'linux/amd64',
});

// Deploy an ECS service on Fargate to host the application container
const service = new awsx.ecs.FargateService('service', {
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
    },
  },
});

// Create a CloudFront distribution
const distribution = new aws.cloudfront.Distribution('distribution', {
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
    minTtl: 0,
    defaultTtl: 0,
    maxTtl: 0,
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
});

// Export the HTTPS URL of the CloudFront distribution
export const url = pulumi.interpolate`https://${distribution.domainName}`;
