#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"

ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile $PROFILE)

# ALB 생성
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name holdem-alb \
  --subnets subnet-0dd262b44669174f8 subnet-04bea6a2e3d9da9f5 subnet-02e3f5e14bf2a7282 \
  --security-groups $ALB_SG \
  --region ap-northeast-2 \
  --profile $PROFILE \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
echo "ALB ARN: $ALB_ARN"

# ALB 유휴 타임아웃 3600초 (WebSocket 유지)
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn $ALB_ARN \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600 \
  --region ap-northeast-2 \
  --profile $PROFILE

# Target Group 생성 (target-type: ip, awsvpc 모드)
TG_ARN=$(aws elbv2 create-target-group \
  --name holdem-tg \
  --protocol HTTP \
  --port 3001 \
  --vpc-id vpc-0e4283922b93ba6ea \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region ap-northeast-2 \
  --profile $PROFILE \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
echo "Target Group ARN: $TG_ARN"

# HTTP Listener 생성
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
  --region ap-northeast-2 \
  --profile $PROFILE
echo "Listener created"

# ALB DNS 출력
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region ap-northeast-2 \
  --profile $PROFILE \
  --query 'LoadBalancers[0].DNSName' --output text)
echo "ALB DNS: $ALB_DNS"
echo "Done: ALB ready"
