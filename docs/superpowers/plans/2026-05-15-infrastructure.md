# Cloud Hold'em Infrastructure Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AWS 리소스 생성 및 Cloud Hold'em 서비스 배포 환경 구성

**Architecture:** Default VPC 활용 (신규 VPC 불필요). EC2 Auto Scaling Group + ALB + ElastiCache Redis + S3 두 버킷. 모든 리소스는 ap-northeast-2(서울) 리전.

**Tech Stack:** AWS CLI (profile: dsu-roleswitch), Amazon Linux 2023, Node.js 20

---

## 기존 리소스 (재사용)

| 리소스 | ID | 비고 |
|--------|-----|------|
| VPC | `vpc-0e4283922b93ba6ea` | Default VPC, 172.31.0.0/16 |
| Subnet A (ap-northeast-2a) | `subnet-0dd262b44669174f8` | |
| Subnet B (ap-northeast-2b) | `subnet-04bea6a2e3d9da9f5` | |
| Subnet C (ap-northeast-2c) | `subnet-02e3f5e14bf2a7282` | |
| AMI | `ami-000913a389568d579` | Amazon Linux 2023 minimal |

## 생성할 리소스 목록

```
S3 버킷 A         (holdem-client-{account})     ← React 정적 호스팅
S3 버킷 B         (holdem-history-{account})    ← 게임 히스토리
보안 그룹 ALB      (holdem-alb-sg)              ← 80/443 인바운드
보안 그룹 EC2      (holdem-ec2-sg)              ← ALB SG에서만 3001
보안 그룹 Redis    (holdem-redis-sg)            ← EC2 SG에서만 6379
IAM 역할          (holdem-ec2-role)             ← S3 히스토리 쓰기 권한
EC2 키 페어       (holdem-key)
ElastiCache        (holdem-redis)               ← Redis 7, single-node
ALB               (holdem-alb)                 ← WebSocket 지원
ALB 타깃 그룹     (holdem-tg)
EC2 Launch Template (holdem-lt)
Auto Scaling Group  (holdem-asg)              ← min 1, max 4
```

---

### Task 1: S3 버킷 생성

**Files:**
- 없음 (AWS 리소스 생성)

- [ ] **Step 1: 클라이언트 버킷 생성 (정적 호스팅)**

```bash
aws s3api create-bucket \
  --bucket holdem-client-026951011097 \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2 \
  --profile dsu-roleswitch
```

Expected: `{"Location": "http://holdem-client-026951011097.s3.amazonaws.com/"}`

- [ ] **Step 2: 히스토리 버킷 생성**

```bash
aws s3api create-bucket \
  --bucket holdem-history-026951011097 \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2 \
  --profile dsu-roleswitch
```

- [ ] **Step 3: 클라이언트 버킷 정적 웹 호스팅 설정**

```bash
aws s3api put-bucket-website \
  --bucket holdem-client-026951011097 \
  --website-configuration '{
    "IndexDocument": {"Suffix": "index.html"},
    "ErrorDocument": {"Key": "index.html"}
  }' \
  --profile dsu-roleswitch
```

- [ ] **Step 4: 클라이언트 버킷 퍼블릭 읽기 허용**

```bash
# 퍼블릭 액세스 차단 해제
aws s3api put-public-access-block \
  --bucket holdem-client-026951011097 \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --profile dsu-roleswitch

# 버킷 정책으로 퍼블릭 읽기 허용
aws s3api put-bucket-policy \
  --bucket holdem-client-026951011097 \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::holdem-client-026951011097/*"
    }]
  }' \
  --profile dsu-roleswitch
```

- [ ] **Step 5: 확인**

```bash
aws s3 ls --profile dsu-roleswitch | grep holdem
```

Expected: 두 버킷 모두 표시

---

### Task 2: 보안 그룹 생성

- [ ] **Step 1: ALB 보안 그룹 (인터넷 → ALB)**

```bash
ALB_SG=$(aws ec2 create-security-group \
  --group-name holdem-alb-sg \
  --description "Allow HTTP from internet" \
  --vpc-id vpc-0e4283922b93ba6ea \
  --profile dsu-roleswitch \
  --query 'GroupId' --output text)

echo "ALB SG: $ALB_SG"

# 80 포트 인바운드 허용
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --profile dsu-roleswitch
```

