#!/bin/bash

# ==============================================================================
# K8s Deployments Telemetry Playground CLI
# ==============================================================================
# A unified utility to deploy, test, and tear down Blue-Green and Canary releases.

NAMESPACE="colordeploy"
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Direct path helper
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  echo -e "${BLUE}=== K8s Deployments Playground Helper ===${NC}"
  echo "Usage: ./playground.sh [command]"
  echo ""
  echo "Commands:"
  echo "  deploy-bg      - Apply Redis backend and Blue-Green deployment manifests"
  echo "  deploy-canary  - Apply Redis backend and Canary deployment manifests"
  echo "  switch-green   - Switch the active Blue-Green service selector to Green"
  echo "  switch-blue    - Switch the active Blue-Green service selector to Blue"
  echo "  stop           - Clean up all Kubernetes resources by deleting the namespace"
  echo "  port-forward   - Port forward the active K8s service to localhost:8080"
  echo "  test-cli       - Run the continuous terminal polling loop (queries localhost:8080)"
  echo "  run-local      - Start the Node.js server locally on port 3000 (no K8s required)"
  echo "  help           - Show this help manual"
  echo ""
}

check_kubectl() {
  if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl CLI is not installed.${NC}"
    exit 1
  fi
}

case "$1" in
  deploy-bg)
    check_kubectl
    echo -e "${GREEN}Applying Blue-Green Infrastructure...${NC}"
    kubectl apply -f "$DIR/k8s/common/namespac.yaml"
    kubectl apply -f "$DIR/k8s/common/redis-deployment.yaml"
    kubectl apply -f "$DIR/k8s/common/redis-service.yaml"
    kubectl apply -f "$DIR/k8s/blue-green/deployment-blue.yaml"
    kubectl apply -f "$DIR/k8s/blue-green/deployment-green.yaml"
    kubectl apply -f "$DIR/k8s/blue-green/service.yaml"
    echo -e "${YELLOW}Status check:${NC}"
    kubectl get all -n $NAMESPACE
    ;;

  deploy-canary)
    check_kubectl
    echo -e "${GREEN}Applying Canary Infrastructure...${NC}"
    kubectl apply -f "$DIR/k8s/common/namespac.yaml"
    kubectl apply -f "$DIR/k8s/common/redis-deployment.yaml"
    kubectl apply -f "$DIR/k8s/common/redis-service.yaml"
    kubectl apply -f "$DIR/k8s/canary/deployment-stable.yaml"
    kubectl apply -f "$DIR/k8s/canary/deployment-canary.yaml"
    kubectl apply -f "$DIR/k8s/canary/service.yaml"
    echo -e "${YELLOW}Status check:${NC}"
    kubectl get all -n $NAMESPACE
    ;;

  switch-green)
    check_kubectl
    echo -e "${GREEN}Switching traffic to Green environment...${NC}"
    kubectl patch service colordeploy-active-service -n $NAMESPACE -p '{"spec":{"selector":{"color":"green"}}}'
    ;;

  switch-blue)
    check_kubectl
    echo -e "${GREEN}Switching traffic to Blue environment...${NC}"
    kubectl patch service colordeploy-active-service -n $NAMESPACE -p '{"spec":{"selector":{"color":"blue"}}}'
    ;;

  stop)
    check_kubectl
    echo -e "${RED}Tearing down all Kubernetes resources...${NC}"
    kubectl delete namespace $NAMESPACE
    echo -e "${GREEN}Tear down completed successfully.${NC}"
    ;;

  port-forward)
    check_kubectl
    # Determine which service is active to port forward
    if kubectl get svc colordeploy-active-service -n $NAMESPACE &> /dev/null; then
      SVC="colordeploy-active-service"
    elif kubectl get svc colordeploy-canary-service -n $NAMESPACE &> /dev/null; then
      SVC="colordeploy-canary-service"
    else
      echo -e "${RED}Error: No active colordeploy services found. Deploy one first!${NC}"
      exit 1
    fi
    echo -e "${GREEN}Starting Port Forward for service/$SVC to http://localhost:8080...${NC}"
    echo -e "${YELLOW}Leave this terminal running and open a new one to test.${NC}"
    kubectl port-forward svc/$SVC -n $NAMESPACE 8080:80
    ;;

  test-cli)
    echo -e "${GREEN}Starting terminal polling telemetry loop on http://localhost:8080/health...${NC}"
    echo "Press [CTRL+C] to stop."
    echo "--------------------------------------------------------"
    if ! command -v jq &> /dev/null; then
      echo -e "${YELLOW}Warning: 'jq' tool not found. Displaying raw responses...${NC}"
      while true; do
        curl -s --connect-timeout 2 http://localhost:8080/health || echo "Connection refused"
        sleep 0.2
      done
    else
      while true; do
        RESP=$(curl -s --connect-timeout 2 http://localhost:8080/health)
        if [ $? -eq 0 ] && [ ! -z "$RESP" ]; then
          COLOR=$(echo "$RESP" | jq -r '.color // "unknown"')
          VER=$(echo "$RESP" | jq -r '.version // "0.0.0"')
          POD=$(echo "$RESP" | jq -r '.pod // "unknown-pod"')
          
          # Colorize output based on active deployment color
          case "$COLOR" in
            blue)  echo -e "[$(date +%T)] ${BLUE}BLUE${NC}  version: $VER | pod: $POD" ;;
            green) echo -e "[$(date +%T)] ${GREEN}GREEN${NC} version: $VER | pod: $POD" ;;
            canary)echo -e "[$(date +%T)] ${YELLOW}CANARY${NC} version: $VER | pod: $POD" ;;
            *)     echo -e "[$(date +%T)] $COLOR  version: $VER | pod: $POD" ;;
          esac
        else
          echo -e "[$(date +%T)] ${RED}Error: Server Unreachable (is port-forward active?)${NC}"
        fi
        sleep 0.2
      done
    fi
    ;;

  run-local)
    echo -e "${GREEN}Starting Node.js server locally on port 3000...${NC}"
    node "$DIR/server.js"
    ;;

  *)
    show_help
    ;;
esac
