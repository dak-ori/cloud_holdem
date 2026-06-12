#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"
REGION=ap-northeast-2
CLUSTER=holdem-cluster

EC2_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-ec2-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile $PROFILE)

TG_ARN=$(aws elbv2 describe-target-groups \
  --names holdem-tg \
  --region $REGION \
  --profile $PROFILE \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# ECS Service 생성
aws ecs create-service \
  --cluster $CLUSTER \
  --service-name holdem-service \
  --task-definition holdem-server \
  --desired-count 2 \
  --launch-type EC2 \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-0dd262b44669174f8,subnet-04bea6a2e3d9da9f5,subnet-02e3f5e14bf2a7282],
    securityGroups=[$EC2_SG],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=holdem-server,containerPort=3001" \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200" \
  --region $REGION \
  --profile $PROFILE
echo "ECS Service created"

# Application Auto Scaling 등록
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/${CLUSTER}/holdem-service" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 8 \
  --region $REGION \
  --profile $PROFILE

# CPU 70% 스케일링 정책
aws application-autoscaling put-scaling-policy \
  --policy-name holdem-cpu-scaling \
  --service-namespace ecs \
  --resource-id "service/${CLUSTER}/holdem-service" \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region $REGION \
  --profile $PROFILE
echo "Auto Scaling policy attached"

echo "Done: ECS service running"