- [ ] **Step 2: EC2 보안 그룹 (ALB → EC2:3001)**

```bash
EC2_SG=$(aws ec2 create-security-group \
  --group-name holdem-ec2-sg \
  --description "Allow 3001 from ALB only" \
  --vpc-id vpc-0e4283922b93ba6ea \
  --profile dsu-roleswitch \
  --query 'GroupId' --output text)

echo "EC2 SG: $EC2_SG"

aws ec2 authorize-security-group-ingress \
  --group-id $EC2_SG \
  --protocol tcp --port 3001 \
  --source-group $ALB_SG \
  --profile dsu-roleswitch
```

- [ ] **Step 3: Redis 보안 그룹 (EC2 → Redis:6379)**

```bash
REDIS_SG=$(aws ec2 create-security-group \
  --group-name holdem-redis-sg \
  --description "Allow 6379 from EC2 only" \
  --vpc-id vpc-0e4283922b93ba6ea \
  --profile dsu-roleswitch \
  --query 'GroupId' --output text)

echo "Redis SG: $REDIS_SG"

aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG \
  --protocol tcp --port 6379 \
  --source-group $EC2_SG \
  --profile dsu-roleswitch
```

- [ ] **Step 4: 확인**

```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-*" \
  --query 'SecurityGroups[*].{Name:GroupName,Id:GroupId}' \
  --output table \
  --profile dsu-roleswitch
```

Expected: holdem-alb-sg, holdem-ec2-sg, holdem-redis-sg 세 개 표시

---

### Task 3: IAM 역할 생성 (EC2 → S3 히스토리 쓰기)

- [ ] **Step 1: 신뢰 정책 파일 생성**

```bash
cat > /tmp/ec2-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
```

- [ ] **Step 2: IAM 역할 생성**

```bash
aws iam create-role \
  --role-name holdem-ec2-role \
  --assume-role-policy-document file:///tmp/ec2-trust.json \
  --profile dsu-roleswitch
```

- [ ] **Step 3: S3 히스토리 버킷 쓰기 권한 부여**

```bash
aws iam put-role-policy \
  --role-name holdem-ec2-role \
  --policy-name holdem-s3-history-write \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::holdem-history-026951011097/*"
    }]
  }' \
  --profile dsu-roleswitch
```

- [ ] **Step 4: 인스턴스 프로파일 생성 및 역할 연결**

```bash
aws iam create-instance-profile \
  --instance-profile-name holdem-ec2-profile \
  --profile dsu-roleswitch

aws iam add-role-to-instance-profile \
  --instance-profile-name holdem-ec2-profile \
  --role-name holdem-ec2-role \
  --profile dsu-roleswitch
```

---

### Task 4: EC2 키 페어 생성

- [ ] **Step 1: 키 페어 생성 및 저장**

```bash
aws ec2 create-key-pair \
  --key-name holdem-key \
  --query 'KeyMaterial' \
  --output text \
  --profile dsu-roleswitch > ~/.ssh/holdem-key.pem

chmod 400 ~/.ssh/holdem-key.pem
echo "Key saved to ~/.ssh/holdem-key.pem"
```

---

### Task 5: ElastiCache Redis 서브넷 그룹 & 클러스터 생성

> ⚠️ 현재 role에 elasticache 권한이 없음. 실행 전 IAM 관리자에게 `elasticache:*` 권한 요청 필요.

- [ ] **Step 1: 권한 확인**

```bash
aws elasticache describe-cache-clusters --profile dsu-roleswitch 2>&1
```

Expected: 에러 없이 결과 반환. 에러 시 → IAM 관리자에게 권한 요청 후 진행.

- [ ] **Step 2: 서브넷 그룹 생성**

```bash
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name holdem-redis-subnet \
  --cache-subnet-group-description "Cloud Holdem Redis subnet group" \
  --subnet-ids subnet-0dd262b44669174f8 subnet-04bea6a2e3d9da9f5 subnet-02e3f5e14bf2a7282 \
  --profile dsu-roleswitch
```

