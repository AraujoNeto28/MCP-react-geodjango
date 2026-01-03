# Para e remove containers antigos que usam a imagem geodjango-mcp-frontend
Write-Host "Limpando containers antigos do frontend..."
$containers = docker ps -a -q --filter "ancestor=geodjango-mcp-frontend"
if ($containers) {
    docker rm -f $containers
}

# Construir a nova imagem
Write-Host "Construindo nova imagem do frontend (Nginx)..."
docker build -t geodjango-mcp-frontend .

# Se o build der certo, roda o container
if ($LASTEXITCODE -eq 0) {
    Write-Host "Iniciando frontend em http://localhost:5173 ..."
    Write-Host "Proxy: /api -> host.docker.internal:3000"

    # Força host.docker.internal a resolver para o gateway IPv4 do host.
    # Evita tentativa de IPv6 (Network unreachable) e remove instabilidade no proxy.
    docker run -d --name geodjango-mcp-frontend -p 5173:80 --add-host=host.docker.internal:host-gateway geodjango-mcp-frontend

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Frontend iniciado. Logs: docker logs -f geodjango-mcp-frontend"
    }
} else {
    Write-Host "Erro no build. O container não será iniciado."
}
