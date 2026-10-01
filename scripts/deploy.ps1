param(
  [string]$Target,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:AllowedTargets = @('SWE', 'NCE', 'SalesRep', 'All')
$script:ProjectTitles = @{
  SWE = 'Simulateur Remuneration Variable'
  NCE = 'Simulateur Remuneration Variable NCE'
  SalesRep = 'Sales Rep Variable Compensation Calculator'
}
$script:SelectedTargets = @()
$script:CurrentTarget = $null
$script:ScratchRoot = $null
$script:DeployedTargets = New-Object 'System.Collections.Generic.List[string]'
$script:PushedTargets = New-Object 'System.Collections.Generic.List[string]'

if (-not $PSBoundParameters.ContainsKey('Target') -or
    [string]::IsNullOrWhiteSpace($Target)) {
  [Console]::Error.WriteLine('A target is required. Use -Target SWE|NCE|SalesRep|All.')
  exit 2
}
if ($script:AllowedTargets -cnotcontains $Target) {
  [Console]::Error.WriteLine('Invalid target. Use exactly SWE, NCE, SalesRep, or All.')
  exit 2
}

if ($Target -eq 'All') {
  $script:SelectedTargets = @('SWE', 'NCE', 'SalesRep')
} else {
  $script:SelectedTargets = @($Target)
}

function Invoke-CheckedTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Purpose
  )

  try {
    & $Name @Arguments
    $code = $LASTEXITCODE
  } catch {
    throw "$Purpose failed; no remote changes were made."
  }
  if ($code -ne 0) {
    throw "$Purpose failed (exit code $code); no remote changes were made."
  }
}

function Invoke-Clasp {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  $operation = $Arguments[0]
  Push-Location -LiteralPath $WorkingDirectory
  try {
    try {
      $output = & clasp @Arguments 2>$null
      $code = $LASTEXITCODE
    } catch {
      throw "clasp $operation could not be run; output was withheld."
    }
    if ($code -ne 0) {
      throw "clasp $operation failed (exit code $code); output was withheld."
    }
    return (@($output) -join "`n")
  } finally {
    Pop-Location
  }
}