- [ ] **Step 3: Redis 클러스터 생성 (single-node)**

```bash
# REDIS_SG 값 먼저 확인
REDIS_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-redis-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile dsu-roleswitch)

aws elasticache create-cache-cluster \
  --cache-cluster-id holdem-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.1 \
  --num-cache-nodes 1 \
  --cache-subnet-group-name holdem-redis-subnet \
  --security-group-ids $REDIS_SG \
  --profile dsu-roleswitch
```

- [ ] **Step 4: 클러스터 활성화 대기 (약 5분)**

```bash
aws elasticache wait cache-cluster-available \
  --cache-cluster-id holdem-redis \
  --profile dsu-roleswitch

# Redis 엔드포인트 확인
aws elasticache describe-cache-clusters \
  --cache-cluster-id holdem-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text \
  --profile dsu-roleswitch
```

Expected: `holdem-redis.xxxxx.0001.apn2.cache.amazonaws.com` 형태 출력

---

### Task 6: ALB + 타깃 그룹 생성

> ⚠️ 현재 role에 elasticloadbalancing 권한 없음. IAM 관리자에게 `elasticloadbalancing:*` 권한 요청 필요.

- [ ] **Step 1: 권한 확인**

```bash
aws elbv2 describe-load-balancers --profile dsu-roleswitch 2>&1
```

- [ ] **Step 2: 타깃 그룹 생성**

```bash
ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile dsu-roleswitch)

TG_ARN=$(aws elbv2 create-target-group \
  --name holdem-tg \
  --protocol HTTP \
  --port 3001 \
  --vpc-id vpc-0e4283922b93ba6ea \
  --target-type instance \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --profile dsu-roleswitch \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

echo "Target Group ARN: $TG_ARN"
```

- [ ] **Step 3: ALB 생성**

```bash
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name holdem-alb \
  --subnets subnet-0dd262b44669174f8 subnet-04bea6a2e3d9da9f5 subnet-02e3f5e14bf2a7282 \
  --security-groups $ALB_SG \
  --profile dsu-roleswitch \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

echo "ALB ARN: $ALB_ARN"
```

- [ ] **Step 4: HTTP 리스너 생성 (80 → 타깃 그룹)**

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --profile dsu-roleswitch
```

- [ ] **Step 5: ALB DNS 확인**

```bash
aws elbv2 describe-load-balancers \
  --names holdem-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --profile dsu-roleswitch
```

Expected: `holdem-alb-xxxxxxxx.ap-northeast-2.elb.amazonaws.com`

---

### Task 7: EC2 Launch Template 생성

- [ ] **Step 1: User Data 스크립트 작성**

```bash
cat > /tmp/userdata.sh << 'USERDATA'
#!/bin/bash
# Node.js 20 설치
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git

# 앱 디렉토리 생성
mkdir -p /app
cd /app

# 코드 다운로드 (S3에서 또는 git clone)
# git clone https://github.com/YOUR_REPO/cloud_holdem.git .
# cd server && npm install

# Redis 엔드포인트 (ElastiCache 생성 후 대체)
export REDIS_HOST=REPLACE_WITH_REDIS_ENDPOINT
export REDIS_PORT=6379
export PORT=3001
export HISTORY_BUCKET=holdem-history-026951011097
export AWS_REGION=ap-northeast-2

# 서버 시작
cd /app/server && npm start &
USERDATA

base64 /tmp/userdata.sh > /tmp/userdata-b64.txt
echo "User data prepared"
```

- [ ] **Step 2: Launch Template 생성**

```bash
EC2_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=holdem-ec2-sg" \
  --query 'SecurityGroups[0].GroupId' --output text \
  --profile dsu-roleswitch)

