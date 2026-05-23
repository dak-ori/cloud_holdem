# Cloud Hold'em — Kubernetes (EKS) 전환 설계

**날짜:** 2026-05-23  
**목적:** EC2 Auto Scaling Group을 Amazon EKS로 완전 대체. AWS Load Balancer Controller 패턴으로 ALB/ElastiCache 기존 인프라 재활용.

---

## 목표

- Node.js WebSocket 서버를 Docker 이미지로 컨테이너화
- EKS Managed NodeGroup으로 EC2 ASG 대체
- AWS Load Balancer Controller(LBC)로 K8s Ingress → ALB 자동 관리
- HPA(Horizontal Pod Autoscaler)로 CPU 기반 자동 스케일
- IRSA(IAM Roles for Service Accounts)로 EC2 IAM Role 대체
- ElastiCache Redis, S3 프론트엔드 버킷은 그대로 유지

---

## 전체 아키텍처

```
[브라우저]
    ↓ HTTP/WS (port 80)
[ALB] ← K8s Ingress (AWS LBC가 프로비저닝/관리)
    ↓
[EKS NodeGroup: holdem-ng]
  ┌──────────────────────────────────┐
  │  holdem-server Deployment        │
  │  Pod × 2~8개 (HPA CPU 70%)       │
  │  Node.js ws 서버, port 3001       │
  └──────────────────────────────────┘
    ↓ ioredis
[ElastiCache Redis: holdem-redis] (기존 유지)

[ECR: holdem-server] ← Docker 이미지 저장소
[S3: holdem-client]  ← React 정적 파일 (기존 유지)
```

---

## EKS 클러스터

| 항목 | 값 |
|------|-----|
| 클러스터명 | `holdem-eks` |
| 리전 | `ap-northeast-2` |
| K8s 버전 | `1.30` |
| VPC | 기존 `vpc-0e4283922b93ba6ea` 재사용 |
| 서브넷 | 기존 3개 서브넷 재사용 |

**NodeGroup: holdem-ng**

| 항목 | 값 |
|------|-----|
| 인스턴스 타입 | `t3.small` |
| min / max | 2 / 6 |
| 배포 방식 | eksctl managed nodegroup |

**설치 애드온**

| 애드온 | 용도 |
|--------|------|
| AWS Load Balancer Controller | Ingress → ALB 자동 관리 |
| CoreDNS | 클러스터 내부 DNS |
| kube-proxy | 네트워크 규칙 |

---

## 파일 구조

```
server/
└── Dockerfile               ← Node.js 20 Alpine 이미지

k8s/
├── namespace.yaml            ← holdem 네임스페이스
├── server/
│   ├── deployment.yaml       ← Pod 명세 (이미지, 환경변수, 리소스)
│   ├── service.yaml          ← ClusterIP Service (Pod → Ingress 연결)
│   ├── ingress.yaml          ← ALB Ingress (WebSocket, 헬스체크)
│   ├── hpa.yaml              ← CPU 70% 기준 HPA (min 2, max 8)
│   └── secret.yaml           ← REDIS_HOST 등 민감값
└── aws-lbc/
    └── service-account.yaml  ← IRSA ServiceAccount
```

---

## Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/src ./src
EXPOSE 3001
CMD ["node", "src/index.js"]
```

---

## K8s 매니페스트 설계

### Deployment

```yaml
replicas: 2
image: <account>.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server:latest
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { cpu: 500m, memory: 256Mi }
env:
  - REDIS_HOST: Secret에서 주입
  - REDIS_PORT: "6379"
  - PORT: "3001"
  - HISTORY_BUCKET: holdem-history-026951011097
  - AWS_REGION: ap-northeast-2
롤링 업데이트:
  maxUnavailable: 0
  maxSurge: 1
```

게임 중 연결 끊김 방지를 위해 `maxUnavailable: 0` 설정.

### Service

```yaml
type: ClusterIP
port: 3001 → targetPort: 3001
```

### Ingress (AWS LBC)

```yaml
annotations:
  kubernetes.io/ingress.class: alb
  alb.ingress.kubernetes.io/scheme: internet-facing
  alb.ingress.kubernetes.io/target-type: ip
  alb.ingress.kubernetes.io/healthcheck-path: /health
  alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600
```

`idle_timeout=3600`: WebSocket 연결 유지를 위해 ALB 유휴 타임아웃 1시간으로 설정.

### HPA

```yaml
minReplicas: 2
maxReplicas: 8
targetCPUUtilizationPercentage: 70
```

### Secret

```yaml
REDIS_HOST: <ElastiCache 엔드포인트 base64>
```

---

## IRSA (IAM Roles for Service Accounts)

EC2 IAM Role(holdem-ec2-role)을 K8s ServiceAccount 기반으로 대체.

```
holdem-server Pod
  → ServiceAccount: holdem-server-sa
  → IAM Role: holdem-eks-server-role
  → Policy: s3:PutObject → holdem-history-026951011097/*
```

OIDC Provider를 EKS 클러스터에 연결하고, IAM Role의 신뢰 정책에 ServiceAccount ARN을 지정.

---

## 마이그레이션 순서

1. ECR 레포지토리 생성 (`holdem-server`)
2. `server/Dockerfile` 작성
3. Docker 이미지 빌드 & ECR push
4. `eksctl`로 EKS 클러스터 + NodeGroup 생성
5. OIDC Provider 연결
6. IRSA IAM Role 생성 & ServiceAccount 연결
7. AWS LBC Helm 설치
8. `k8s/` 매니페스트 배포 (`kubectl apply`)
9. Ingress ALB DNS 확인 & 헬스체크 통과 검증
10. EC2 ASG `desired=0` 설정 후 트래픽 전환 확인
11. EC2 ASG, Launch Template 삭제

---

## 비용 변화

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| EC2 t3.small × 2 | ~$30/월 | ~$30/월 (동일) |
| EKS 컨트롤 플레인 | - | +$73/월 |
| ElastiCache | 유지 | 유지 |
| S3 | 유지 | 유지 |
| ALB | 유지 | 유지 |

EKS 컨트롤 플레인 비용 $73/월이 추가됨. 학습/포트폴리오 목적 완료 후 `eksctl delete cluster`로 즉시 삭제 가능.

---

## 성공 기준

- `kubectl get pods -n holdem` → 2개 Pod Running
- `kubectl get ingress -n holdem` → ALB DNS 주소 할당
- `curl http://<ALB>/health` → `OK`
- 브라우저 4탭으로 게임 정상 진행
- Pod 1개 강제 삭제 시 자동 재시작, 게임 연결 유지