function Invoke-RepositoryChecks {
  Invoke-CheckedTool -Name 'node' -Arguments @('build.js', '--check') `
    -Purpose 'Repository bundle freshness check'

  $previousCheckFlag = $env:PEX_DEPLOY_WRAPPER_CHECK
  try {
    $env:PEX_DEPLOY_WRAPPER_CHECK = '1'
    Invoke-CheckedTool -Name 'npm' -Arguments @('run', 'lint') -Purpose 'npm run lint'
    Invoke-CheckedTool -Name 'npm' -Arguments @('test') -Purpose 'npm test'
  } finally {
    $env:PEX_DEPLOY_WRAPPER_CHECK = $previousCheckFlag
  }
}

function Get-ProjectProperties {
  param([Parameter(Mandatory = $true)]$Project)

  $title = $null
  foreach ($propertyName in @('title', 'name')) {
    if ($Project.PSObject.Properties[$propertyName] -and
        -not [string]::IsNullOrWhiteSpace([string]$Project.$propertyName)) {
      $title = [string]$Project.$propertyName
      break
    }
  }
  $scriptId = $null
  foreach ($propertyName in @('scriptId', 'id')) {
    if ($Project.PSObject.Properties[$propertyName] -and
        -not [string]::IsNullOrWhiteSpace([string]$Project.$propertyName)) {
      $scriptId = [string]$Project.$propertyName
      break
    }
  }
  if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($scriptId)) {
    throw 'clasp list --json returned an incomplete project entry.'
  }
  return [pscustomobject]@{ Title = $title; ScriptId = $scriptId }
}

function Get-ProjectList {
  $raw = Invoke-Clasp -Arguments @('list', '--json') -WorkingDirectory $script:RepositoryRoot
  try {
    $parsed = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
  } catch {
    throw 'clasp list --json returned invalid JSON; project discovery stopped.'
  }

  if ($parsed.PSObject.Properties['projects']) {
    $entries = @($parsed.projects)
  } else {
    $entries = @($parsed)
  }
  if ($entries.Count -eq 0) {
    throw 'clasp list --json returned no existing projects.'
  }
  $projects = @()
  foreach ($entry in $entries) {
    $projects += Get-ProjectProperties -Project $entry
  }
  return ,$projects
}

function Test-ProjectTitle {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectTitle,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  if (-not $script:ProjectTitles.ContainsKey($SelectedTarget)) {
    return $false
  }
  return $ProjectTitle.Trim() -ceq $script:ProjectTitles[$SelectedTarget]
}

function Resolve-Project {
  param(
    [Parameter(Mandatory = $true)][object[]]$Projects,
    [Parameter(Mandatory = $true)][string]$SelectedTarget,
    [Parameter(Mandatory = $true)]$RootConfig
  )

  $matches = @($Projects | Where-Object {
    Test-ProjectTitle -ProjectTitle $_.Title -SelectedTarget $SelectedTarget
  })
  if ($matches.Count -ne 1) {
    throw "$SelectedTarget project name must match exactly one existing Apps Script project; found $($matches.Count)."
  }
  if ($SelectedTarget -eq 'SWE' -and $matches[0].ScriptId -cne [string]$RootConfig.scriptId) {
    throw 'The unique SWE project name does not match the root .clasp.json project.'
  }
  return $matches[0]
}

function Get-Base64File {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required project file is missing: $(Split-Path -Leaf $Path)."
  }
  return [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($Path))
}

function Test-Base64FilesEqual {
  param(
    [Parameter(Mandatory = $true)][string]$FirstPath,
    [Parameter(Mandatory = $true)][string]$SecondPath
  )
  return ((Get-Base64File -Path $FirstPath) -ceq (Get-Base64File -Path $SecondPath))
}

function Assert-FileInventory {
  param(
    [Parameter(Mandatory = $true)][string[]]$Actual,
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  $actualSorted = @($Actual | Sort-Object -CaseSensitive)
  $expectedSorted = @($Expected | Sort-Object -CaseSensitive)
  if ($actualSorted.Count -ne $expectedSorted.Count -or
      [string]::Join('|', $actualSorted) -cne [string]::Join('|', $expectedSorted)) {
    throw "$SelectedTarget file inventory mismatch; expected only $([string]::Join(', ', $expectedSorted))."
  }
}

function Get-StatusPath {
  param([Parameter(Mandatory = $true)]$Entry)

  if ($Entry -is [string]) {
    $name = $Entry
  } elseif ($Entry.PSObject.Properties['path']) {
    $name = [string]$Entry.path
  } elseif ($Entry.PSObject.Properties['name']) {
    $name = [string]$Entry.name
  } elseif ($Entry.PSObject.Properties['fileName']) {
    $name = [string]$Entry.fileName
  } else {
    throw 'clasp status --json returned an unsupported file entry.'
  }
  $name = $name.Replace('\', '/')
  if ($name.StartsWith('./')) {
    $name = $name.Substring(2)
  }
  return $name
}

function Assert-StatusInventory {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget,
    [Parameter(Mandatory = $true)][string[]]$ExpectedFiles
  )

  $raw = Invoke-Clasp -Arguments @('status', '--json') -WorkingDirectory $ProjectPath
  try {
    $status = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
  } catch {
    throw "$SelectedTarget clasp status --json returned invalid JSON."
  }
  if (-not $status.PSObject.Properties['filesToPush']) {
    throw "$SelectedTarget clasp status --json did not include filesToPush."
  }
  $actual = @()
  foreach ($entry in @($status.filesToPush)) {
    $actual += Get-StatusPath -Entry $entry
  }
  Assert-FileInventory -Actual $actual -Expected $ExpectedFiles -SelectedTarget $SelectedTarget
  if ($status.PSObject.Properties['filesToDelete'] -and
      $null -ne $status.filesToDelete -and @($status.filesToDelete).Count -gt 0) {
    throw "$SelectedTarget push would delete remote files; deployment stopped."
  }
}

function Assert-LocalInventory {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget,
    [Parameter(Mandatory = $true)][string[]]$ExpectedFiles
  )

  $actual = @()
  $rootPrefix = $ProjectPath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  foreach ($file in Get-ChildItem -LiteralPath $ProjectPath -File -Recurse -Force) {
    $relative = $file.FullName.Substring($rootPrefix.Length).Replace('\', '/')
    if ($relative -cne '.clasp.json') {
      $actual += $relative
    }
  }
  Assert-FileInventory -Actual $actual -Expected $ExpectedFiles -SelectedTarget $SelectedTarget
}

function Assert-SweAllowlist {
  param([Parameter(Mandatory = $true)][string[]]$ExpectedFiles)

  $ignorePath = Join-Path $script:RepositoryRoot '.claspignore'
  if (-not (Test-Path -LiteralPath $ignorePath -PathType Leaf)) {
    throw 'SWE .claspignore is missing.'
  }
  $includes = @(
    Get-Content -LiteralPath $ignorePath |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.StartsWith('!') } |
      ForEach-Object { $_.Substring(1) } |
      Sort-Object -CaseSensitive
  )
  Assert-FileInventory -Actual $includes -Expected $ExpectedFiles -SelectedTarget 'SWE .claspignore'
}

function Get-DeploymentRecord {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  $raw = Invoke-Clasp -Arguments @('deployments') -WorkingDirectory $ProjectPath
  $versioned = @()
  $trimmed = $raw.Trim()
  if ($trimmed.StartsWith('{') -or $trimmed.StartsWith('[')) {
    try {
      $parsed = ConvertFrom-Json -InputObject $trimmed -ErrorAction Stop
    } catch {
      throw "$SelectedTarget deployment listing returned invalid JSON."
    }
    if ($parsed.PSObject.Properties['deployments']) {
      $rows = @($parsed.deployments)
    } else {
      $rows = @($parsed)
    }
    foreach ($row in $rows) {
      $id = $null
      $version = $null
      foreach ($propertyName in @('deploymentId', 'id')) {
        if ($row.PSObject.Properties[$propertyName]) {
          $id = [string]$row.$propertyName
          break
        }
      }
      foreach ($propertyName in @('versionNumber', 'version')) {
        if ($row.PSObject.Properties[$propertyName]) {
          $version = [string]$row.$propertyName
          break
        }
      }
      if ([string]::IsNullOrWhiteSpace($id) -or [string]::IsNullOrWhiteSpace($version)) {
        throw "$SelectedTarget deployment listing contains an incomplete row."
      }
      if ($version -ieq 'HEAD') {
        continue
      }
      if ($version -match '^\d+$') {
        $versioned += [pscustomobject]@{ DeploymentId = $id; Version = $version }
      } else {
        throw "$SelectedTarget deployment listing contains an unrecognized version."
      }
    }
  } else {
    foreach ($line in ($raw -split "`r?`n")) {
      if ($line -match '^\s*-\s*(\S+)\s+@(\S+)(?:\s+-\s*(.*))?\s*$') {
        $deploymentId = $Matches[1]
        $version = $Matches[2]
        if ($version -ieq 'HEAD') {
          continue
        }
        if ($version -notmatch '^\d+$') {
          throw "$SelectedTarget deployment listing contains an unrecognized version."
        }
        $versioned += [pscustomobject]@{ DeploymentId = $deploymentId; Version = $version }
      } elseif ($line.Trim().StartsWith('-')) {
        throw "$SelectedTarget deployment listing contains an unsupported row."
      }
    }
  }

  if ($versioned.Count -ne 1) {
    throw "$SelectedTarget must have exactly one existing versioned production deployment (HEAD is ignored); found $($versioned.Count)."
  }
  return $versioned[0]
}

function Assert-BackendProfile {
  param(
    [Parameter(Mandatory = $true)][string]$BackendPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  $backend = [System.IO.File]::ReadAllText($BackendPath)
  $declarations = [regex]::Matches(
    $backend,
    '(?m)^\s*const\s+DEPLOYED_PROFILE\s*=\s*([''"])([^''"]+)\1\s*;'
  )
  if ($declarations.Count -ne 1 -or
      $declarations[0].Groups[2].Value -cne $SelectedTarget) {
    throw "$SelectedTarget remote backend must contain exactly one fixed DEPLOYED_PROFILE = '$SelectedTarget'."
  }
}

function Assert-ProjectConfig {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$ExpectedScriptId,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  $configPath = Join-Path $ProjectPath '.clasp.json'
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "$SelectedTarget project configuration was not created by clasp clone."
  }
  try {
    $config = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($configPath)) -ErrorAction Stop
  } catch {
    throw "$SelectedTarget cloned project configuration is invalid."
  }
  if ([string]$config.scriptId -cne $ExpectedScriptId) {
    throw "$SelectedTarget cloned project configuration does not match the selected project."
  }
}

function Assert-BackendSyntax {
  param(
    [Parameter(Mandatory = $true)][string]$BackendPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget
  )

  if ($SelectedTarget -eq 'SWE') {
    return
  }
  try {
    $null = & node --check $BackendPath 2>$null
    $code = $LASTEXITCODE
  } catch {
    $code = 1
  }
  if ($code -ne 0) {
    throw "$SelectedTarget backend JavaScript syntax check failed (exit code $code)."
  }
}

function Assert-SalesRepBackend {
  param([Parameter(Mandatory = $true)][string]$BackendPath)

  $backend = [System.IO.File]::ReadAllText($BackendPath)
  $doGet = [regex]::Match($backend, '(?s)\bfunction\s+doGet\s*\([^)]*\)\s*\{.*?\}')
  if (-not $doGet.Success -or
      $doGet.Value -notmatch '\bgetAccessStatus_\s*\(' -or
      $doGet.Value -notmatch '\bcreateAccessDeniedPage_\s*\(' -or
      $backend -notmatch '(?m)\bfunction\s+getAccessStatus_\s*\(' -or
      $backend -notmatch '(?m)\bfunction\s+createAccessDeniedPage_\s*\(' -or
      $backend -notmatch 'HtmlService\.createHtmlOutputFromFile\s*\(\s*[''"]index[''"]\s*\)') {
    throw 'SalesRep remote Code.js must retain its access-checking doGet and access-denied page.'
  }
}

function Assert-Manifest {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)

  try {
    $null = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($ManifestPath)) -ErrorAction Stop
  } catch {
    throw 'The staged appsscript.json manifest is invalid.'
  }
}

function Build-TargetBundle {
  param(
    [Parameter(Mandatory = $true)][string]$SelectedTarget,
    [Parameter(Mandatory = $true)][string]$BuildPath
  )

  $buildArguments = @('build.js')
  if ($SelectedTarget -eq 'SalesRep') {
    $buildArguments += @('--app=sales-rep', "--out=$BuildPath")
  } else {
    $buildArguments += @("--profile=$SelectedTarget", "--out=$BuildPath")
  }
  Invoke-CheckedTool -Name 'node' -Arguments $buildArguments -Purpose "$SelectedTarget bundle build"
  if (-not (Test-Path -LiteralPath $BuildPath -PathType Leaf)) {
    throw "$SelectedTarget bundle build did not produce index.html."
  }

  $html = [System.IO.File]::ReadAllText($BuildPath)
  if ($SelectedTarget -eq 'SalesRep') {
    if ($html -notmatch 'id="sales-rep-app"') {
      throw 'SalesRep bundle does not contain the Sales Rep application.'
    }
  } elseif ($html -notmatch "(?m)const BUILD_PROFILE = `"$SelectedTarget`";") {
    throw "$SelectedTarget bundle has the wrong BUILD_PROFILE."
  }
}

