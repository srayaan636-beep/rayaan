$asar      = "E:\Software\Node.js\ClearScope_Pro_Setup_14.0.0\clearscope-pro-dev\node_modules\@electron\asar\bin\asar.js"
$asarFile  = "C:\Users\hI\Desktop\CloudifyOutput\win-unpacked\resources\app.asar"
$extractDir = "C:\Users\hI\AppData\Local\Temp\cloudify-extract"
$srcDir    = "E:\Software\Node.js\ClearScope_Pro_Setup_14.0.0\clearscope-pro-dev"

Write-Host "Copying updated files..."
Copy-Item "$srcDir\main.js"     "$extractDir\main.js"     -Force
Copy-Item "$srcDir\renderer.js" "$extractDir\renderer.js" -Force
Copy-Item "$srcDir\index.html"  "$extractDir\index.html"  -Force

Write-Host "Repacking asar..."
& node $asar pack $extractDir $asarFile

Write-Host "Done: $([math]::Round((Get-Item $asarFile).Length/1MB,1)) MB"