LT_ID=$(aws ec2 create-launch-template \
  --launch-template-name holdem-lt \
  --launch-template-data "{
    \"ImageId\": \"ami-000913a389568d579\",
    \"InstanceType\": \"t3.small\",
    \"KeyName\": \"holdem-key\",
    \"SecurityGroupIds\": [\"$EC2_SG\"],
    \"IamInstanceProfile\": {\"Name\": \"holdem-ec2-profile\"},
    \"UserData\": \"$(cat /tmp/userdata-b64.txt)\",
    \"TagSpecifications\": [{
      \"ResourceType\": \"instance\",
      \"Tags\": [{\"Key\": \"Name\", \"Value\": \"holdem-server\"}]
    }]
  }" \
  --profile dsu-roleswitch \
  --query 'LaunchTemplate.LaunchTemplateId' --output text)

echo "Launch Template ID: $LT_ID"
```

---

### Task 8: Auto Scaling Group 생성

> ⚠️ 현재 role에 autoscaling 권한 없음. IAM 관리자에게 `autoscaling:*` 권한 요청 필요.

- [ ] **Step 1: 권한 확인**

```bash
aws autoscaling describe-auto-scaling-groups --profile dsu-roleswitch 2>&1
```

- [ ] **Step 2: ASG 생성**

```bash
TG_ARN=$(aws elbv2 describe-target-groups \
  --names holdem-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text \
  --profile dsu-roleswitch)

LT_ID=$(aws ec2 describe-launch-templates \
  --filters "Name=launch-template-name,Values=holdem-lt" \
  --query 'LaunchTemplates[0].LaunchTemplateId' --output text \
  --profile dsu-roleswitch)

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name holdem-asg \
  --launch-template "LaunchTemplateId=$LT_ID,Version=\$Latest" \
  --min-size 1 \
  --max-size 4 \
  --desired-capacity 2 \
  --target-group-arns $TG_ARN \
  --vpc-zone-identifier "subnet-0dd262b44669174f8,subnet-04bea6a2e3d9da9f5,subnet-02e3f5e14bf2a7282" \
  --health-check-type ELB \
  --health-check-grace-period 60 \
  --profile dsu-roleswitch
```

- [ ] **Step 3: Scale-Out 정책 (CPU 70%)**

```bash
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name holdem-asg \
  --policy-name holdem-cpu-scale-out \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 70.0
  }' \
  --profile dsu-roleswitch
```

- [ ] **Step 4: ASG 상태 확인**

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names holdem-asg \
  --query 'AutoScalingGroups[0].{Min:MinSize,Max:MaxSize,Desired:DesiredCapacity,Instances:Instances[*].InstanceId}' \
  --output json \
  --profile dsu-roleswitch
```

Expected: 2개 인스턴스 launching 상태

---

### Task 9: 헬스체크 엔드포인트 추가 & 배포

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: HTTP 헬스체크 엔드포인트 추가**

ALB는 HTTP `/health`로 헬스체크를 보냄. Node.js ws 서버에 HTTP 응답 추가:

```js
// server/src/index.js 수정
import { WebSocketServer } from 'ws';
import http from 'http';
import { handleConnection } from './ws/handler.js';
import { startTurnTimerPoller } from './timer/turn-timer.js';

const PORT = process.env.PORT || 3001;

// HTTP 서버로 감싸서 헬스체크 지원
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', handleConnection);

startTurnTimerPoller();
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

- [ ] **Step 2: 코드 패키지 생성**

```bash
cd /home/dakori/github/cloud_holdem
tar -czf /tmp/holdem-server.tar.gz server/
aws s3 cp /tmp/holdem-server.tar.gz s3://holdem-history-026951011097/deploy/server.tar.gz \
  --profile dsu-roleswitch
```

- [ ] **Step 3: User Data 스크립트 업데이트 (S3에서 코드 받기)**

Launch Template 새 버전 생성:

```bash
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id holdem-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text \
  --profile dsu-roleswitch)

cat > /tmp/userdata2.sh << USERDATA
#!/bin/bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

mkdir -p /app
cd /app
aws s3 cp s3://holdem-history-026951011097/deploy/server.tar.gz . --region ap-northeast-2
tar -xzf server.tar.gz
cd server && npm install --production

export REDIS_HOST=$REDIS_ENDPOINT
export REDIS_PORT=6379
export PORT=3001
export HISTORY_BUCKET=holdem-history-026951011097
export AWS_REGION=ap-northeast-2

node src/index.js >> /var/log/holdem.log 2>&1 &
USERDATA

