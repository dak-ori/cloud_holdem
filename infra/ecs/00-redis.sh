#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"

# Redis 서브넷 그룹
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name holdem-redis-subnet \
  --cache-subnet-group-description "Cloud Holdem Redis subnet group" \
  --subnet-ids subnet-0dd262b44669174f8 subnet-04bea6a2e3d9da9f5 subnet-02e3f5e14bf2a7282 \
  --profile $PROFILE

REDIS_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-redis-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile $PROFILE)

aws elasticache create-cache-cluster \
  --cache-cluster-id holdem-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.1 \
  --num-cache-nodes 1 \
  --cache-subnet-group-name holdem-redis-subnet \
  --security-group-ids $REDIS_SG \
  --region ap-northeast-2 \
  --profile $PROFILE

echo "Waiting for Redis cluster to be available (~5min)..."
aws elasticache wait cache-cluster-available \
  --cache-cluster-id holdem-redis \
  --region ap-northeast-2 \
  --profile $PROFILE

REDIS_HOST=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id holdem-redis \
  --show-cache-node-info \
  --region ap-northeast-2 \
  --profile $PROFILE \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

echo "Redis endpoint: $REDIS_HOST"
