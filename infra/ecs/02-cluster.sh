#!/bin/bash
set -e
PROFILE="${PROFILE:-dsu-roleswitch}"
ACCOUNT_ID=026951011097
CLUSTER_NAME=holdem-cluster

# ECS 클러스터 생성
aws ecs create-cluster \
  --cluster-name $CLUSTER_NAME \
  --region ap-northeast-2 \
  --profile $PROFILE
echo "ECS cluster created: $CLUSTER_NAME"

# ECS-optimized AMI 조회
ECS_AMI=$(aws ssm get-parameters \
  --names /aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id \
  --region ap-northeast-2 \
  --profile $PROFILE \
  --query 'Parameters[0].Value' --output text)
echo "Using AMI: $ECS_AMI"

# EC2 Security Group ID 조회
EC2_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-ec2-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile $PROFILE)

# Launch Template 생성 (ECS 에이전트 자동 등록)
LT_ID=$(aws ec2 create-launch-template \
  --launch-template-name holdem-ecs-lt \
  --launch-template-data "{
    \"ImageId\": \"$ECS_AMI\",
    \"InstanceType\": \"t3.small\",
    \"SecurityGroupIds\": [\"$EC2_SG\"],
    \"IamInstanceProfile\": {\"Name\": \"holdem-ecs-instance-profile\"},
    \"UserData\": \"$(echo '#!/bin/bash
echo ECS_CLUSTER=holdem-cluster >> /etc/ecs/ecs.config' | base64 -w 0)\",
    \"TagSpecifications\": [{
      \"ResourceType\": \"instance\",
      \"Tags\": [{\"Key\": \"Name\", \"Value\": \"holdem-ecs-node\"}]
    }]
  }" \
  --profile $PROFILE \
  --query 'LaunchTemplate.LaunchTemplateId' --output text)
echo "Launch Template: $LT_ID"

# ASG 생성
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name holdem-ecs-asg \
  --launch-template "LaunchTemplateId=$LT_ID,Version=\$Latest" \
  --min-size 2 \
  --max-size 4 \
  --desired-capacity 2 \
  --vpc-zone-identifier "subnet-0dd262b44669174f8,subnet-04bea6a2e3d9da9f5,subnet-02e3f5e14bf2a7282" \
  --profile $PROFILE
echo "ASG created: holdem-ecs-asg"

# ECS Capacity Provider 생성
ASG_ARN=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names holdem-ecs-asg \
  --profile $PROFILE \
  --query 'AutoScalingGroups[0].AutoScalingGroupARN' --output text)

aws ecs create-capacity-provider \
  --name holdem-ecs-cp \
  --auto-scaling-group-provider "{
    \"autoScalingGroupArn\": \"$ASG_ARN\",
    \"managedScaling\": {
      \"status\": \"ENABLED\",
      \"targetCapacity\": 80,
      \"minimumScalingStepSize\": 1,
      \"maximumScalingStepSize\": 2
    },
    \"managedTerminationProtection\": \"DISABLED\"
  }" \
  --region ap-northeast-2 \
  --profile $PROFILE
echo "Capacity Provider created: holdem-ecs-cp"

# 클러스터에 Capacity Provider 연결
aws ecs put-cluster-capacity-providers \
  --cluster $CLUSTER_NAME \
  --capacity-providers holdem-ecs-cp \
  --default-capacity-provider-strategy "[{\"capacityProvider\": \"holdem-ecs-cp\", \"weight\": 1}]" \
  --region ap-northeast-2 \
  --profile $PROFILE

echo "Done: ECS cluster ready"
