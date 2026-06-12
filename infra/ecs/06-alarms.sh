#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"
REGION=ap-northeast-2

# ALB/타깃그룹 메트릭 차원 (전체 이름 자동 조회)
ALB_FULL=$(aws elbv2 describe-load-balancers --names holdem-alb \
  --region $REGION --profile $PROFILE \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text | cut -d/ -f2-)
TG_FULL=$(aws elbv2 describe-target-groups --names holdem-tg \
  --region $REGION --profile $PROFILE \
  --query 'TargetGroups[0].TargetGroupArn' --output text | awk -F: '{print $NF}')

# ALB 5xx 응답 급증 알람 (5분 합계 10건 이상)
aws cloudwatch put-metric-alarm \
  --alarm-name holdem-alb-5xx \
  --alarm-description "ALB 5xx responses exceed 10 in 5 minutes" \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_ELB_5XX_Count \
  --dimensions Name=LoadBalancer,Value=$ALB_FULL \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 10 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --region $REGION --profile $PROFILE
echo "Alarm created: holdem-alb-5xx"

# Unhealthy 타깃 존재 알람 (1분 평균 1개 이상)
aws cloudwatch put-metric-alarm \
  --alarm-name holdem-unhealthy-targets \
  --alarm-description "One or more targets unhealthy" \
  --namespace AWS/ApplicationELB \
  --metric-name UnHealthyHostCount \
  --dimensions Name=TargetGroup,Value=$TG_FULL Name=LoadBalancer,Value=$ALB_FULL \
  --statistic Maximum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --region $REGION --profile $PROFILE
echo "Alarm created: holdem-unhealthy-targets"

echo "Done: CloudWatch alarms ready"
