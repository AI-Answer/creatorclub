import Foundation
import CoreGraphics
import Darwin

// Window metadata uses global top-left coordinates and needs no capture permission.
FileHandle.standardInput.readabilityHandler = { input in
 if input.availableData.isEmpty { exit(0) }
}
while true {
 var result: [String: Any] = ["found": false]
 if let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
  for window in windows {
   guard let owner = window[kCGWindowOwnerName as String] as? String,
    ["System Settings", "System Preferences"].contains(owner),
    (window[kCGWindowLayer as String] as? Int) == 0,
    let bounds = window[kCGWindowBounds as String] as? [String: Any],
    let x = bounds["X"] as? Double, let y = bounds["Y"] as? Double,
    let width = bounds["Width"] as? Double, let height = bounds["Height"] as? Double,
    width > 0, height > 0 else { continue }
   result = ["found": true, "x": x, "y": y, "width": width, "height": height]
   break // CGWindowList is ordered from front to back.
  }
 }
 if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), let line = String(data: data, encoding: .utf8) {
  print(line)
  fflush(stdout)
 }
 usleep(200_000)
}
