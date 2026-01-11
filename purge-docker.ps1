param(
  [switch]$Force
)

$ErrorActionPreference = 'Continue'

function Get-DockerIds {
  param(
    [Parameter(Mandatory=$true)][string[]]$Args
  )

  $out = & docker @Args 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $out) {
    return @()
  }

  return @($out | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker CLI (docker) não encontrado no PATH.'
  exit 1
}

$forceArg = @()
if ($Force) {
  $forceArg = @('-f')
}

# 1) Kill containers em execução
$running = Get-DockerIds -Args @('ps', '-q')
if ($running.Count -gt 0) {
  Write-Host ("Killing {0} containers..." -f $running.Count)
  & docker kill @running | Out-Null
} else {
  Write-Host 'Nenhum container em execução para matar.'
}

# 2) Remove todos os containers (parados e já mortos)
$allContainers = Get-DockerIds -Args @('ps', '-aq')
if ($allContainers.Count -gt 0) {
  Write-Host ("Removing {0} containers..." -f $allContainers.Count)
  & docker rm @forceArg @allContainers | Out-Null
} else {
  Write-Host 'Nenhum container para remover.'
}

# 3) Remove todas as imagens
$images = Get-DockerIds -Args @('images', '-q')
if ($images.Count -gt 0) {
  Write-Host ("Removing {0} images..." -f $images.Count)
  & docker rmi @forceArg @images | Out-Null
} else {
  Write-Host 'Nenhuma imagem para remover.'
}

# 4) Remove volumes dangling
$danglingVolumes = Get-DockerIds -Args @('volume', 'ls', '-qf', 'dangling=true')
if ($danglingVolumes.Count -gt 0) {
  Write-Host ("Removing {0} dangling volumes..." -f $danglingVolumes.Count)
  & docker volume rm @danglingVolumes | Out-Null
} else {
  Write-Host 'Nenhum volume dangling para remover.'
}

# 5) System prune (containers/images/network/cache não usados)
Write-Host 'Running: docker system prune -a'
& docker system prune -a @forceArg | Out-Null

# 6) Volume prune (volumes não usados)
Write-Host 'Running: docker volume prune'
& docker volume prune @forceArg | Out-Null

Write-Host 'OK: Docker purge concluído.'
