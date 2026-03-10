#!/bin/bash
set -e

echo "=== [1/4] Preparando sistema e atualizando pacotes base ==="
sudo apt update
sudo apt install python3-venv python3-pip npm wget tar -y

echo "=== [2/4] Configurando ambiente Python (.venv) ==="
python3 -m venv .venv
source .venv/bin/activate
# Instalando as bibliotecas exigidas pelo Server MCP de Análise Local
pip install bandit ruff mypy safety pdoc radon pytest-cov

echo "=== [3/4] Instalando dependências de Frontend (React/Vite) ==="
# O ESLint com plugins de segurança DEVE ser instalado no package.json local do front
if [ -d "frontend" ]; then
    cd frontend
    npm install --save-dev eslint eslint-plugin-security @eslint/js
    cd ..
else
    echo "⚠️ Diretório 'frontend' não localizado! Pulando a instalação do ESLint."
fi

echo "=== [4/4] Instalando Gitleaks (CLI Global) ==="
wget -O gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz
# Extrai estritamente o binário, evitando sujeira de arquivos de licença no diretório
tar -zxvf gitleaks.tar.gz gitleaks
sudo mv gitleaks /usr/local/bin/
rm gitleaks.tar.gz

echo "=== [5/5] Instalando Scanners de Infra e API ==="
sudo npm install -g @stoplight/spectral-cli

# Trivy (Scanner CLI Global)
wget -O trivy.tar.gz https://github.com/aquasecurity/trivy/releases/download/v0.69.3/trivy_0.69.3_Linux-64bit.tar.gz
tar -zxvf trivy.tar.gz trivy
sudo mv trivy /usr/local/bin/
rm trivy.tar.gz

# Hadolint (Linter Global)
wget -O hadolint https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64
chmod +x hadolint
sudo mv hadolint /usr/local/bin/

echo "✅ Sucesso: Todas as instâncias estáticas foram atracadas no ambiente!"
