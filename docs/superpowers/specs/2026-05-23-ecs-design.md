# Cloud Hold'em — ECS (EC2) 전환 설계

**날짜:** 2026-05-23  
**목적:** EKS 계획을 폐기하고 Amazon ECS (EC2 launch type)로 전환. AWS CLI로 인프라를 직접 구성. 기존 Dockerfile/ECR/ElastiCache/S3는 그대로 재사용.

---

## 목표

- Node.js WebSocket 서버를 ECS Task로 실행
- EC2 Auto Scaling Group을 ECS Capacity Provider로 사용
- ALB + Target Group으로 트래픽 수신 (WebSocket 지원)
- Application Auto Scaling으로 Task 수 자동 조절 (CPU 70%)
- ECS Task Role로 S3 히스토리 버킷 쓰기 권한 부여
- k8s/ 디렉토리 및 EKS 관련 파일 제거

---

## 전체 아키텍처

```
[브라우저]
    ↓ HTTP/WS (port 80)
[ALB: holdem-alb]
    ↓
[Target Group: holdem-tg] ← ECS Service가 Task 자동 등록/해제
    ↓
[ECS Cluster: holdem-cluster]
  [ASG: holdem-ecs-asg (ECS-optimized EC2 t3.small)]
    ├── Task × 2~8개 (awsvpc 네트워크 모드)
    │   컨테이너: holdem-server (port 3001)
    └── Application Auto Scaling (CPU 70%)
    ↓ ioredis
[ElastiCache Redis: holdem-redis] (기존 유지)

[ECR: holdem-server]       ← 기존 재사용
[S3: holdem-client]        ← 기존 재사용
[S3: holdem-history]       ← 기존 재사용
[server/Dockerfile]        ← 기존 재사용 (변경 없음)
```

---

## EKS → ECS 대응

| EKS 리소스 | ECS 대체 | 비고 |
|-----------|---------|------|
| Deployment | Task Definition + ECS Service | |
| Pod | Task (컨테이너 1개) | |
| HPA | Application Auto Scaling | CPU 70% 동일 |
| K8s Ingress (AWS LBC) | ALB + Target Group 직접 연결 | LBC 불필요 |
| IRSA ServiceAccount | ECS Task Role | IAM Role 직접 연결 |
| k8s/ 매니페스트 | 제거 | infra/ecs/ 스크립트로 대체 |
| infra/eks-cluster.yaml | 제거 | |

---

## 파일 구조

```
infra/
├── ecs/
│   ├── 01-iam.sh           ← Task Role, Instance Role 생성
│   ├── 02-cluster.sh       ← ECS 클러스터 + ASG + Launch Template
│   ├── 03-task-def.sh      ← Task Definition 등록
│   ├── 04-alb.sh           ← ALB + Target Group + Listener
│   └── 05-service.sh       ← ECS Service + Auto Scaling 연결
├── required-iam-permissions.json   ← ECS 권한으로 교체
└── (eks-cluster.yaml 제거)

server/Dockerfile           ← 변경 없음
(k8s/ 디렉토리 전체 제거)
```

---

## IAM 구성

### ECS Task Role (holdem-ecs-task-role)
컨테이너 내부에서 AWS API 호출 시 사용.

```
신뢰 주체: ecs-tasks.amazonaws.com
정책: s3:PutObject → arn:aws:s3:::holdem-history-026951011097/*
```

### ECS Instance Role (holdem-ecs-instance-role)
EC2 노드가 ECS 클러스터에 등록하고 ECR에서 이미지를 pull할 때 사용.

```
신뢰 주체: ec2.amazonaws.com
관리형 정책:
  - AmazonEC2ContainerServiceforEC2Role
  - AmazonEC2ContainerRegistryReadOnly
```

---

## ECS 클러스터 & ASG

| 항목 | 값 |
|------|-----|
| 클러스터명 | `holdem-cluster` |
| AMI | ECS-optimized Amazon Linux 2023 (리전별 최신) |
| 인스턴스 타입 | `t3.small` |
| ASG min/max | 2 / 4 |
| Capacity Provider | `holdem-ecs-cp` (MANAGED scaling) |

ECS Managed Scaling을 사용하면 Task 수에 맞춰 EC2 인스턴스가 자동으로 추가/제거됨.

---

## Task Definition

| 항목 | 값 |
|------|-----|
| 패밀리명 | `holdem-server` |
| 네트워크 모드 | `awsvpc` |
| CPU | 256 (0.25 vCPU) |
| Memory | 512 MB |
| 이미지 | `026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server:latest` |
| 포트 | 3001 |
| 로그 드라이버 | `awslogs` → `/ecs/holdem-server` (CloudWatch) |

**환경변수:**

| 변수 | 값 |
|------|-----|
| `REDIS_HOST` | ElastiCache 엔드포인트 |
| `REDIS_PORT` | `6379` |
| `PORT` | `3001` |
| `HISTORY_BUCKET` | `holdem-history-026951011097` |
| `AWS_REGION` | `ap-northeast-2` |

---

## ALB & Target Group

| 항목 | 값 |
|------|-----|
| ALB명 | `holdem-alb` |
| Target Group | `holdem-tg` (target-type: `ip`, port 3001) |
| 헬스체크 경로 | `/health` |
| ALB 유휴 타임아웃 | 3600초 (WebSocket 연결 유지) |
| 리스너 | HTTP:80 → holdem-tg |

`target-type: ip` — awsvpc 모드에서 Task의 ENI IP로 직접 트래픽 전달.

---

## ECS Service & Auto Scaling

| 항목 | 값 |
|------|-----|
| 서비스명 | `holdem-service` |
| 초기 Task 수 | 2 |
| 배포 방식 | Rolling update (minimumHealthyPercent: 100, maximumPercent: 200) |
| Auto Scaling min/max | 2 / 8 |
| 스케일 기준 | CPU 사용률 70% |

`minimumHealthyPercent: 100` — 배포 중 기존 Task 유지, 게임 연결 끊김 방지.

---

## 보안 그룹

| 그룹 | 인바운드 | 용도 |
|------|---------|------|
| `holdem-alb-sg` | 0.0.0.0/0 : 80 | 인터넷 → ALB |
| `holdem-ec2-sg` | holdem-alb-sg : 3001 | ALB → ECS Task |
| `holdem-redis-sg` | holdem-ec2-sg : 6379 | ECS Task → Redis |

---

## 성공 기준

- `aws ecs describe-services` → `runningCount: 2`
- `curl http://<ALB_DNS>/health` → `OK`
- 브라우저 4탭으로 게임 정상 진행
- Task 1개 강제 종료 시 자동 재시작
- CPU 부하 시 Task 수 자동 증가