base64 /tmp/userdata2.sh > /tmp/userdata2-b64.txt

LT_ID=$(aws ec2 describe-launch-templates \
  --filters "Name=launch-template-name,Values=holdem-lt" \
  --query 'LaunchTemplates[0].LaunchTemplateId' --output text \
  --profile dsu-roleswitch)

aws ec2 create-launch-template-version \
  --launch-template-id $LT_ID \
  --source-version 1 \
  --launch-template-data "{\"UserData\": \"$(cat /tmp/userdata2-b64.txt)\"}" \
  --profile dsu-roleswitch
```

- [ ] **Step 4: ASG 인스턴스 롤링 업데이트**

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name holdem-asg \
  --preferences '{"MinHealthyPercentage": 50, "InstanceWarmup": 60}' \
  --profile dsu-roleswitch
```

---

### Task 10: 프론트엔드 배포 & 검증

- [ ] **Step 1: 백엔드 ALB DNS 확인**

```bash
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names holdem-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --profile dsu-roleswitch)
echo "ALB DNS: $ALB_DNS"
```

- [ ] **Step 2: 프론트엔드 빌드 (ALB 주소 주입)**

```bash
cd /home/dakori/github/cloud_holdem/client
VITE_WS_URL="ws://$ALB_DNS" npm run build
```

- [ ] **Step 3: S3 정적 호스팅 버킷에 업로드**

```bash
aws s3 sync dist/ s3://holdem-client-026951011097/ --delete \
  --profile dsu-roleswitch
```

- [ ] **Step 4: 서비스 URL 확인**

```bash
echo "Client URL: http://holdem-client-026951011097.s3-website.ap-northeast-2.amazonaws.com"
echo "Backend WS: ws://$ALB_DNS"
```

- [ ] **Step 5: 헬스체크 확인**

```bash
curl http://$ALB_DNS/health
```

Expected: `OK`

- [ ] **Step 6: WebSocket 연결 테스트**

```bash
npx wscat -c ws://$ALB_DNS
# {"type":"list_rooms"} 입력 후 응답 확인
```

Expected: `{"type":"rooms","rooms":[]}`

---

## 권한 부족 항목 정리

현재 `role-dsu-roleswitch`에 없는 권한:

| 서비스 | 필요 액션 | 해당 Task |
|--------|-----------|-----------|
| ElastiCache | `elasticache:*` | Task 5 |
| ELB v2 | `elasticloadbalancing:*` | Task 6 |
| Auto Scaling | `autoscaling:*` | Task 8 |
| IAM | `iam:CreateRole`, `iam:PutRolePolicy` 등 | Task 3 |

→ IAM 관리자에게 위 권한 추가 요청 후 해당 Task 진행.

## 리소스 정리 (삭제 순서)

```bash
# 역순으로 삭제
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name holdem-asg --force-delete --profile dsu-roleswitch
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN --profile dsu-roleswitch
aws elbv2 delete-target-group --target-group-arn $TG_ARN --profile dsu-roleswitch
aws elasticache delete-cache-cluster --cache-cluster-id holdem-redis --profile dsu-roleswitch
aws ec2 delete-launch-template --launch-template-id $LT_ID --profile dsu-roleswitch
aws ec2 delete-security-group --group-id $EC2_SG --profile dsu-roleswitch
aws ec2 delete-security-group --group-id $REDIS_SG --profile dsu-roleswitch
aws ec2 delete-security-group --group-id $ALB_SG --profile dsu-roleswitch
aws iam remove-role-from-instance-profile --instance-profile-name holdem-ec2-profile --role-name holdem-ec2-role --profile dsu-roleswitch
aws iam delete-instance-profile --instance-profile-name holdem-ec2-profile --profile dsu-roleswitch
aws iam delete-role-policy --role-name holdem-ec2-role --policy-name holdem-s3-history-write --profile dsu-roleswitch
aws iam delete-role --role-name holdem-ec2-role --profile dsu-roleswitch
aws s3 rb s3://holdem-client-026951011097 --force --profile dsu-roleswitch
aws s3 rb s3://holdem-history-026951011097 --force --profile dsu-roleswitch
```
