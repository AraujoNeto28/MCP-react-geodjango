# Parar e remover containers antigos que usam a imagem geodjango-backend
Write-Host "Limpando containers antigos..."
$containers = docker ps -a -q --filter "ancestor=geodjango-backend"
if ($containers) {
    docker rm -f $containers
}

# Construir a nova imagem
Write-Host "Construindo nova imagem..."
docker build -t geodjango-backend .

# Se o build der certo, roda o container
if ($LASTEXITCODE -eq 0) {
    Write-Host "Iniciando servidor..."
    docker run -p 3000:3000 --env-file .env geodjango-backend
} else {
    Write-Host "Erro no build. O container não será iniciado."
}