function Assert-PreflightFiles {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$SelectedTarget,
    [Parameter(Mandatory = $true)][string]$BackendName,
    [Parameter(Mandatory = $true)][string[]]$ExpectedFiles
  )

  foreach ($fileName in $ExpectedFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath $fileName) -PathType Leaf)) {
      throw "$SelectedTarget staged project is missing $fileName."
    }
  }
  $backendPath = Join-Path $ProjectPath $BackendName
  $manifestPath = Join-Path $ProjectPath 'appsscript.json'
  Assert-Manifest -ManifestPath $manifestPath
  Assert-BackendSyntax -BackendPath $backendPath -SelectedTarget $SelectedTarget
  if ($SelectedTarget -eq 'SWE' -or $SelectedTarget -eq 'NCE') {
    Assert-BackendProfile -BackendPath $backendPath -SelectedTarget $SelectedTarget
  } else {
    Assert-SalesRepBackend -BackendPath $backendPath
  }
}

function Assert-PulledVersion {
  param(
    [Parameter(Mandatory = $true)]$PreparedProject,
    [Parameter(Mandatory = $true)][string]$VerifyPath,
    [Parameter(Mandatory = $true)][string]$Version
  )

  $projectConfigPath = Join-Path $PreparedProject.ProjectPath '.clasp.json'
  $verifyConfigPath = Join-Path $VerifyPath '.clasp.json'
  if (-not (Test-Path -LiteralPath $projectConfigPath -PathType Leaf)) {
    throw "$($PreparedProject.Target) project configuration is missing for immutable verification."
  }
  Copy-Item -LiteralPath $projectConfigPath -Destination $verifyConfigPath -Force
  Invoke-Clasp -Arguments @('pull', '--versionNumber', $Version) -WorkingDirectory $VerifyPath | Out-Null

  Assert-LocalInventory -ProjectPath $VerifyPath -SelectedTarget $PreparedProject.Target `
    -ExpectedFiles $PreparedProject.ExpectedFiles
  if (-not (Test-Base64FilesEqual -FirstPath $PreparedProject.BuildPath `
      -SecondPath (Join-Path $VerifyPath 'index.html'))) {
    throw "$($PreparedProject.Target) immutable deployed version HTML did not match the intended build."
  }
  if ((Get-Base64File -Path (Join-Path $VerifyPath $PreparedProject.BackendName)) -cne
      $PreparedProject.BackendBase64 -or
      (Get-Base64File -Path (Join-Path $VerifyPath 'appsscript.json')) -cne
      $PreparedProject.ManifestBase64) {
    throw "$($PreparedProject.Target) immutable deployed version changed its backend or manifest."
  }
}

