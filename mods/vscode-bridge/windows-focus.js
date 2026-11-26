// Prepare window activation while Code.exe forwards the open request.
export const prepareWindowsFocus = String.raw`
$focusProcess = @()
$originWindow = [IntPtr]::Zero
try {
  $focusProcess = @(Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $exe -and $_.MainWindowHandle -ne [IntPtr]::Zero
  })
  if ($focusProcess.Count -eq 1) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class VscodeBridgeFocus
{
    private delegate bool WindowCallback(IntPtr window, IntPtr unused);

    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(uint processId);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr unused);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int size);

    public static uint Owner(IntPtr window)
    {
        uint processId;
        GetWindowThreadProcessId(window, out processId);
        return processId;
    }

    // Return visible editor windows with the requested filename in the title.
    public static IntPtr[] FindFileWindows(uint processId, string filename)
    {
        var matches = new List<IntPtr>();
        var title = new StringBuilder(2048);
        EnumWindows(delegate (IntPtr window, IntPtr unused) {
            if (IsWindowVisible(window) && Owner(window) == processId &&
                GetWindowText(window, title, title.Capacity) > 0 &&
                title.ToString().TrimStart('\u25cf', ' ').StartsWith(filename + " - ", StringComparison.OrdinalIgnoreCase))
                matches.Add(window);
            return true;
        }, IntPtr.Zero);
        return matches.ToArray();
    }

    // Restore the window and make it visible even if Windows keeps keyboard focus in Herdr.
    public static void Activate(IntPtr window, IntPtr origin)
    {
        if (GetForegroundWindow() != origin) return;
        const int Restore = 9;
        if (IsIconic(window)) ShowWindowAsync(window, Restore);
        if (SetForegroundWindow(window) || GetForegroundWindow() != origin) return;

        const int ExtendedStyle = -20;
        const int TopmostStyle = 0x00000008;
        const uint NoSizeMoveOrActivation = 0x0001 | 0x0002 | 0x0010;
        if ((GetWindowLong(window, ExtendedStyle) & TopmostStyle) != 0) return;
        // Raise it above Herdr, then immediately return it to the ordinary Z order.
        var topmost = new IntPtr(-1);
        var notTopmost = new IntPtr(-2);
        if (SetWindowPos(window, topmost, 0, 0, 0, 0, NoSizeMoveOrActivation))
            SetWindowPos(window, notTopmost, 0, 0, 0, 0, NoSizeMoveOrActivation);
    }
}
'@
    $activeWindow = [VscodeBridgeFocus]::GetForegroundWindow()
    $activeOwner = Get-Process -Id ([VscodeBridgeFocus]::Owner($activeWindow)) -ErrorAction SilentlyContinue
    if ($activeOwner.ProcessName -eq 'herdr-app') { $originWindow = $activeWindow }
    [void][VscodeBridgeFocus]::AllowSetForegroundWindow($focusProcess[0].Id)
  }
} catch {
  # Opening the file still works when Windows won't allow foreground access.
}
`;

// Let VS Code route the file first. Act only if Herdr is still in front and
// the expected filename identifies one unambiguous window.
export const finishWindowsFocus = String.raw`
if ($originWindow -ne [IntPtr]::Zero) {
  try {
    $leaf = ($openUri -split '/')[-1] -replace ':\d+(?::\d+)?$', ''
    $filename = [Uri]::UnescapeDataString($leaf)
    $deadline = [DateTime]::UtcNow.AddMilliseconds(1400)
    do {
      if ([VscodeBridgeFocus]::GetForegroundWindow() -ne $originWindow) { break }
      # Let the request reach VS Code before matching titles already on screen.
      if ($launchedCode.HasExited -or [DateTime]::UtcNow -ge $handoffDeadline) {
        $fileWindows = @([VscodeBridgeFocus]::FindFileWindows($focusProcess[0].Id, $filename))
        if ($fileWindows.Count -eq 1) {
          [VscodeBridgeFocus]::Activate($fileWindows[0], $originWindow)
          break
        }
      }
      Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $deadline)
  } catch {
    # An activation failure must not affect the file open.
  }
}
`;
