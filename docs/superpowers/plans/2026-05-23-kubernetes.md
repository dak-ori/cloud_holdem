# Kubernetes EKS 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EC2 Auto Scaling Group을 EKS + AWS Load Balancer Controller로 완전 대체. Node.js WebSocket 서버를 컨테이너화하고 K8s로 운영.

**Architecture:** ECR에 Docker 이미지 저장 → EKS Managed NodeGroup에서 실행 → AWS LBC가 ALB Ingress 자동 관리 → ElastiCache Redis/S3는 기존 그대로 재사용.

**Tech Stack:** Docker, eksctl, kubectl, Helm, AWS CLI (profile: dsu-roleswitch), K8s 1.30, AWS LBC

**전제조건:**
- Docker 설치: `docker --version`
- eksctl 설치: `eksctl version` (없으면 Task 3 Step 1에서 설치)
- kubectl 설치: `kubectl version --client`
- Helm 설치: `helm version`
- AWS CLI profile `dsu-roleswitch` 동작 확인: `aws sts get-caller-identity --profile dsu-roleswitch`
- AWS 계정 ID 확인: `aws sts get-caller-identity --query Account --output text --profile dsu-roleswitch` (결과: `026951011097`)

---

## File Structure

```
server/
└── Dockerfile                       ← 신규 생성

k8s/
├── namespace.yaml                   ← 신규 생성
├── server/
│   ├── deployment.yaml              ← 신규 생성
│   ├── service.yaml                 ← 신규 생성
│   ├── ingress.yaml                 ← 신규 생성
│   ├── hpa.yaml                     ← 신규 생성
│   └── secret.yaml                  ← 신규 생성 (git에 커밋 안 함)
└── aws-lbc/
    └── service-account.yaml         ← 신규 생성

infra/
└── eks-cluster.yaml                 ← eksctl 클러스터 config
```

---

### Task 1: ECR 레포지토리 생성

**Files:**
- 없음 (AWS 리소스 생성)

- [ ] **Step 1: ECR 레포 생성**

```bash
aws ecr create-repository \
  --repository-name holdem-server \
  --region ap-northeast-2 \
  --profile dsu-roleswitch
```

Expected 출력:
```json
{
  "repository": {
    "repositoryUri": "026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server",
    ...
  }
}
```

- [ ] **Step 2: 생성 확인**

```bash
aws ecr describe-repositories \
  --repository-names holdem-server \
  --region ap-northeast-2 \
  --profile dsu-roleswitch \
  --query 'repositories[0].repositoryUri' \
  --output text
```

Expected: `026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server`

- [ ] **Step 3: 커밋**

```bash
git commit --allow-empty -m "chore: create ECR repository holdem-server"
```

---

### Task 2: Dockerfile 작성 & 로컬 빌드 검증

**Files:**
- Create: `server/Dockerfile`

- [ ] **Step 1: Dockerfile 작성**

`server/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src ./src
EXPOSE 3001
CMD ["node", "src/index.js"]
```

빌드 컨텍스트는 `server/` 디렉토리. `package*.json`과 `src/`가 컨텍스트 루트에 있어야 함.

- [ ] **Step 2: 로컬 이미지 빌드**

```bash
docker build -t holdem-server:local ./server
```

Expected: `Successfully built <image_id>` (또는 `=> exporting to image` 완료)

- [ ] **Step 3: 컨테이너 실행 (Redis 없이 헬스체크만 확인)**

```bash
docker run -d --name holdem-test \
  -p 3001:3001 \
  -e REDIS_HOST=localhost \
  -e PORT=3001 \
  holdem-server:local
```

- [ ] **Step 4: 헬스체크 확인**

```bash
curl http://localhost:3001/health
```

Expected: `OK`

Note: Redis 없으면 서버가 시작 직후 연결 에러를 로그에 출력하지만, `/health` 엔드포인트는 HTTP 서버가 뜨는 즉시 응답함. 에러 로그는 정상.

- [ ] **Step 5: 컨테이너 정리**

