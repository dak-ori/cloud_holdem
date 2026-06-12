#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"
ACCOUNT_ID=026951011097
REGION=ap-northeast-2

REDIS_HOST=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id holdem-redis \
  --show-cache-node-info \
  --region $REGION \
  --profile $PROFILE \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

# CloudWatch 로그 그룹 생성
aws logs create-log-group \
  --log-group-name /ecs/holdem-server \
  --region $REGION \
  --profile $PROFILE 2>/dev/null || true

# Task Definition 등록
# 헬스체크는 wget 사용 — node:20-alpine 이미지에 curl이 없음 (busybox wget만 존재)
aws ecs register-task-definition \
  --family holdem-server \
  --network-mode awsvpc \
  --requires-compatibilities EC2 \
  --cpu 256 \
  --memory 512 \
  --task-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/holdem-ecs-task-role" \
  --execution-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/holdem-ecs-execution-role" \
  --container-definitions "[
    {
      \"name\": \"holdem-server\",
      \"image\": \"${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/holdem-server:latest\",
      \"portMappings\": [{\"containerPort\": 3001, \"protocol\": \"tcp\"}],
      \"essential\": true,
      \"environment\": [
        {\"name\": \"REDIS_HOST\", \"value\": \"${REDIS_HOST}\"},
        {\"name\": \"REDIS_PORT\", \"value\": \"6379\"},
        {\"name\": \"PORT\", \"value\": \"3001\"},
        {\"name\": \"HISTORY_BUCKET\", \"value\": \"holdem-history-026951011097\"},
        {\"name\": \"AWS_REGION\", \"value\": \"${REGION}\"}
      ],
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/holdem-server\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"ecs\"
        }
      },
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"wget -q --spider http://localhost:3001/health || exit 1\"],
        \"interval\": 30,
        \"timeout\": 5,
        \"retries\": 3,
        \"startPeriod\": 10
      }
    }
  ]" \
  --region $REGION \
  --profile $PROFILE \
  --query 'taskDefinition.taskDefinitionArn' --output text

echo "Done: Task Definition registered"
