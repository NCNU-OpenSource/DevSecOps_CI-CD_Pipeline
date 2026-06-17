# DevSecOps CI/CD Pipeline on Custom Kubernetes
## 目錄

- [Concept Development](#concept-development)
- [Implementation Resources](#implementation-resources)
- [Existing Library / Software](#existing-library--software)
- [Implementation Process](#implementation-process)
- [Knowledge from Lecture](#knowledge-from-lecture)
- [Installation](#installation)
- [Usage](#usage)
- [Job Assignment](#job-assignment)
- [References](#references)


## Concept Development

在現今網站與 App 的開發流程中，許多團隊往往只專注於程式撰寫與功能測試，便直接部署上線，尤其現在使用者開始習慣讓 AI 協助生成程式碼，卻忽略背後潛藏的安全風險。等到作品上線後，發生了安全問題，才意識到「程式碼安全漏洞太多」，造成資料外洩或服務中斷等損失。為了避免這種「事後補救」的情況，我們設計了一條 DevSecOps CI/CD Pipeline，將程式檢查、安全掃描、Image 建置、部署與上線整合成一套自動化流程。讓開發者在開發初期時就將「安全」納入考量。透過 GitHub Actions workflow，系統可以在 Pull Request、Main Build、Staging 與 Production 等不同階段進行層層把關，讓開發者在專案上線後，安心給每個人使用。

> 我們專案的目標是建立一套可以運行在自建 Kubernetes 叢集上的 DevSecOps CI/CD Pipeline，
> 讓使用者只要跟著我們步驟設定，就能把自己的專案接上安全的 CI/CD 流程。


## Implementation Resources

### 準備三個 Repository

| Repo | 用途 | 連結 |
|------|------|------|
| `DevSecOps_CI-CD_Pipeline` | 放你的專案原始碼，並執行 CI/CD workflow，例如程式檢查、安全掃描、Image 建置與部署流程| [範例](https://github.com/Julie08080808/DevSecOps_CI-CD_Pipeline) |
| `infra` | 負責建立與管理 Kubernetes 及 CI/CD Pipeline 所需的工具，例如 Terraform modules、自訂 Runner Image、BuildKit Dockerfile、Harbor 憑證與 Kubernetes manifests | [範例](https://github.com/Julie08080808/infra) |
| `youtube-music-bot-gitops` | 記錄 Kubernetes staging / production 目前需要部署哪個版本，例如 image digest、Deployment、Service 與環境設定| [範例](https://github.com/Julie08080808/youtube-music-bot-gitops) |




> 我們設計的 DevSecOps CI/CD Pipeline 是以  [bs10081/youtube-music-bot](https://github.com/bs10081/youtube-music-bot) 的專案作為示範案例，透過這個專案展示如何在開發、測試與部署過程中導入安全檢測與自動化流程。


<!-- 一套以 GitHub Actions + ARC + Kata Containers + BuildKit + Harbor + Argo CD + Kyverno + OWASP ZAP + Syft + Grype + Cosign + FOSSA + CodeRabbit 組成的 DevSecOps CI/CD pipeline，跑在自建的 Kubernetes 叢集上。
 -->


<!-- 
```
PR gate（靜態分析 + DAST）
    ↓
build（image + SBOM + CVE scan + 簽章）
    ↓
GitOps staging（部署 + DAST gate）
    ↓
production approval
    ↓
production promotion（同一個 digest，不重新 build）
``` -->

<!--  ### 使用 Kata Containers 跑 CI

每個 CI job 都在獨立的 **Kata MicroVM** 裡執行，有自己的 Linux kernel，跟 VM2 的 host kernel 完全隔離：

```
ARC EphemeralRunner Pod（runtimeClassName: kata）
    ↓
Kata MicroVM（獨立 Linux Kernel 6.1.38）
    ↓
CI 工具執行（build、scan、ZAP 動態攻擊...）
    ↓
Job 完成，MicroVM 自動銷毀，不留任何狀態
``` 

這確保了：
- 惡意套件和 ZAP 動態攻擊被關在 MicroVM 裡，打不出去
- 每個 CI job 之間完全隔離
- 每次都是全新乾淨的環境 -->


<!-- ### Production 只 promote，不重新 build

```
Main Build 產出 digest：sha256:xxxx
                ↓
cd-staging 部署 sha256:xxxx 到 staging
                ↓
Staging DAST 通過
                ↓
cd-production promote 同一個 sha256:xxxx 到 production
```

Production 永遠不直接部署任意 image，只 promote staging 已通過所有安全測試的 digest。
 -->
<!-- **GitOps repo 是部署的唯一真相來源：**

```
App repo        → 產生 image digest
GitOps repo     → 記錄 staging / production 要部署哪個 digest
Argo CD         → 讓 cluster live state 追上 GitOps desired state
``` -->


## Implementation Resources

### 硬體需求

| VM | 角色 | 建議記憶體 | 建議 CPU | 建議磁碟 |
|----|------|-----------|---------|---------|
| VM1 | Control Plane | 16GB | 4 cores | 50GB |
| VM2 | CI Worker | 32GB+ | 8 cores | 200GB |
| VM3 | Production Worker | 32GB | 4 cores | 50GB |

> VM2 需要最多資源，因為每個 Kata MicroVM 約需要 4-8GB 記憶體，多個平行 job 會等比例增加記憶體需求。

### 軟體需求

| 軟體 | 版本 | 安裝位置 |
|------|------|---------|
| Ubuntu | 24.04 LTS | 三台 VM |
| Kubernetes | v1.30 | 三台 VM |
| containerd | v2.x | 三台 VM |
| Kata Containers | 3.2.0 | VM2 |
| Docker | 29.x | VM2（build/push runner image 用） |
| Helm | v3.x | VM1 |
| Terraform | 1.15.x | VM1 |

### 帳號需求

| 服務 | 用途 | 費用 |
|------|------|------|
| GitHub | Repo、Actions、GitHub App | 免費 |
| FOSSA | License 掃描 | 免費方案 |
| Harbor | 自架，不需外部帳號 | 免費 |

### DevSecOps CI/CD Pipeline 架構

**CI 靜態分析只在 PR 階段執行，push main 後不會重複跑。**
<img width="1191" height="2303" alt="CI_CD pipeline" src="https://github.com/user-attachments/assets/265b25ca-26ff-4a2c-b00f-7cb8b3688d78" />



## Existing Library / Software

### Kubernetes 與 Container 平台

| 工具 | 版本 | 用途 |
|------|------|------|
| Kubernetes | v1.30 | 自建叢集 |
| containerd | v2.2.x | K8s CRI runtime |
| Calico | v3.27 | CNI 網路插件 |
| Kata Containers | 3.2.0 | MicroVM 隔離 CI 環境 |
| local-path-provisioner | latest | K8s 本地儲存 StorageClass |

### CI/CD 與 GitOps

| 工具 | 版本 | 用途 |
|------|------|------|
| GitHub Actions | - | CI/CD workflow 觸發與執行 |
| ARC（Actions Runner Controller） | 0.14.2 | 在 K8s 動態建立 Runner Pod |
| BuildKit | v0.30.0 | 高效能 Container Image 建置 |
| Harbor | v2.x | 私有 Container Registry |
| Argo CD | latest | GitOps 部署引擎 |
| Kustomize | - | Staging / Production overlay 管理 |
| Terraform | 1.15.x | Infrastructure as Code |
| Helm | v3.x | K8s 應用程式套件管理 |

### DevSecOps 安全工具

| 工具 | 用途 |
|------|------|
| Biome | TypeScript / JavaScript Lint + Format |
| tsc | TypeScript 型別檢查 |
| Semgrep | 規則式靜態安全掃描 |
| CodeQL | 深度跨函式資料流分析（SAST） |
| Hadolint | Dockerfile 最佳實踐檢查 |
| Syft | 產生 SBOM（軟體元件清單） |
| Grype | CVE 漏洞掃描 |
| FOSSA | License 合規與供應鏈掃描 |
| Cosign | Container Image 數位簽章與驗證 |
| OWASP ZAP | 動態安全測試（DAST） |
| Kyverno | K8s admission control 政策 |
| CodeRabbit | AI Code Review（SaaS） |
| Snyk / Dependency Review | Dependency 漏洞與 License 風險 |

### 自訂 Runner Image 內建工具

```
harbor.jlsa.local:30443/ci/arc-runner:v0.4.0
```

- 將`kubectl`、`buildctl`、`syft`、`grype`、`git`、`curl`、`node`、`npm`、`tsc`、`python3` 等工具全部預先裝在 image 裡。
- 讓 CI job 在執行時不需要每次下載，減少外網依賴、執行速度更穩定。


## Implementation Process
### 第一步：建立 Kubernetes 叢集

用 kubeadm 在三台 Ubuntu 24.04 VM 上建立 Kubernetes v1.30 叢集。

**三台 VM 的共同基礎設定：**

每台 VM 都需要做以下準備，確保 K8s 可以正常運作：

- 永久關閉 Swap，因為 K8s scheduler 不支援 Swap 開啟的環境
- 載入 `overlay` 和 `br_netfilter` 核心模組，這是 containerd 和 K8s 網路的必要條件
- 設定 sysctl 網路參數，開啟 IP forwarding 和 bridge netfilter，讓 Pod 之間可以互相溝通
- 安裝 containerd 作為 CRI runtime，並設定 `SystemdCgroup = true`，讓 cgroup 管理跟 systemd 一致，避免資源競爭
- 安裝 kubeadm、kubelet、kubectl，版本鎖定在 v1.30

**VM1 初始化 Control Plane：**

在 VM1 上用 `kubeadm init` 初始化叢集，指定 pod network CIDR 為 `192.168.0.0/16`（Calico 預設範圍）。初始化完成後設定 kubeconfig，讓 kubectl 可以操作叢集。

接著安裝 Calico CNI 作為網路插件。這裡遇到了 Tigera Operator 的 CRD 載入問題，需要等待 CRD 完全建立後再 apply custom-resources.yaml，解決了 Calico 無法正常啟動的問題。

**VM2 和 VM3 加入叢集：**

在 VM1 用 `kubeadm token create --print-join-command` 產生 join 指令，分別在 VM2 和 VM3 執行，讓兩台 worker node 加入叢集。

**貼上 Node Label，定義 workload 分流：**

為了確保 CI job 只跑在 VM2、App 只跑在 VM3，用 label 來控制 Pod 的排程：

```bash
# VM2：CI 安全工廠
kubectl label nodes node2 node-role.kubernetes.io/ci-worker=true
kubectl label nodes node2 dedicated=ci-security

# VM3：生產與儲存節點
kubectl label nodes node3 node-role.kubernetes.io/production-worker=true
kubectl label nodes node3 dedicated=production-storage
```

之後 ARC RunnerScaleSet 的 `nodeSelector: {dedicated: ci-security}` 和 Harbor 的 `nodeSelector: {dedicated: production-storage}` 會根據這些 label 自動選擇正確的 node。

---

### 第二步：設定 Kata Containers（VM2）

Kata Containers 是這個專案安全隔離的核心。它讓每個 CI job 跑在獨立的 MicroVM 裡，有自己的 Linux kernel，跟 VM2 的 host 完全隔離。即使 CI job 裡跑了惡意套件或 ZAP 動態攻擊，也打不出這個 MicroVM 的邊界。

**安裝 Kata Containers 靜態包：**

從官方 GitHub releases 下載 Kata Containers 3.2.0 的 amd64 靜態包，解壓縮到系統根目錄，binary 會自動放進 `/opt/kata/bin/`。接著建立 symlink，讓 containerd 可以在預設路徑找到 kata 的 shim：

```
/usr/local/bin/containerd-shim-kata-v2 → /opt/kata/bin/containerd-shim-kata-v2
```

**設定 containerd 對接 Kata：**

在 `/etc/containerd/conf.d/kata.toml` 加入 Kata 的 runtime 設定，這是 containerd v2（config version 3）的正確格式，放在 `conf.d/` 資料夾會被 containerd 自動載入，不需要修改主設定檔。

這裡遇到的主要問題是 containerd 的 `config_path` 預設是空字串，導致自訂的 `certs.d/hosts.toml` 完全被忽略，containerd 根本不知道要去哪裡找 registry 的憑證設定。修正方式是把 `config_path` 指向正確的資料夾：

```
/etc/containerd/config.toml
config_path = '' → config_path = '/etc/containerd/certs.d'
```

**設定 containerd 信任 Harbor（自簽憑證）：**

Harbor 安裝時使用自簽憑證，containerd 預設不信任它，拉 image 時會報 `x509: certificate signed by unknown authority` 的錯誤。解決方式是在 `certs.d` 裡為 Harbor 建立專屬的 `hosts.toml`，設定 `skip_verify = true`，讓 containerd 信任這個 registry 而不驗證憑證。

**在 K8s 建立 RuntimeClass：**

RuntimeClass 是 K8s 的機制，讓你替不同的 Pod 指定不同的 container runtime。建立 `kata` RuntimeClass 之後，只要在 Pod spec 加上 `runtimeClassName: kata`，K8s 就會自動用 Kata Containers 來跑這個 Pod，而不是預設的 runc。ARC 的 RunnerScaleSet 就是靠這個機制，讓每個 CI job 自動跑在 Kata MicroVM 裡。

**為 VM2 貼上 Node Label：**

為了確保 ARC Runner Pod 只排程到 VM2，而不會跑到 VM3 的生產環境上，需要幫 VM2 貼上專屬的 label。ARC RunnerScaleSet 的 `nodeSelector` 就是靠這個 label 來選擇目標 node：

```
dedicated=ci-security  → ARC Runner Pod 只落在這個 node 上
kata=true              → 標記這個 node 有 Kata runtime 可用
```

---

### 第三步：用 Terraform 管理所有基礎設施

所有平台元件都用 Terraform 管理，存放在 `infra` repo 的 `terraform/` 資料夾，不手動執行 helm install 或 kubectl apply。這樣做的好處是所有設定都有版本控制，可以追蹤每次變更，且可以重複執行，每次結果一致。

**Terraform module 設計：**

每個平台元件都是獨立的 module，職責清楚：

```
modules/
├── namespaces/     建立所有 K8s namespace，確保 namespace 存在才能建其他資源
├── harbor/         用 Helm 安裝 Harbor，並建立 ci project 和 arc-runner robot account
├── arc/            安裝 ARC Controller 和 RunnerScaleSet，綁定 Kata RuntimeClass
├── secrets/        建立 harbor-registry-secret，讓 Pod 可以從 Harbor 拉 image
├── kyverno/        安裝 Kyverno，建立 image 簽章驗證政策
├── runtimeclass/   建立 kata RuntimeClass
└── argocd_apps/    建立 Argo CD Application，管理 staging / production 部署
```

**敏感資料管理：**

所有密碼、token、private key 都存在 `terraform.tfvars` 裡，這個檔案只存在 VM1 本地，加進 `.gitignore` 確保不會 commit 到 GitHub。`terraform.tfvars` 和 `terraform.tfstate` 都存著私鑰，絕對不能 commit 到 repo。

---

### 第四步：建立 GitHub App 做 ARC 驗證

ARC 需要跟 GitHub 認證身份，才能接收 CI job。這裡選擇用 GitHub App 而不是 PAT，原因是 GitHub App 有細粒度的權限控制，而且 token 會自動輪換，不會綁定個人帳號。

**GitHub App 設定重點：**

- Webhook 關閉：ARC 使用 Long-Poll（主動輪詢）方式連線 GitHub，不需要 GitHub 主動打進來，所以不需要 Webhook，VM 也不需要公開 IP
- 只給最小必要權限：Actions、Administration、Checks、Contents、Pull requests

**ARC 的工作方式：**

ARC 裡有一個 ScaleSetListener Pod，它用 HTTPS long-poll 一直跟 GitHub 保持連線，等待有沒有新的 CI job 進來。當 GitHub 發出 job 訊號，ScaleSetListener 通知 ARC Controller，Controller 立刻在 K8s 建立一個 EphemeralRunner Pod，指定 `runtimeClassName: kata`，讓 job 跑在 Kata MicroVM 裡。job 完成後，Pod 自動銷毀，不留任何狀態。

---

### 第五步：Harbor + 自訂 Runner Image

**Harbor 安裝在 VM3：**

用 Terraform 的 Helm provider 把 Harbor 安裝到 `harbor` namespace，透過 `nodeSelector: {dedicated: production-storage}` 確保所有 Harbor Pod 都排到 VM3 上。Harbor 使用 NodePort 30443 對外提供服務，資料存在 VM3 的本地磁碟。

Harbor 用來存放專案所有的 image：
- App image（每次 main build 產出的）
- ARC runner image（自訂的 CI 工具 image）
- BuildKit image（用於 image build）
- ZAP image（用於 DAST）
- Cosign signature artifact（image 的數位簽章）

**自訂 Runner Image：**

預設的 `ghcr.io/actions/actions-runner:latest` 裡面沒有任何 CI 工具，每次 job 都要臨時下載 kubectl、syft、grype、cosign 等工具，速度慢又依賴外網。自訂 Runner Image 把所有工具預先打包進去：

```
harbor.jlsa.local:30443/ci/arc-runner:v0.4.0

內建：kubectl、buildctl、syft、grype、cosign
     jq、yq、git、curl、node、npm、tsc、python3
```

在 VM2 上 build 完成後 push 到 Harbor，ARC 建立 Runner Pod 時直接從 Harbor 拉這個 image，不需要再下載任何工具。

---

### 第六步：CI Pipeline

**PR 階段（六個 job 平行執行）：**

每次開 PR 或更新 PR branch，以下六個 job 會同時啟動，互不等待：

| 檔案 | 觸發時機 | 說明 |
|------|---------|------|
| `ci.yml` | PR only | Biome、tsc、Semgrep、Build、Hadolint，只在 PR 跑，merge 後不重複 |
| `codeql.yml` | PR | SAST 深度分析，結果上傳 GitHub Security tab |
| `dependency-review.yml` | PR | Dependency 漏洞與 License 風險 |
| `fossa.yml` | PR | License / 供應鏈掃描，目前 analyze-only bootstrap |
| `pr-dast.yml` | PR | 建立臨時 preview namespace，部署 image，跑 ZAP，清除 |
| CodeRabbit | PR | AI Code Review，SaaS，不跑在 K8s，只給建議不擋 PR |

**Main 階段（merge 後觸發）：**

| 檔案 | 觸發時機 | 說明 |
|------|---------|------|
| `main-build.yml` | push main | BuildKit build、SBOM、CVE scan、Cosign 簽章、Main Build DAST |
| `cd-staging.yml` | main-build 成功後 | 更新 GitOps staging digest、Argo CD sync、Staging DAST |
| `cd-production.yml` | staging DAST 通過 + 人工 approval | promote staging digest 到 production、Argo CD sync |

---

### 第七步：GitOps CD + Argo CD

GitOps repo 用 Kustomize 管理兩個環境的 overlay：

```
apps/youtube-music-bot/
├── base/               環境中立的共用資源（Deployment、Service）
└── overlays/
    ├── staging/        staging 專屬設定（namespace、NodePort、image digest）
    └── production/     production 專屬設定（namespace、NodePort、image digest）
```

base 裡定義通用的 K8s 資源，overlay 只描述跟 base 不同的部分。每次 CI 更新 staging 或 production 的 image digest，Argo CD 就會自動偵測並 sync，讓 cluster 的實際狀態追上 GitOps repo 定義的期望狀態。不需要手動執行任何 kubectl apply，所有部署都有 git commit 記錄，可以完整追蹤和回滾。

目前兩個 Argo CD Application 狀態：

```
youtube-music-bot-staging      Synced   Healthy
youtube-music-bot-production   Synced   Healthy
```

---

## Knowledge from Lecture

### Shift Left Security

把安全測試提前到開發流程的最早期。越早發現問題，修復成本越低。每個 PR 都自動跑 SAST、Dependency scan、License scan、DAST。

### Defense in Depth

不依賴單一工具，而是多層防護：

```
PR Gate
  ↓
Main Build Gate
  ↓
Image Supply Chain Gate（SBOM + CVE + Cosign）
  ↓
Main Build DAST
  ↓
Staging DAST Gate
  ↓
Production Approval
  ↓
Production Promotion
  ↓
Kyverno Admission Policy
```

任何一層發現問題就阻止往下走。

### GitOps

以 Git repository 作為系統狀態的唯一真實來源（Single Source of Truth）。Argo CD 持續監控 GitOps repo，有任何變更就自動同步到 K8s，所有部署都有 git 記錄可以追蹤和回滾。

### Immutable Infrastructure

基礎設施不做修改，只做替換。每次部署都是全新的 Pod，使用新的 image digest，不是在現有 Pod 上做更改。

### Zero Trust

不預設任何元件是可信任的：
- 每個 CI job 都在獨立 MicroVM 裡執行，完成後銷毀
- Production 只接受 staging 已驗證過的 digest
- Kyverno 驗證每個 Pod 的 Cosign 簽章（待修改逐步收緊中）

### SBOM（軟體元件清單）

列出 Container Image 裡所有套件、版本、License，方便追蹤供應鏈風險。使用 Syft 產生 SBOM，再用 Grype 掃描 CVE。

---

## Installation

> **注意**：本專題建立在自建 Kubernetes 叢集上，叢集的詳細建置步驟（kubeadm、Calico 安裝等）請參考 [Kubernetes 官方文件](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/)。以下說明假設 K8s 叢集已正常運作。

### 前置條件
在開始之前，你需要準備：
 
- 三台 Ubuntu 24.04 VM，建議規格：
  | VM | 角色 | 記憶體 | CPU | 磁碟 |
  |----|------|--------|-----|------|
  | VM1 | Control Plane | 16GB+ | 4 cores | 50GB |
  | VM2 | CI Worker | 32GB+ | 8 cores | 200GB |
  | VM3 | Production Worker | 32GB | 4 cores | 200GB |
- 三台 VM 在同一內網，可以互相連線
- VM2 已安裝 Kata Containers，RuntimeClass `kata` 已建立
- VM2 已設定 containerd 信任 Harbor（`certs.d/hosts.toml`）
- Helm 和 Terraform 已安裝在 VM1
- 三台 VM 的 K8s 叢集已建立，且 `kubectl get nodes` 三台都是 `Ready`

確認 node label：

```bash
kubectl get nodes -L dedicated
# node2 → dedicated=ci-security
# node3 → dedicated=production-storage
```

### 建立 Kubernetes 叢集
<details>
<summary>方式 A：一鍵 Script 自動安裝（建議）</summary>
把以下三個 script 分別在對應的 VM 上執行：
 
**VM1：**
```bash
sudo bash <(curl --ipv4 -fsSL https://raw.githubusercontent.com/Julie08080808/infra/main/scripts/setup-vm1.sh)
```
 
**VM2：**
```bash
sudo bash <(curl --ipv4 -fsSL https://raw.githubusercontent.com/Julie08080808/infra/main/scripts/setup-vm2.sh)
```
 
**VM3：**
```bash
sudo bash <(curl --ipv4 -fsSL https://raw.githubusercontent.com/Julie08080808/infra/main/scripts/setup-vm3.sh)
```
 
VM1 跑完後，畫面最後會印出 `kubeadm join` 指令，複製後分別在 VM2 和 VM3 執行加入叢集。
 
</details>
<details>
<summary>方式 B：手動安裝</summary>
**三台 VM 共同步驟：**
 
```bash
# 關閉 Swap
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab
 
# 載入核心模組
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
sudo modprobe overlay && sudo modprobe br_netfilter
 
# 設定網路參數
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
 
# 安裝 containerd
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml
sudo systemctl restart containerd && sudo systemctl enable containerd
 
# 安裝 K8s 工具
sudo mkdir -p /etc/apt/keyrings
curl -4 -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-archive-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-archive-keyring.gpg] \
  https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" \
  | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```
 
**VM1：初始化 Control Plane**
 
```bash
sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --node-name=vm1-control-plane
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
 
# 安裝 Calico CNI
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/tigera-operator.yaml
sleep 30
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/custom-resources.yaml
```
 
**VM2：額外安裝 Kata Containers**
 
```bash
wget https://github.com/kata-containers/kata-containers/releases/download/3.2.0/kata-static-3.2.0-amd64.tar.xz
sudo tar -xJf kata-static-3.2.0-amd64.tar.xz -C /
sudo ln -sf /opt/kata/bin/containerd-shim-kata-v2 /usr/local/bin/containerd-shim-kata-v2
 
sudo mkdir -p /etc/containerd/conf.d
sudo tee /etc/containerd/conf.d/kata.toml << 'EOF'
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.kata]
  runtime_type = 'io.containerd.kata.v2'
  privileged_without_host_devices = true
  [plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.kata.options]
    ConfigPath = '/opt/kata/share/defaults/kata-containers/configuration.toml'
EOF
 
sudo mkdir -p /etc/containerd/certs.d
sudo sed -i "s|config_path = ''|config_path = '/etc/containerd/certs.d'|g" \
  /etc/containerd/config.toml
sudo systemctl restart containerd
```
 
**VM2 和 VM3：加入叢集**
 
```bash
# 在 VM1 取得 join 指令
kubeadm token create --print-join-command
 
# 在 VM2 和 VM3 分別執行輸出的指令
sudo kubeadm join <VM1_IP>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```
 
**VM1：貼上 Node Label**
 
```bash
kubectl label nodes node2 kata=true dedicated=ci-security
kubectl label nodes node2 node-role.kubernetes.io/ci-worker=true
 
kubectl label nodes node3 dedicated=production-storage
kubectl label nodes node3 node-role.kubernetes.io/production-worker=true
```
 
</details>

---


### Step 1：Fork 或 clone 三個 repo

```bash
# App repo
https://github.com/Julie08080808/youtube-music-bot

# GitOps repo
https://github.com/Julie08080808/youtube-music-bot-gitops

# Infra repo
https://github.com/Julie08080808/infra
```

---
### Step 2：替換成你自己的設定

在執行 Terraform 之前，先把三個 repo 裡所有跟你有關的字串換掉。


#### 先填好這張表

| 變數 | 說明 | 你的值 |
|------|------|--------|
| `YOUR_GITHUB_OWNER` | 你的 GitHub 帳號 | 例如 `john-doe` |
| `YOUR_APP_NAME` | 你的 App 名稱，會用在 namespace、image、Argo CD | 例如 `my-web-app` |
| `YOUR_GITOPS_REPO` | 你的 GitOps repo 名稱 | 例如 `my-web-app-gitops` |
| `YOUR_VM3_IP` | VM3 的 IP | 例如 `192.168.1.100` |
| `YOUR_HARBOR_HOSTNAME` | Harbor 的 hostname | 例如 `harbor.example.com` |
| `YOUR_APP_PORT` | App 監聽的 port | 例如 `8080` |
| `YOUR_ARC_RUNNER_NAME` | ARC RunnerScaleSet 名稱，workflow 裡 `runs-on` 要對應這個 | 例如 `my-arc-runner` |

> `YOUR_ARC_RUNNER_NAME` 很重要：workflow 裡每個 job 都有 `runs-on: arc-runner-set`，這個值必須跟 Terraform 建立的 RunnerScaleSet 名稱一致，否則 job 會一直卡在 `Waiting for a runner`。

> **替換順序很重要**：`youtube-music-bot-gitops` 包含 `youtube-music-bot`，所以一定要先換 GitOps repo 名稱，再換 App 名稱，否則 GitOps repo 名稱會被錯誤替換。

---

#### infra repo（在 infra 根目錄執行）

```bash
# 第一步：先換 GitOps repo 名稱（包含 App 名稱，要先換）
find terraform/ -name "*.tf" -exec sed -i 's/youtube-music-bot-gitops/YOUR_GITOPS_REPO/g' {} \;

# 第二步：再換 App 名稱
find terraform/ -name "*.tf" -exec sed -i 's/youtube-music-bot/YOUR_APP_NAME/g' {} \;

# 第三步：換 GitHub 帳號
# 這個字串出現在 main.tf、argocd_apps/variables.tf、variables.tf 共三個地方
find terraform/ -name "*.tf" -exec sed -i 's/Julie08080808/YOUR_GITHUB_OWNER/g' {} \;

# 第四步：換 IP
find terraform/ -name "*.tf" -exec sed -i 's/10\.32\.20\.51/YOUR_VM3_IP/g' {} \;

# 第五步：換 Harbor hostname
find terraform/ -name "*.tf" -exec sed -i 's/harbor\.jlsa\.local/YOUR_HARBOR_HOSTNAME/g' {} \;

# 第六步：換 ARC RunnerScaleSet 名稱
find terraform/ -name "*.tf" -exec sed -i 's/arc-runner-set/YOUR_ARC_RUNNER_NAME/g' {} \;
```

**驗證是否替換成功：**

```bash
grep -r "youtube-music-bot-gitops" terraform/ && echo "❌ 還有沒換到的 GitOps repo 名稱" || echo "✅ GitOps repo 名稱替換完成"
grep -r "youtube-music-bot" terraform/ && echo "❌ 還有沒換到的 App 名稱" || echo "✅ App 名稱替換完成"
grep -r "Julie08080808" terraform/ && echo "❌ 還有沒換到的 GitHub 帳號" || echo "✅ GitHub 帳號替換完成"
grep -r "10\.32\.20\.51" terraform/ && echo "❌ 還有沒換到的 IP" || echo "✅ IP 替換完成"
grep -r "arc-runner-set" terraform/ && echo "❌ 還有沒換到的 ARC 名稱" || echo "✅ ARC 名稱替換完成"
```

---

#### GitOps repo（在 gitops repo 根目錄執行）

```bash
# 第一步：先換 GitOps repo 名稱（yaml 裡如果有引用到自己的 repo 名稱）
find . -name "*.yaml" -exec sed -i 's/youtube-music-bot-gitops/YOUR_GITOPS_REPO/g' {} \;

# 第二步：再換 App 名稱
find . -name "*.yaml" -exec sed -i 's/youtube-music-bot/YOUR_APP_NAME/g' {} \;

# 第三步：換 IP
find . -name "*.yaml" -exec sed -i 's/10\.32\.20\.51/YOUR_VM3_IP/g' {} \;

# 第四步：換 Harbor hostname
find . -name "*.yaml" -exec sed -i 's/harbor\.jlsa\.local/YOUR_HARBOR_HOSTNAME/g' {} \;

# 第五步：換 GitHub 帳號
find . -name "*.yaml" -exec sed -i 's/Julie08080808/YOUR_GITHUB_OWNER/g' {} \;

# 資料夾改名（一定要在 yaml 替換完之後做）
mv apps/youtube-music-bot apps/YOUR_APP_NAME
```

**驗證是否替換成功：**

```bash
grep -r "youtube-music-bot" . --include="*.yaml" && echo "❌ 還有沒換到的 App 名稱" || echo "✅ App 名稱替換完成"
grep -r "10\.32\.20\.51" . --include="*.yaml" && echo "❌ 還有沒換到的 IP" || echo "✅ IP 替換完成"
grep -r "Julie08080808" . --include="*.yaml" && echo "❌ 還有沒換到的 GitHub 帳號" || echo "✅ GitHub 帳號替換完成"
ls apps/ && echo "↑ 確認資料夾名稱正確"
```

---

#### App repo（在 app repo 根目錄執行）

```bash
# 第一步：先換 GitOps repo 名稱（workflow 裡有引用 GitOps repo URL）
find .github/workflows/ -name "*.yml" -exec sed -i 's/youtube-music-bot-gitops/YOUR_GITOPS_REPO/g' {} \;

# 第二步：再換 App 名稱
find .github/workflows/ -name "*.yml" -exec sed -i 's/youtube-music-bot/YOUR_APP_NAME/g' {} \;

# 第三步：換 GitHub 帳號
find .github/workflows/ -name "*.yml" -exec sed -i 's/Julie08080808/YOUR_GITHUB_OWNER/g' {} \;

# 第四步：換 IP
find .github/workflows/ -name "*.yml" -exec sed -i 's/10\.32\.20\.51/YOUR_VM3_IP/g' {} \;

# 第五步：換 Harbor hostname
find .github/workflows/ -name "*.yml" -exec sed -i 's/harbor\.jlsa\.local/YOUR_HARBOR_HOSTNAME/g' {} \;

# 第六步：換 ARC Runner 名稱（runs-on 要對應你的 RunnerScaleSet 名稱）
find .github/workflows/ -name "*.yml" -exec sed -i 's/runs-on: arc-runner-set/runs-on: YOUR_ARC_RUNNER_NAME/g' {} \;

# 如果你的 App port 不是 3000
find .github/workflows/ -name "*.yml" -exec sed -i 's/APP_PORT="3000"/APP_PORT="YOUR_APP_PORT"/g' {} \;
```

**驗證是否替換成功：**

```bash
grep -r "youtube-music-bot" .github/workflows/ && echo "❌ 還有沒換到的 App 名稱" || echo "✅ App 名稱替換完成"
grep -r "youtube-music-bot-gitops" .github/workflows/ && echo "❌ 還有沒換到的 GitOps repo 名稱" || echo "✅ GitOps repo 名稱替換完成"
grep -r "Julie08080808" .github/workflows/ && echo "❌ 還有沒換到的 GitHub 帳號" || echo "✅ GitHub 帳號替換完成"
grep -r "10\.32\.20\.51" .github/workflows/ && echo "❌ 還有沒換到的 IP" || echo "✅ IP 替換完成"
grep -r "runs-on: arc-runner-set" .github/workflows/ && echo "❌ 還有沒換到的 runs-on" || echo "✅ runs-on 替換完成"
```

---

#### 完整替換清單

全部做完後，用這個清單確認一遍：

```
infra repo
  ✅ GitOps repo 名稱替換完成
  ✅ App 名稱替換完成
  ✅ GitHub 帳號替換完成
  ✅ IP 替換完成
  ✅ Harbor hostname 替換完成
  ✅ ARC RunnerScaleSet 名稱替換完成

GitOps repo
  ✅ GitOps repo 名稱替換完成
  ✅ App 名稱替換完成（yaml 內容 + 資料夾名稱）
  ✅ IP 替換完成
  ✅ Harbor hostname 替換完成
  ✅ GitHub 帳號替換完成

App repo
  ✅ GitOps repo 名稱替換完成
  ✅ App 名稱替換完成
  ✅ GitHub 帳號替換完成
  ✅ IP 替換完成
  ✅ Harbor hostname 替換完成
  ✅ runs-on 對應到你的 ARC RunnerScaleSet 名稱
  ✅ App port 替換完成（如果不是 3000）
```

所有項目都確認後，才繼續 Step 3 ~!

---

### Step 3：建立 GitHub App（給 ARC 用）
 
1. 去 `https://github.com/settings/apps/new`
2. 填寫 App 名稱，Homepage URL 填你的 repo URL
3. **Webhook → Active：取消勾選**
4. 設定 Repository permissions：
   | 項目 | 設定值 |
   |------|--------|
   | Actions | Read & write |
   | Administration | Read & write |
   | Checks | Read & write |
   | Contents | Read |
   | Metadata | Read |
   | Pull requests | Read & write |
5. 點 **Create GitHub App**，記下 **App ID**
6. 點 **Generate a private key** → 下載 `.pem`
7. 點 **Install App** → 選你的 repo → 記下網址列的 **Installation ID**
---
 
### Step 4：設定 terraform.tfvars（VM1）
 
```bash
cd ~/infra/terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
```
 
填入以下內容：
 
```hcl
harbor_admin_password      = "你設定的 Harbor 密碼"
github_token               = "ghp_xxx..."
github_owner               = "YOUR_GITHUB_OWNER"
github_app_id              = "Step 3 取得的 App ID"
github_app_installation_id = "Step 3 取得的 Installation ID"
harbor_url                 = "https://YOUR_VM3_IP:30443"
harbor_runner_username     = "robot$arc-runner"
harbor_runner_password     = "稍後從 Harbor 介面取得"
gitops_repo_token          = "可寫入 GitOps repo 的 GitHub PAT"
 
github_app_private_key = <<EOT
-----BEGIN RSA PRIVATE KEY-----
貼上 .pem 檔案內容
-----END RSA PRIVATE KEY-----
EOT
```
 
> `terraform.tfvars` 絕對不能 commit 到 repo。
 
---
 
### Step 5：執行 Terraform（VM1）
 
```bash
cd ~/infra/terraform
terraform init
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```
 
完成後 Harbor robot account 的 secret 會自動建立，去 Harbor 介面取得後填回 `terraform.tfvars` 的 `harbor_runner_password`，再執行一次 `terraform apply`。
 
---
 
### Step 6：Build 並 Push 自訂 Runner Image（VM2）
 
設定 Docker 信任 Harbor    
```bash
echo '{"insecure-registries":["YOUR_VM3_IP:30443"]}' \
  | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```
設定 containerd 信任 Harbor
```bash    
sudo mkdir -p /etc/containerd/certs.d/YOUR_VM3_IP:30443
```
```bash
sudo tee /etc/containerd/certs.d/YOUR_VM3_IP:30443/hosts.toml << 'EOF'
server = "https://YOUR_VM3_IP:30443"
[host."https://YOUR_VM3_IP:30443"]
  capabilities = ["pull", "resolve", "push"]
  skip_verify = true
EOF
sudo systemctl restart containerd
```
登入 Harbor
```bash
docker login YOUR_VM3_IP:30443
```
Build 並 Push

```
cd infra
docker build \
  -t YOUR_VM3_IP:30443/ci/arc-runner:latest \
  -f runner-images/arc-runner/Dockerfile \
  runner-images/arc-runner/
```
```
docker push YOUR_VM3_IP:30443/ci/arc-runner:latest
```
 
---
 
### Step 7：設定 GitHub Actions Secrets
 
在 App repo 的 `Settings → Secrets and variables → Actions` 建立：
 
| Secret 名稱 | 說明 | 取得方式 |
|-------------|------|---------|
| `K8S_KUBECONFIG_B64` | kubeconfig base64 | `cat ~/.kube/config \| base64 -w0`（VM1 執行） |
| `HARBOR_USERNAME` | Harbor Robot Account 帳號 | Harbor 介面 → `robot$arc-runner` |
| `HARBOR_PASSWORD` | Harbor Robot Account 密碼 | Harbor 介面 |
| `HARBOR_CA_CRT` | Harbor CA 憑證 | `kubectl get secret harbor-tls -n harbor -o jsonpath='{.data.ca\.crt}'` |
| `COSIGN_PRIVATE_KEY` | Cosign 私鑰 | `cosign generate-key-pair` |
| `COSIGN_PUBLIC_KEY` | Cosign 公鑰 | 同上 |
| `COSIGN_PASSWORD` | Cosign 私鑰密碼 | 自訂 |
| `GITOPS_PAT` | 操作 GitOps repo 的 PAT | GitHub Settings → Tokens |
| `FOSSA_API_KEY` | FOSSA License 掃描 | `app.fossa.com → Integrations → API Tokens` |
 
---
 
### Step 8：驗證部署
 
確認三台 node 都 Ready 
```bash
kubectl get nodes -o wide
kubectl get nodes -L dedicated
```

確認 ARC Runner
```bash
kubectl get pods -n arc-runners -o wide
```
確認 ARC Runner 連上 GitHub
```bash
kubectl get AutoscalingRunnerSet -n arc-runners
```
確認 Harbor secrets
```bash
kubectl get secret harbor-registry-secret -n arc-runners
kubectl get secret harbor-registry-secret -n <<staging-youtube-music-bot>>
kubectl get secret harbor-registry-secret -n <<production-youtube-music-bot>>
```
    
確認 Argo CD Applications
```bash
kubectl get applications -n argocd
```
預期：
```bash
# YOUR_APP_NAME-staging      Synced   Healthy
# YOUR_APP_NAME-production   Synced   Healthy
```
確認服務
```bash
curl http://YOUR_VM3_IP:31081  # Staging
curl http://YOUR_VM3_IP:31080  # Production
```
 
---
## Usage
 
### 日常開發流程
 
每次開發新功能的標準流程：
 
```bash
# 1. 從最新的 main 建立 feature branch
git checkout main && git pull
git checkout -b feature/你的功能名稱
 
# 2. 開發、commit
git add .
git commit -m "feat: 描述你做了什麼"
git push -u origin feature/你的功能名稱
```
 
開 Pull Request 到 main 後，以下六個 check 會**自動平行執行**：
 
```
✓ CI（Biome、tsc、Semgrep、Hadolint）
✓ CodeQL SAST
✓ Dependency Review / Snyk
✓ FOSSA License 掃描
✓ PR DAST（preview 環境 + ZAP）
✓ CodeRabbit AI review
```
 
所有 check 通過後，merge PR，pipeline 會自動繼續：
 
```
merge main
    ↓ 自動
main-build（Build image + SBOM + CVE scan + Cosign）
    ↓ 自動
cd-staging（部署到 staging + ZAP DAST）
    ↓ DAST 通過後等待人工 approval
cd-production（部署到 production）
```
Production 需要：
1. Staging DAST 通過（FAIL = 0、WARN = 0）
2. **人工 Approval**（可人工或自動）

---

### Production Approval
 
Staging DAST 通過後，GitHub 會寄 Email 通知有 pending approval。
 
手動 approve 的步驟：
 
1. 去 `https://github.com/YOUR_GITHUB_OWNER/YOUR_APP_NAME/actions`
2. 點進正在等待的 `cd-production` workflow
3. 點 **Review deployments**
4. 勾選 `production` 環境
5. 填寫備註（可選）
6. 點 **Approve and deploy**
    
---    
    
### 查看 CI 結果
 
**GitHub Actions 頁面：**
```
https://github.com/YOUR_GITHUB_OWNER/YOUR_APP_NAME/actions
```
每次 push 或 PR 都會在這裡看到執行紀錄。

<img width="1870" height="854" alt="image" src="https://github.com/user-attachments/assets/82bf1b90-544c-4ba7-a527-1c06d2209405" />

 
**下載安全報告（Artifacts）：**
 
進入任一 workflow run，右側 **Artifacts** 區塊可以下載：
 
| Artifact | 說明 |
|---------|------|
| `biome-report` | Lint + Format 問題清單 |
| `tsc-report` | TypeScript 型別錯誤 |
| `zap-report` | OWASP ZAP 安全掃描報告（HTML + JSON） |
| `sbom-*.spdx.json` | 軟體元件清單 |
| `grype-*.json` | CVE 漏洞掃描結果 |
 
**Harbor（查看 image）：**
```
https://YOUR_VM3_IP:30443
帳號：admin
```
每次 main-build 成功，新的 image 會出現在 `ci/YOUR_APP_NAME` 這個 project 下。
 
**Argo CD（查看部署狀態）：**
```bash
kubectl get applications -n argocd
kubectl describe application YOUR_APP_NAME-staging -n argocd
```
---

### Rollback
 
如果 production 部署後發現問題，可以用 git revert 快速回滾：
 
```bash
# 在 GitOps repo 裡找到出問題的 commit
git log -- apps/YOUR_APP_NAME/overlays/production/kustomization.yaml
 
# 回滾
git revert <bad-commit>
git push origin main
```
 
Argo CD 偵測到變更後會自動 sync，回到前一個版本。
 
回滾後確認：
 
```bash
kubectl get pods -n production-YOUR_APP_NAME -o wide
curl http://YOUR_VM3_IP:31080
```    
---
 
### 手動觸發 Workflow
 
所有 workflow 都支援手動觸發，不一定要等 push 或 PR：
 
1. 去 GitHub Actions 頁面
2. 左側選擇要觸發的 workflow
3. 點右側 **Run workflow**
4. 選擇分支（通常是 `main`）
5. 點綠色 **Run workflow**
常見需要手動觸發的情況：
- 想重新跑 main-build 但沒有新 commit
- 想單獨測試某個 workflow
- Pipeline 中途失敗想從頭重跑
---

## Job Assignment

<!-- | 工作項目 | 說明 |
|---------|------|
| K8s 叢集建置 | 三台 VM 初始化、Calico CNI、node join、node label |
| Kata Containers | VM2 安裝設定、RuntimeClass、containerd 對接 |
| GitHub App + ARC | GitHub App 建立、ARC Controller、RunnerScaleSet |
| Harbor + Runner Image | Harbor 安裝、自訂 Runner Image build/push |
| Terraform IaC | infra repo 建立、所有 module 撰寫、terraform apply |
| CI Pipeline | ci.yml、codeql.yml、dependency-review.yml、fossa.yml、pr-dast.yml、main-build.yml |
| CD Pipeline | cd-staging.yml、cd-production.yml、GitOps repo 設計 |
| 文件撰寫 | README、架構說明、Installation guide | -->

|學號|名字|工作內容|
|---|----|------|
|112213061|陳章銓||
|112213065|張詠筑||

### 感謝名單
- MoLi 的 server
- Reg 的專案範例
- BT、蓬萊人偶、Reg 的建議

## References

### 官方文件

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kata Containers Documentation](https://katacontainers.io/docs/)
- [Actions Runner Controller](https://github.com/actions/actions-runner-controller)
- [Harbor Documentation](https://goharbor.io/docs/)
- [Argo CD Documentation](https://argo-cd.readthedocs.io/)
- [Kyverno Documentation](https://kyverno.io/docs/)
- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs)
- [Calico Documentation](https://docs.tigera.io/calico/latest/about/)
- [BuildKit Documentation](https://github.com/moby/buildkit)

### 安全工具文件

- [Biome](https://biomejs.dev/)
- [Semgrep Rules](https://semgrep.dev/r)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [Syft](https://github.com/anchore/syft)
- [Grype](https://github.com/anchore/grype)
- [Sigstore Cosign](https://docs.sigstore.dev/cosign/overview/)
- [FOSSA Documentation](https://docs.fossa.com/)
- [OWASP ZAP](https://www.zaproxy.org/docs/)
- [CodeRabbit Documentation](https://docs.coderabbit.ai/)

### 概念參考

- [DevSecOps: Shifting Security Left](https://www.redhat.com/en/topics/devops/what-is-devsecops)
- [OpenGitOps Principles](https://opengitops.dev/)
- [SBOM: Software Bill of Materials](https://www.cisa.gov/sbom)
- [Kata Containers Architecture](https://katacontainers.io/learn/)
- [Kustomize Documentation](https://kustomize.io/)


### 還可以再修正的地方

| 項目 | 現況 | 目標 |
|------|------|------|
| FOSSA | analyze-only bootstrap | run-tests: true，正式 PR gate |
| Biome | report only | 修完問題後改為 blocking |
| Hadolint | report only | 修完 Dockerfile 後改為 blocking |
| PR DAST WARN | 不擋 | 修完 security headers 後改為 blocking |
| Main Build DAST WARN | 不擋 | 之後改為 blocking |
| Kyverno | audit / warn | Enforce（未簽章 image 不准部署） |
| Branch Protection | 部分完成 | 逐步加入 required checks |
| Monitoring | 未完成 | Prometheus + Grafana + Loki |