```bash
docker rm -f holdem-test
```

- [ ] **Step 6: 커밋**

```bash
git add server/Dockerfile
git commit -m "feat: add Dockerfile for Node.js server"
```

---

### Task 3: EKS 클러스터 생성

**Files:**
- Create: `infra/eks-cluster.yaml`

- [ ] **Step 1: eksctl 설치 (없을 경우)**

```bash
# eksctl 설치 여부 확인
eksctl version 2>/dev/null || \
  curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" && \
  tar -xzf eksctl_Linux_amd64.tar.gz -C /usr/local/bin && \
  rm eksctl_Linux_amd64.tar.gz
```

Expected: `0.196.0` (또는 최신 버전 출력)

- [ ] **Step 2: 클러스터 config 파일 작성**

`infra/eks-cluster.yaml`:
```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: holdem-eks
  region: ap-northeast-2
  version: "1.30"

vpc:
  id: vpc-0e4283922b93ba6ea
  subnets:
    public:
      ap-northeast-2a:
        id: subnet-0dd262b44669174f8
      ap-northeast-2b:
        id: subnet-04bea6a2e3d9da9f5
      ap-northeast-2c:
        id: subnet-02e3f5e14bf2a7282

managedNodeGroups:
  - name: holdem-ng
    instanceType: t3.small
    minSize: 2
    maxSize: 6
    desiredCapacity: 2
    amiFamily: AmazonLinux2023
    iam:
      attachPolicyARNs:
        - arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
        - arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy
        - arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
    tags:
      Name: holdem-ng

iam:
  withOIDC: true
```

`withOIDC: true`로 OIDC Provider를 자동으로 생성함 (IRSA에 필요).

- [ ] **Step 3: 클러스터 생성 (약 15~20분 소요)**

```bash
eksctl create cluster -f infra/eks-cluster.yaml --profile dsu-roleswitch
```

Expected 마지막 줄:
```
[✓]  EKS cluster "holdem-eks" in "ap-northeast-2" region is ready
```

- [ ] **Step 4: kubectl 컨텍스트 확인**

```bash
kubectl get nodes
```

Expected: 2개 노드 `Ready` 상태
```
NAME                                                STATUS   ROLES    AGE   VERSION
ip-172-31-xx-xx.ap-northeast-2.compute.internal    Ready    <none>   2m    v1.30.x
ip-172-31-xx-xx.ap-northeast-2.compute.internal    Ready    <none>   2m    v1.30.x
```

- [ ] **Step 5: OIDC Provider 확인**

```bash
aws eks describe-cluster \
  --name holdem-eks \
  --region ap-northeast-2 \
  --profile dsu-roleswitch \
  --query "cluster.identity.oidc.issuer" \
  --output text
```

Expected: `https://oidc.eks.ap-northeast-2.amazonaws.com/id/XXXXXXXXXX`

- [ ] **Step 6: 커밋**

```bash
git add infra/eks-cluster.yaml
git commit -m "feat: add eksctl cluster config for holdem-eks"
```

---

### Task 4: IRSA — S3 쓰기 권한 ServiceAccount

**Files:**
- Create: `k8s/aws-lbc/service-account.yaml`

- [ ] **Step 1: OIDC ID 추출**

```bash
OIDC_ID=$(aws eks describe-cluster \
  --name holdem-eks \
  --region ap-northeast-2 \
  --profile dsu-roleswitch \
  --query "cluster.identity.oidc.issuer" \
  --output text | cut -d'/' -f5)
echo $OIDC_ID
```

Expected: `ABCDEF1234567890` 형태의 문자열

- [ ] **Step 2: IAM 신뢰 정책 파일 생성**

```bash
ACCOUNT_ID=026951011097
cat > /tmp/holdem-server-trust.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/oidc.eks.ap-northeast-2.amazonaws.com/id/${OIDC_ID}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-northeast-2.amazonaws.com/id/${OIDC_ID}:sub": "system:serviceaccount:holdem:holdem-server-sa",
          "oidc.eks.ap-northeast-2.amazonaws.com/id/${OIDC_ID}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
cat /tmp/holdem-server-trust.json
```

