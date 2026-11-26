#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$HerdrHome = $(if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $HOME '.config/herdr-app' }),
    [string]$HerdrApp = 'herdr-app',
    [ValidateSet('en', 'zh-CN')]
    [string]$Language = 'en',
    [switch]$Activate
)

$ErrorActionPreference = 'Stop'
$layoutName = 'main-vscode-bridge'
$modName = 'vscode-bridge'
$source = Join-Path $PSScriptRoot "mods/$modName"
$modPath = Join-Path $HerdrHome "mods/$modName"
$layoutPath = Join-Path $HerdrHome "layouts/$layoutName.json"
$keysPath = Join-Path $HerdrHome 'keys.json'
$keySection = "layout:${layoutName}"

foreach ($path in @($modPath, $layoutPath)) {
    if (Test-Path -LiteralPath $path) { throw "Already exists: $path" }
}

# Keep the shipped status block and give the bridge its own button beside it.
$layout = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $HerdrHome 'layouts/main.json') | ConvertFrom-Json
$work = $layout.children | Where-Object id -EQ 'work'
$status = $work.children | Where-Object id -EQ 'status'
if (@($status).Count -ne 1 -or $status.content.mod -ne 'workspace-status') {
    throw 'The shipped main layout has changed. Add the bridge to a copy manually using the README.'
}
if ($layout.PSObject.Properties['link_handlers']) { throw 'Expected a clean shipped main layout.' }
$layout | Add-Member -NotePropertyName link_handlers -NotePropertyValue @($modName)
$statusSize = $status.size
$status.PSObject.Properties.Remove('size')
$statusRow = [ordered]@{
    id = 'status-with-vscode'
    type = 'row'
    size = $statusSize
    children = @(
        $status
        @{ id = $modName; type = 'block'; size = @{ px = 132 }; content = @{ mod = $modName } }
    )
}
$work.children = @($work.children | ForEach-Object { if ($_.id -eq 'status') { $statusRow } else { $_ } })

$keys = Get-Content -Raw -Encoding UTF8 -LiteralPath $keysPath | ConvertFrom-Json
if ($keys.PSObject.Properties[$keySection]) { throw "Already exists in keys.json: $keySection" }
$keys | Add-Member -NotePropertyName $keySection -NotePropertyValue ([pscustomobject]@{
    'ctrl-shift-g' = "mod.open:${modName}"
})

& $HerdrApp check $source | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Herdr mod check failed.' }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$layoutJson = $layout | ConvertTo-Json -Depth 100
$keysJson = $keys | ConvertTo-Json -Depth 100
$suffix = [guid]::NewGuid().ToString('N')
$stagedMod = Join-Path $HerdrHome "mods/.$modName.$suffix"
$stagedLayout = "$layoutPath.$suffix"
$stagedKeys = "$keysPath.$suffix"
Copy-Item -LiteralPath $source -Destination $stagedMod -Recurse
if ($Language -eq 'zh-CN') {
    [IO.File]::WriteAllText((Join-Path $stagedMod 'locale.json'), '{"language":"zh-CN"}', $utf8)
}
[IO.File]::WriteAllText($stagedLayout, $layoutJson + [Environment]::NewLine, $utf8)
[IO.File]::WriteAllText($stagedKeys, $keysJson + [Environment]::NewLine, $utf8)
Move-Item -LiteralPath $stagedMod -Destination $modPath
Move-Item -LiteralPath $stagedLayout -Destination $layoutPath
[IO.File]::Replace($stagedKeys, $keysPath, [System.Management.Automation.Language.NullString]::Value)

if ($Activate) {
    $deadline = (Get-Date).AddSeconds(10)
    do {
        $switch = & $HerdrApp do layout.switch --name $layoutName 2>&1
        $switchExit = $LASTEXITCODE
        if (!$switchExit) { break }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    if ($switchExit) { throw "Could not switch layouts: $switch" }
    $switch
}
