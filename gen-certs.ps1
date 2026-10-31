$ips = Get-NetIPAddress -AddressFamily IPv4 `
  | Where-Object { $_.IPAddress -notlike "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } `
  | Select-Object -ExpandProperty IPAddress -Unique

$addresses = @(
  "localhost",
  "127.0.0.1",
  "protocol-city.local",
  "game.local",
  "*.local"
) + $ips

Write-Host "Сертификат для:" -ForegroundColor Green
$addresses | ForEach-Object { Write-Host "  - $_" }

New-Item -ItemType Directory -Force certs | Out-Null

.\mkcert-official.exe -cert-file certs\cert.pem -key-file certs\key.pem @addresses