Expected: JSON 내용 출력 (OIDC_ID가 실제 값으로 치환됨)

- [ ] **Step 3: IAM Role 생성**

```bash
aws iam create-role \
  --role-name holdem-eks-server-role \
  --assume-role-policy-document file:///tmp/holdem-server-trust.json \
  --profile dsu-roleswitch
```

- [ ] **Step 4: S3 쓰기 정책 부여**

```bash
aws iam put-role-policy \
  --role-name holdem-eks-server-role \
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

- [ ] **Step 5: K8s ServiceAccount 매니페스트 작성**

`k8s/aws-lbc/service-account.yaml`:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: holdem-server-sa
  namespace: holdem
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::026951011097:role/holdem-eks-server-role
```

- [ ] **Step 6: 커밋**

```bash
git add k8s/aws-lbc/service-account.yaml
git commit -m "feat: add IRSA service account for holdem-server S3 write"
```

---

### Task 5: AWS Load Balancer Controller 설치

**Files:**
- 없음 (Helm 설치)

- [ ] **Step 1: Helm 설치 확인 (없을 경우)**

```bash
helm version 2>/dev/null || \
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

Expected: `version.BuildInfo{Version:"v3.x.x", ...}`

- [ ] **Step 2: AWS LBC IAM Policy 다운로드 & 생성**

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.1/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json \
  --profile dsu-roleswitch
```

Expected: `"PolicyArn": "arn:aws:iam::026951011097:policy/AWSLoadBalancerControllerIAMPolicy"`

- [ ] **Step 3: LBC용 ServiceAccount 생성 (eksctl)**

```bash
eksctl create iamserviceaccount \
  --cluster holdem-eks \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::026951011097:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --approve \
  --profile dsu-roleswitch
```

Expected: `[✓] created serviceaccount "kube-system/aws-load-balancer-controller"`

- [ ] **Step 4: Helm으로 LBC 설치**

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=holdem-eks \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-northeast-2 \
  --set vpcId=vpc-0e4283922b93ba6ea
```

Expected:
```
NAME: aws-load-balancer-controller
STATUS: deployed
```

- [ ] **Step 5: LBC Pod 상태 확인**

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
```

Expected:
```
NAME                           READY   UP-TO-DATE   AVAILABLE
aws-load-balancer-controller   2/2     2            2
```

---

### Task 6: K8s 매니페스트 작성

**Files:**
- Create: `k8s/namespace.yaml`
- Create: `k8s/server/deployment.yaml`
- Create: `k8s/server/service.yaml`
- Create: `k8s/server/ingress.yaml`
- Create: `k8s/server/hpa.yaml`
- Create: `k8s/server/secret.yaml` (git에 추가 안 함)

- [ ] **Step 1: namespace.yaml 작성**

`k8s/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: holdem
```

- [ ] **Step 2: ElastiCache 엔드포인트 조회**

```bash
REDIS_HOST=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id holdem-redis \
  --show-cache-node-info \
  --region ap-northeast-2 \
  --profile dsu-roleswitch \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)
echo $REDIS_HOST
```

Expected: `holdem-redis.xxxxxx.0001.apn2.cache.amazonaws.com`

- [ ] **Step 3: secret.yaml 작성**

```bash
REDIS_HOST_B64=$(echo -n "$REDIS_HOST" | base64)
cat > k8s/server/secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: holdem-secret
  namespace: holdem
type: Opaque
data:
  REDIS_HOST: ${REDIS_HOST_B64}
EOF
```

`secret.yaml`은 `.gitignore`에 추가:
```bash
echo "k8s/server/secret.yaml" >> .gitignore
```

- [ ] **Step 4: deployment.yaml 작성**

