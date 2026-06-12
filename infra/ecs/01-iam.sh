#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"
ACCOUNT_ID=026951011097
HISTORY_BUCKET=holdem-history-026951011097

# ECS Task Role (컨테이너 → S3 쓰기)
aws iam create-role \
  --role-name holdem-ecs-task-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --profile $PROFILE

aws iam put-role-policy \
  --role-name holdem-ecs-task-role \
  --policy-name holdem-s3-history-write \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:PutObject\"],
      \"Resource\": \"arn:aws:s3:::${HISTORY_BUCKET}/*\"
    }]
  }" \
  --profile $PROFILE

echo "Task Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/holdem-ecs-task-role"

# ECS Execution Role (ECS → ECR pull, CloudWatch 로그 쓰기)
aws iam create-role \
  --role-name holdem-ecs-execution-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --profile $PROFILE

aws iam attach-role-policy \
  --role-name holdem-ecs-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
  --profile $PROFILE

echo "Execution Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/holdem-ecs-execution-role"

# ECS Instance Role (EC2 → ECS 등록, ECR pull)
aws iam create-role \
  --role-name holdem-ecs-instance-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --profile $PROFILE

aws iam attach-role-policy \
  --role-name holdem-ecs-instance-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role \
  --profile $PROFILE

aws iam attach-role-policy \
  --role-name holdem-ecs-instance-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly \
  --profile $PROFILE

# Instance Profile (EC2에 Role 연결하려면 필요)
aws iam create-instance-profile \
  --instance-profile-name holdem-ecs-instance-profile \
  --profile $PROFILE

aws iam add-role-to-instance-profile \
  --instance-profile-name holdem-ecs-instance-profile \
  --role-name holdem-ecs-instance-role \
  --profile $PROFILE

echo "Instance Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/holdem-ecs-instance-role"
echo "Done: IAM roles created"