$exitCode = 0
try {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $repositoryPath = $script:RepositoryRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if ($tempRoot.StartsWith($repositoryPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The OS temporary directory is inside the repository; safe deployment staging is unavailable.'
  }
  $script:ScratchRoot = Join-Path $tempRoot (
    'pex-deploy-' + $PID + '-' + [Guid]::NewGuid().ToString('N')
  )
  New-Item -ItemType Directory -Path $script:ScratchRoot -ErrorAction Stop | Out-Null

  Invoke-RepositoryChecks

  $rootConfigPath = Join-Path $script:RepositoryRoot '.clasp.json'
  if (-not (Test-Path -LiteralPath $rootConfigPath -PathType Leaf)) {
    throw 'The root .clasp.json project configuration is missing.'
  }
  try {
    $rootConfig = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($rootConfigPath)) -ErrorAction Stop
  } catch {
    throw 'The root .clasp.json project configuration is invalid.'
  }
  if ([string]::IsNullOrWhiteSpace([string]$rootConfig.scriptId)) {
    throw 'The root .clasp.json project configuration has no script ID.'
  }

  $projects = Get-ProjectList
  $usedScriptIds = @()
  $preparedProjects = @()

  foreach ($selectedTarget in $script:SelectedTargets) {
    $script:CurrentTarget = $selectedTarget
    $project = Resolve-Project -Projects $projects -SelectedTarget $selectedTarget -RootConfig $rootConfig
    if ($usedScriptIds -ccontains $project.ScriptId) {
      throw "$selectedTarget resolved to a project already selected for another target."
    }
    $usedScriptIds += $project.ScriptId

    $projectPath = $script:RepositoryRoot
    if ($selectedTarget -ne 'SWE') {
      $projectPath = Join-Path (Join-Path $script:ScratchRoot 'projects') $selectedTarget
      New-Item -ItemType Directory -Path $projectPath -Force -ErrorAction Stop | Out-Null
      Invoke-Clasp -Arguments @('clone', $project.ScriptId, '--rootDir', '.') `
        -WorkingDirectory $projectPath | Out-Null
    }
    Assert-ProjectConfig -ProjectPath $projectPath -ExpectedScriptId $project.ScriptId `
      -SelectedTarget $selectedTarget

    $buildPath = Join-Path (Join-Path $script:ScratchRoot 'build') (Join-Path $selectedTarget 'index.html')
    New-Item -ItemType Directory -Path (Split-Path -Parent $buildPath) -Force -ErrorAction Stop |
      Out-Null
    Build-TargetBundle -SelectedTarget $selectedTarget -BuildPath $buildPath

    if ($selectedTarget -eq 'SWE') {
      $expectedFiles = @('Code.gs', 'appsscript.json', 'index.html')
      Assert-SweAllowlist -ExpectedFiles $expectedFiles
      if (-not (Test-Base64FilesEqual -FirstPath $buildPath `
          -SecondPath (Join-Path $script:RepositoryRoot 'index.html'))) {
        throw 'The SWE build differs from root index.html after the freshness check.'
      }
    } else {
      $expectedFiles = @('Code.js', 'appsscript.json', 'index.html')
      Assert-LocalInventory -ProjectPath $projectPath -SelectedTarget $selectedTarget `
        -ExpectedFiles $expectedFiles
      Copy-Item -LiteralPath $buildPath -Destination (Join-Path $projectPath 'index.html') -Force
      Assert-LocalInventory -ProjectPath $projectPath -SelectedTarget $selectedTarget `
        -ExpectedFiles $expectedFiles
    }

    $backendName = if ($selectedTarget -eq 'SWE') { 'Code.gs' } else { 'Code.js' }
    Assert-PreflightFiles -ProjectPath $projectPath -SelectedTarget $selectedTarget `
      -BackendName $backendName -ExpectedFiles $expectedFiles
    Assert-StatusInventory -ProjectPath $projectPath -SelectedTarget $selectedTarget `
      -ExpectedFiles $expectedFiles
    $deployment = Get-DeploymentRecord -ProjectPath $projectPath -SelectedTarget $selectedTarget

    $preparedProjects += [pscustomobject]@{
      Target = $selectedTarget
      ProjectPath = $projectPath
      BuildPath = $buildPath
      BackendName = $backendName
      BackendBase64 = Get-Base64File -Path (Join-Path $projectPath $backendName)
      ManifestBase64 = Get-Base64File -Path (Join-Path $projectPath 'appsscript.json')
      ExpectedFiles = $expectedFiles
      DeploymentId = $deployment.DeploymentId
    }
  }

  Write-Host ("Preflight passed for: " + [string]::Join(', ', $script:SelectedTargets) + '.')
  if ($DryRun) {
    Write-Host 'Dry run complete: no push, version creation, or redeploy was performed.'
    exit 0
  }

  if ($Target -eq 'All') {
    $confirmationPhrase = 'DEPLOY ALL'
  } else {
    $confirmationPhrase = 'DEPLOY ' + $Target
  }
  try {
    $confirmation = Read-Host "Type '$confirmationPhrase' to continue"
  } catch {
    throw 'Interactive confirmation is unavailable; no remote changes were made.'
  }
  if ([string]$confirmation -cne $confirmationPhrase) {
    throw 'Confirmation did not match; no remote changes were made.'
  }

  foreach ($preparedProject in $preparedProjects) {
    $script:CurrentTarget = $preparedProject.Target
    Invoke-Clasp -Arguments @('push') -WorkingDirectory $preparedProject.ProjectPath | Out-Null
    $script:PushedTargets.Add($preparedProject.Target)
    $versionOutput = Invoke-Clasp -Arguments @('version', 'PEX automated deployment') `
      -WorkingDirectory $preparedProject.ProjectPath
    if ($versionOutput -notmatch '(?i)\bversion\s+(\d+)\b') {
      throw "$($preparedProject.Target) version creation returned no version number."
    }
    $newVersion = $Matches[1]
    Invoke-Clasp -Arguments @(
      'redeploy',
      $preparedProject.DeploymentId,
      '-V',
      $newVersion,
      '-d',
      'PEX automated deployment'
    ) -WorkingDirectory $preparedProject.ProjectPath | Out-Null
    $script:DeployedTargets.Add($preparedProject.Target)
    $updatedDeployment = Get-DeploymentRecord -ProjectPath $preparedProject.ProjectPath `
      -SelectedTarget $preparedProject.Target
    if ($updatedDeployment.DeploymentId -cne $preparedProject.DeploymentId) {
      throw "$($preparedProject.Target) production deployment ID changed during redeploy."
    }
    if ($updatedDeployment.Version -cne $newVersion) {
      throw "$($preparedProject.Target) production deployment did not move to the new version."
    }

    $verifyPath = Join-Path (Join-Path $script:ScratchRoot 'verify') $preparedProject.Target
    New-Item -ItemType Directory -Path $verifyPath -Force -ErrorAction Stop | Out-Null
    Assert-PulledVersion -PreparedProject $preparedProject -VerifyPath $verifyPath -Version $newVersion
    Write-Host ($preparedProject.Target + ' deployed and verified.')
  }
} catch {
  $exitCode = 1
  $message = $_.Exception.Message
  if ($script:CurrentTarget) {
    if ($script:DeployedTargets.Count -gt 0) {
      $alreadyDeployed = [string]::Join(', ', $script:DeployedTargets.ToArray())
    } else {
      $alreadyDeployed = 'none'
    }
    $pushedButNotDeployed = @($script:PushedTargets | Where-Object {
      $script:DeployedTargets -notcontains $_
    })
    if ($pushedButNotDeployed.Count -gt 0) {
      $pushStatus = [string]::Join(', ', $pushedButNotDeployed)
    } else {
      $pushStatus = 'none'
    }
    [Console]::Error.WriteLine(
      "Deployment failed on $($script:CurrentTarget): $message Already redeployed: $alreadyDeployed. " +
      "Pushed but not redeployed: $pushStatus. " +
      'This release is non-atomic; remaining targets were not attempted.'
    )
  } else {
    [Console]::Error.WriteLine("Deployment failed: $message")
  }
} finally {
  if ($script:ScratchRoot -and (Test-Path -LiteralPath $script:ScratchRoot)) {
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
    $scratchPath = [System.IO.Path]::GetFullPath($script:ScratchRoot)
    $scratchParent = [System.IO.Path]::GetDirectoryName($scratchPath).TrimEnd('\', '/')
    $scratchName = [System.IO.Path]::GetFileName($scratchPath)
    $ownedName = '^pex-deploy-' + $PID + '-[0-9a-f]{32}$'
    if ($scratchParent -ieq $tempRoot -and $scratchName -match $ownedName) {
      try {
        Remove-Item -LiteralPath $scratchPath -Recurse -Force -ErrorAction Stop
      } catch {
        [Console]::Error.WriteLine('Deployment scratch cleanup failed for this invocation.')
        $exitCode = 1
      }
    } else {
      [Console]::Error.WriteLine('Deployment scratch path was not owned by this invocation; it was left untouched.')
      $exitCode = 1
    }
  }
}

exit $exitCode