`k8s/server/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: holdem-server
  namespace: holdem
spec:
  replicas: 2
  selector:
    matchLabels:
      app: holdem-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels:
        app: holdem-server
    spec:
      serviceAccountName: holdem-server-sa
      containers:
        - name: holdem-server
          image: 026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server:latest
          ports:
            - containerPort: 3001
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          env:
            - name: REDIS_HOST
              valueFrom:
                secretKeyRef:
                  name: holdem-secret
                  key: REDIS_HOST
            - name: REDIS_PORT
              value: "6379"
            - name: PORT
              value: "3001"
            - name: HISTORY_BUCKET
              value: holdem-history-026951011097
            - name: AWS_REGION
              value: ap-northeast-2
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
```

- [ ] **Step 5: service.yaml 작성**

`k8s/server/service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: holdem-server
  namespace: holdem
spec:
  selector:
    app: holdem-server
  ports:
    - protocol: TCP
      port: 3001
      targetPort: 3001
  type: ClusterIP
```

- [ ] **Step 6: ingress.yaml 작성**

`k8s/server/ingress.yaml`:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: holdem-ingress
  namespace: holdem
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"
    alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600
spec:
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: holdem-server
                port:
                  number: 3001
```

`idle_timeout=3600`: WebSocket 연결이 최대 1시간까지 끊기지 않도록 ALB 유휴 타임아웃 설정.

- [ ] **Step 7: hpa.yaml 작성**

`k8s/server/hpa.yaml`:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: holdem-server-hpa
  namespace: holdem
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: holdem-server
  minReplicas: 2
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

- [ ] **Step 8: 커밋**

```bash
git add k8s/namespace.yaml k8s/server/deployment.yaml k8s/server/service.yaml \
        k8s/server/ingress.yaml k8s/server/hpa.yaml k8s/aws-lbc/service-account.yaml .gitignore
git commit -m "feat: add K8s manifests (namespace, deployment, service, ingress, hpa)"
```

---

### Task 7: ECR 이미지 push & K8s 배포

**Files:**
- 없음 (배포)

- [ ] **Step 1: ECR 로그인**

```bash
aws ecr get-login-password \
  --region ap-northeast-2 \
  --profile dsu-roleswitch | \
docker login \
  --username AWS \
  --password-stdin \
  026951011097.dkr.ecr.ap-northeast-2.amazonaws.com
```

Expected: `Login Succeeded`

- [ ] **Step 2: 이미지 태깅 & push**

```bash
docker tag holdem-server:local \
  026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server:latest

docker push \
  026951011097.dkr.ecr.ap-northeast-2.amazonaws.com/holdem-server:latest
```

Expected: `latest: digest: sha256:xxxx size: xxxx`

- [ ] **Step 3: K8s 리소스 배포**

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/aws-lbc/service-account.yaml
kubectl apply -f k8s/server/secret.yaml
kubectl apply -f k8s/server/deployment.yaml
kubectl apply -f k8s/server/service.yaml
kubectl apply -f k8s/server/ingress.yaml
kubectl apply -f k8s/server/hpa.yaml
```

- [ ] **Step 4: Pod 상태 확인**

```bash
kubectl get pods -n holdem -w
```

Expected (1~2분 내):
```
NAME                             READY   STATUS    RESTARTS
holdem-server-xxxxxxxxx-xxxxx   1/1     Running   0
holdem-server-xxxxxxxxx-xxxxx   1/1     Running   0
```

`Ctrl+C`로 watch 종료.

- [ ] **Step 5: Ingress ALB DNS 확인 (약 2~3분 소요)**

```bash
kubectl get ingress -n holdem -w
```

Expected:
```
NAME             CLASS   HOSTS   ADDRESS                                    PORTS
holdem-ingress   alb     *       k8s-holdem-xxxxxx.ap-northeast-2.elb.amazonaws.com   80
```

`ADDRESS`가 채워지면 `Ctrl+C`.

- [ ] **Step 6: 헬스체크 확인**

```bash
ALB_DNS=$(kubectl get ingress holdem-ingress -n holdem \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB DNS: $ALB_DNS"
curl http://$ALB_DNS/health
```

Expected: `OK`

