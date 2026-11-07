; Instalador do Code Room (Inno Setup 6). Gerado por installer\build.ps1 com:
;   ISCC /DAppVersion=0.2.1 /DStageDir=<pasta preparada> /DOutDir=<destino> installer\code-room.iss
; Instala só para o usuário atual (sem administrador) em %LOCALAPPDATA%\Programs\CodeRoom.
; Os dados do usuário ficam em %LOCALAPPDATA%\CodeRoom\data e NÃO são apagados ao desinstalar nem ao atualizar.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #error StageDir não definido
#endif
#ifndef OutDir
  #define OutDir "dist"
#endif

[Setup]
AppId={{6F2D0F5E-3B1A-4C7E-9A52-C0DE600E0001}
AppName=Code Room
AppVersion={#AppVersion}
AppPublisher=Bytelab
AppPublisherURL=https://www.agenciabytelab.com.br
DefaultDirName={localappdata}\Programs\CodeRoom
DefaultGroupName=Code Room
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=Code-Room-{#AppVersion}-Setup
SetupIconFile={#StageDir}\code-room.ico
UninstallDisplayIcon={app}\code-room.ico
LicenseFile={#StageDir}\LICENSE
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern dark
DisableWelcomePage=no
WizardImageFile={#SourcePath}\wizard\lateral-164.bmp,{#SourcePath}\wizard\lateral-246.bmp,{#SourcePath}\wizard\lateral-328.bmp
WizardSmallImageFile={#SourcePath}\wizard\selo-55.bmp,{#SourcePath}\wizard\selo-64.bmp,{#SourcePath}\wizard\selo-110.bmp
WizardImageAlphaFormat=none
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
UsePreviousAppDir=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
brazilianportuguese.SetupWindowTitle=Code Room — Instalação
brazilianportuguese.WelcomeLabel1=Bem-vindo ao Code Room
brazilianportuguese.WelcomeLabel2=Seu espaço para projetos, agentes e ideias.%n%n•  Organize seus projetos%n•  Conecte suas ferramentas%n•  Acompanhe suas tarefas%n%nInstala só para o seu usuário do Windows, sem precisar de administrador. Seus projetos, agentes e a chave de acesso ficam em uma pasta separada e não são apagados ao atualizar nem ao desinstalar.
brazilianportuguese.WizardSelectDir=Prepare seu espaço
brazilianportuguese.SelectDirDesc=Defina onde instalar o Code Room.
brazilianportuguese.WizardSelectTasks=Prepare seu espaço
brazilianportuguese.SelectTasksDesc=Escolha como o Code Room será configurado.
brazilianportuguese.SelectTasksLabel2=Marque o que você quer. Nada roda sozinho com o Windows: o Code Room só abre quando você pedir.
brazilianportuguese.WizardReady=Tudo pronto para instalar
brazilianportuguese.ReadyLabel1=Tudo certo para instalar o Code Room.
brazilianportuguese.ReadyLabel2a=Clique em Instalar para começar ou em Voltar para rever as escolhas.
brazilianportuguese.WizardInstalling=Preparando seu Code Room
brazilianportuguese.InstallingLabel=Isso pode levar alguns instantes. Copiando os arquivos e criando os atalhos…
brazilianportuguese.FinishedHeadingLabel=Seu espaço está pronto
brazilianportuguese.FinishedLabel=O Code Room foi instalado. Ele abre no seu navegador e roda só neste computador.%n%nComo começar: conecte suas ferramentas, crie uma equipe e abra um projeto. A conexão com as IAs é feita dentro do aplicativo, no primeiro acesso.

[Tasks]
Name: "desktopicon"; Description: "Criar um ícone do Code Room na área de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "{#SourcePath}\wizard\progresso.bmp"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autodesktop}\Code Room"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\start.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\code-room.ico"; Comment: "Abrir o Code Room"; Tasks: desktopicon
Name: "{group}\Code Room"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\start.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\code-room.ico"; Comment: "Abrir o Code Room"
Name: "{group}\Fechar o Code Room"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\stop.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\code-room.ico"; Comment: "Fechar o serviço do Code Room"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\start.ps1"""; WorkingDir: "{app}"; Description: "Abrir o Code Room agora"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\stop.ps1"""; Flags: runhidden; RunOnceId: "StopCodeRoom"

[Code]
// Antes de atualizar ou desinstalar, fecha o serviço que estiver rodando desta pasta (não mexe em outros processos).
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Code: Integer;
begin
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{app}\scripts\stop.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;

// Arte da tela de progresso (a pessoa abrindo a caixa), abaixo da barra. Se não couber, fica escondida.
procedure InitializeWizard;
var Img: TBitmapImage; Top, H, W: Integer;
begin
  ExtractTemporaryFile('progresso.bmp');
  Img := TBitmapImage.Create(WizardForm);
  Img.Parent := WizardForm.InstallingPage;
  Img.Bitmap.LoadFromFile(ExpandConstant('{tmp}\progresso.bmp'));
  Img.Stretch := True;
  Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(36);
  H := WizardForm.InstallingPage.ClientHeight - Top - ScaleY(4);
  if H > ScaleY(140) then H := ScaleY(140);
  W := (H * Img.Bitmap.Width) div Img.Bitmap.Height;
  Img.SetBounds((WizardForm.InstallingPage.ClientWidth - W) div 2, Top, W, H);
  Img.Visible := H >= ScaleY(60);
end;
