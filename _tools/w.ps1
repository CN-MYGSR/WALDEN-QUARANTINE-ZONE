param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Root,[string]$Content,[int]$From=0,[int]$To=0,[switch]$Append)
$full=[IO.Path]::GetFullPath($Path)
$rp=[IO.Path]::GetFullPath($Root)
if(-not $full.StartsWith($rp,[StringComparison]::OrdinalIgnoreCase)){ throw ([string][char]79+[string][char]85+[string][char]84+[string][char]58+$full) }
$pq=([string][char]126)+([string][char]81)+([string][char]126)
$psq=([string][char]126)+([string][char]83)+([string][char]126)
$Content=$Content.Replace($pq,[string][char]34)
$Content=$Content.Replace($psq,[string][char]39)
$nl=[string][char]10
$enc=New-Object System.Text.UTF8Encoding($false)
if($From -gt 0){
  $txt=[IO.File]::ReadAllText($full,[Text.Encoding]::UTF8).Replace(([string][char]13+$nl),$nl)
  $arr=$txt.Split($nl)
  $head=@(); if($From -gt 1){ $head=$arr[0..($From-2)] }
  $tail=@(); if($To -lt $arr.Length){ $tail=$arr[$To..($arr.Length-1)] }
  $mid=@(); if($Content.Length -gt 0){ $mid=$Content.Split($nl) }
  [IO.File]::WriteAllText($full,(@($head+$mid+$tail) -join $nl),$enc)
} else {
  if($Append){ [IO.File]::AppendAllText($full,$Content,$enc) } else { [IO.File]::WriteAllText($full,$Content,$enc) }
}
$n=([IO.File]::ReadAllText($full,[Text.Encoding]::UTF8)).Split($nl).Length
Write-Output ([string][char]79+[string][char]75+[string][char]32+$full+[string][char]32+[string][char]76+$n)