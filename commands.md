# 🛠️ Raw K8s Deployments CLI Command Reference

This file contains the **pure, raw terminal commands** to deploy, test, and teardown both Blue-Green and Canary releases manually in your Kubernetes cluster, without using the `playground.sh` script.

---

## 🏗️ 1. Setup Namespace & Redis Backend
Run this first to initialize the playground environment:
```bash
# Create namespace
kubectl apply -f k8s/common/namespac.yaml

# Deploy Redis cache
kubectl apply -f k8s/common/redis-deployment.yaml

# Create Redis ClusterIP service
kubectl apply -f k8s/common/redis-service.yaml
```

---

## 🔵🟢 2. Blue-Green Release Workflow (Manual)

### A. Deploy Environments
1. Deploy the original **Blue** container (`v1.0.0`) and the active routing service:
   ```bash
   kubectl apply -f k8s/blue-green/deployment-blue.yaml
   kubectl apply -f k8s/blue-green/service.yaml
   ```
2. Deploy the upgraded **Green** container (`v2.0.0`) in isolation:
   ```bash
   kubectl apply -f k8s/blue-green/deployment-green.yaml
   ```

### B. Bridge & Test Traffic
1. **Port-Forward** the active service in a separate terminal:
   ```bash
   kubectl port-forward svc/colordeploy-active-service -n colordeploy 8080:80
   ```
2. **Start Polling** in another terminal to watch responses:
   ```bash
   while true; do curl -s --connect-timeout 2 http://localhost:8080/health | jq -r '.color + " (" + .version + ") pod: " + .pod'; sleep 0.2; done
   ```
   *(Initially, this loop will return only `blue` pods).*

### C. Shift Traffic (Blue ➡️ Green)
Execute a zero-downtime cutover by patching the service selector to target `green` pods:
```bash
kubectl patch service colordeploy-active-service -n colordeploy -p '{"spec":{"selector":{"color":"green"}}}'
```
*(Observe your polling terminal shift immediately to green pods with no dropped requests).*

### D. Rollback Traffic (Green ➡️ Blue)
If you need to instantly route users back to the stable Blue pods:
```bash
kubectl patch service colordeploy-active-service -n colordeploy -p '{"spec":{"selector":{"color":"blue"}}}'
```

---

## 🐤 3. Canary Release Workflow (Manual)

### A. Deploy Environments
1. Deploy the **Stable Production pool** (`v1.0.0` with 9 replicas) and the shared service:
   ```bash
   kubectl apply -f k8s/canary/deployment-stable.yaml
   kubectl apply -f k8s/canary/service.yaml
   ```
2. Introduce the **Canary pod** (`v2.0.0-canary` with 1 replica):
   ```bash
   kubectl apply -f k8s/canary/deployment-canary.yaml
   ```

### B. Bridge & Test Traffic
1. **Port-Forward** the Canary service in a separate terminal:
   ```bash
   kubectl port-forward svc/colordeploy-canary-service -n colordeploy 8080:80
   ```
2. **Start Polling** in another terminal to monitor the 90/10 traffic split:
   ```bash
   while true; do curl -s --connect-timeout 2 http://localhost:8080/health | jq -r '.color + " (" + .version + ") pod: " + .pod'; sleep 0.2; done
   ```
   *(Observe that approximately 10% of responses return yellow `canary` pods).*

### C. Send a Continuous Load Test
Send 100 rapid requests to mock user traffic and watch the exact pod distribution:
```bash
for i in {1..100}; do curl -s http://localhost:8080/ab-test | jq -r '.message'; sleep 0.1; done
```

### D. Promote the Release (100% Stable Rollout)
If the Canary pod performs cleanly, update your stable deployment image and scale down the canary pod:
```bash
# Update stable image to version v2.0.0
kubectl set image deployment/colordeploy-stable app=colordeploy-app:v2.0.0 -n colordeploy

# Terminate the canary pod
kubectl scale deployment/colordeploy-canary --replicas=0 -n colordeploy
```

---

## 🧹 4. Tear Down & Cleanup
Wipe out every container, pod, service, deployment, and configuration instantly:
```bash
kubectl delete namespace colordeploy
```