- [ ] **Step 7: WebSocket 연결 테스트**

```bash
npx wscat -c ws://$ALB_DNS
```

입력: `{"type":"list_rooms"}`

Expected: `{"type":"rooms","rooms":[]}` (또는 현재 방 목록)

`Ctrl+C`로 종료.

---

### Task 8: EC2 ASG 제거 & 마이그레이션 완료

**Files:**
- 없음

- [ ] **Step 1: 현재 트래픽이 EKS로 정상 처리되는지 확인**

브라우저에서 `http://<ALB_DNS>`로 접속 가능한지 확인. (프론트엔드는 별도 S3 URL)

WebSocket 연결 테스트 재확인:
```bash
curl http://$ALB_DNS/health
```

Expected: `OK`

- [ ] **Step 2: EC2 ASG desired=0 설정 (안전하게 트래픽 전환)**

```bash
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name holdem-asg \
  --min-size 0 \
  --desired-capacity 0 \
  --profile dsu-roleswitch
```

Expected: 에러 없음

- [ ] **Step 3: EC2 인스턴스 종료 확인 (약 2~3분)**

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names holdem-asg \
  --profile dsu-roleswitch \
  --query 'AutoScalingGroups[0].Instances' \
  --output json
```

Expected: `[]` (빈 배열)

- [ ] **Step 4: EKS 서비스 최종 검증 (4탭 게임 테스트)**

브라우저 탭 4개를 열고 `http://<S3_FRONTEND_URL>`에 접속.
각각 다른 닉네임으로 같은 방 입장 → 게임 시작 확인.

S3 프론트엔드 URL:
```
http://holdem-client-026951011097.s3-website.ap-northeast-2.amazonaws.com
```

단, 프론트엔드의 WebSocket URL이 새 ALB DNS를 가리키도록 재빌드 필요:
```bash
cd client
VITE_WS_URL="ws://$ALB_DNS" npm run build
aws s3 sync dist/ s3://holdem-client-026951011097/ --delete \
  --profile dsu-roleswitch
```

- [ ] **Step 5: EC2 ASG 삭제**

```bash
aws autoscaling delete-auto-scaling-group \
  --auto-scaling-group-name holdem-asg \
  --force-delete \
  --profile dsu-roleswitch
```

- [ ] **Step 6: Launch Template 삭제**

```bash
LT_ID=$(aws ec2 describe-launch-templates \
  --filters "Name=launch-template-name,Values=holdem-lt" \
  --query 'LaunchTemplates[0].LaunchTemplateId' \
  --output text \
  --profile dsu-roleswitch)

aws ec2 delete-launch-template \
  --launch-template-id $LT_ID \
  --profile dsu-roleswitch
```

- [ ] **Step 7: 최종 상태 확인**

```bash
kubectl get all -n holdem
```

Expected:
```
NAME                                 READY   STATUS    RESTARTS
pod/holdem-server-xxxxxxxx-xxxxx     1/1     Running   0
pod/holdem-server-xxxxxxxx-xxxxx     1/1     Running   0

NAME                     TYPE        CLUSTER-IP    PORT(S)
service/holdem-server    ClusterIP   10.100.x.x    3001/TCP

NAME                            READY   UP-TO-DATE   AVAILABLE
deployment.apps/holdem-server   2/2     2            2

NAME                                          REFERENCE                    TARGETS   MINPODS   MAXPODS
horizontalpodautoscaler.apps/holdem-server-hpa   Deployment/holdem-server   5%/70%    2         8
```

- [ ] **Step 8: 커밋**

```bash
git commit --allow-empty -m "chore: EC2 ASG removed, traffic fully migrated to EKS"
```

---

## 클러스터 삭제 (실습 완료 후)

포트폴리오 확인 후 비용 절감을 위해:

```bash
eksctl delete cluster --name holdem-eks --region ap-northeast-2 --profile dsu-roleswitch
```

약 10~15분 소요. EKS 컨트롤 플레인($73/월) + NodeGroup EC2 인스턴스 비용이 즉시 중단됨.
