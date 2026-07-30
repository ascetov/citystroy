param([string]$Root = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)))
# Assembles site pages from _build/shell.html + _build/pages/*.html fragments.
# ASCII-only script; all Cyrillic content lives in the UTF-8 fragment files.
$ErrorActionPreference = 'Stop'

$buildDir = Join-Path $Root '_build'
$pagesDir = Join-Path $buildDir 'pages'
$partsDir = Join-Path $buildDir 'parts'
$outDir   = Join-Path $Root 'site'

$utf8 = New-Object System.Text.UTF8Encoding($false)
$shell = [System.IO.File]::ReadAllText((Join-Path $buildDir 'shell.html'), [System.Text.Encoding]::UTF8)

function Resolve-Includes([string]$text) {
  for ($pass = 0; $pass -lt 4; $pass++) {
    $m = [regex]::Match($text, '@@INCLUDE:([a-z0-9\-]+)@@')
    if (-not $m.Success) { break }
    $text = [regex]::Replace($text, '@@INCLUDE:([a-z0-9\-]+)@@', {
      param($mm)
      $p = Join-Path $partsDir ($mm.Groups[1].Value + '.html')
      if (Test-Path $p) { return [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }
      return ''
    })
  }
  return $text
}

function Get-Meta([string]$text, [string]$key, [string]$fallback) {
  $m = [regex]::Match($text, '<!--' + $key + ':(.*?)-->', 'Singleline')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $fallback
}

$count = 0
Get-ChildItem $pagesDir -Filter *.html | Sort-Object Name | ForEach-Object {
  $raw = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)

  $title = Get-Meta $raw 'TITLE' 'СитиСтрой'
  $desc  = Get-Meta $raw 'DESC'  ''
  $nav   = Get-Meta $raw 'NAV'   ''
  $og    = Get-Meta $raw 'OG'    'assets/img/hero/slider02.jpg'
  $write = Get-Meta $raw 'WRITE' 'contacts.html#zayavka'
  $solid = Get-Meta $raw 'SOLID' ''

  $body = [regex]::Replace($raw, '<!--(TITLE|DESC|NAV|OG|WRITE|SOLID):.*?-->\r?\n?', '', 'Singleline')
  $body = Resolve-Includes $body

  $html = $shell
  $html = $html.Replace('@@BODY@@', $body.TrimEnd())
  $html = $html.Replace('@@TITLE@@', $title)
  $html = $html.Replace('@@DESC@@', $desc)
  $html = $html.Replace('@@NAV@@', $nav)
  $html = $html.Replace('@@OG@@', $og)
  $html = $html.Replace('@@WRITEHREF@@', $write)
  if ($solid -eq '1') { $html = $html.Replace('@@HEADERSOLID@@', ' data-always-solid') }
  else                { $html = $html.Replace('@@HEADERSOLID@@', '') }

  $dest = Join-Path $outDir $_.Name
  [System.IO.File]::WriteAllText($dest, $html, $utf8)
  Write-Output ("built {0} ({1} bytes)" -f $_.Name, $html.Length)
  $count++
}
Write-Output ("TOTAL: {0} pages" -f $count)
