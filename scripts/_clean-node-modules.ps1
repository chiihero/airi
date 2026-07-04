# NOTICE: 一次性清理脚本，用于删除 AIRI 仓库中所有 node_modules 目录。
# 仅删除名为 node_modules 的目录，并校验路径位于仓库根目录之内。
# 使用 Get-ChildItem -Directory -Recurse 查找，再用 Remove-Item 删除。
# 删除顺序：先深后浅，避免父目录删除时报子项不存在的竞态。
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath 'D:/Projects/MultiProjects/AIRI').Path
Write-Host "扫描根目录: $root"

# 先收集所有 node_modules 目录，避免在枚举过程中删除导致迭代异常
$targets = Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'node_modules' }

# 过滤掉任何不在 root 下的路径（防止符号链接跳出仓库）
$safe = $targets | Where-Object {
  $_.FullName -like "$root\*" -and
  $_.FullName -notlike "$root\node_modules\*"
}

Write-Host "发现 node_modules 目录数: $($safe.Count)"

# 路径深度降序排序：先删深层（嵌套）再删浅层
$sorted = $safe | Sort-Object { ($_.FullName -split '[\\/]').Length } -Descending

$count = 0
$total = $sorted.Count
foreach ($dir in $sorted) {
  $count++
  $rel = $dir.FullName.Substring($root.Length)
  Write-Host ("[{0}/{1}] 删除 {2}" -f $count, $total, $rel)
  try {
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction Stop
  } catch {
    # NOTICE: 某些文件可能因只读属性或权限问题首次失败，二次尝试清理
    Write-Warning "首次删除失败: $rel - $($_.Exception.Message)"
    try {
      # 强制重置属性后重试
      Get-ChildItem -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Attributes = 'Normal' }
      Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction Stop
      Write-Host "  -> 重试成功"
    } catch {
      Write-Error "  -> 删除最终失败: $rel - $($_.Exception.Message)"
    }
  }
}

Write-Host "清理完成，剩余 node_modules 数量检查:"
$remaining = Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'node_modules' }
Write-Host "剩余: $($remaining.Count)"
