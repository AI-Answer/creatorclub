// Creator Compiler identity (Spliced C). Generates macOS Big Sur+ iconset sizes.
import AppKit
import Foundation

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory.appendingPathComponent("icon.iconset"), withIntermediateDirectories: true)

func color(_ hex: Int, alpha: CGFloat = 1) -> NSColor {
  NSColor(
    srgbRed: CGFloat((hex >> 16) & 255) / 255,
    green: CGFloat((hex >> 8) & 255) / 255,
    blue: CGFloat(hex & 255) / 255,
    alpha: alpha
  )
}

func render(_ size: Int, _ output: URL) throws {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.setAllowsAntialiasing(true)
  ctx.setShouldAntialias(true)
  ctx.translateBy(x: 0, y: CGFloat(size))
  ctx.scaleBy(x: CGFloat(size) / 1024, y: -CGFloat(size) / 1024)

  // macOS Big Sur+ icon grid: 824x824 squircle centered at (100, 100) with 185px corner radius
  let tileRect = CGRect(x: 100, y: 100, width: 824, height: 824)
  let tilePath = CGPath(roundedRect: tileRect, cornerWidth: 185, cornerHeight: 185, transform: nil)

  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 24, color: color(0x000000, alpha: 0.24).cgColor)
  ctx.addPath(tilePath)
  ctx.setFillColor(color(0xDE5738).cgColor)
  ctx.fillPath()
  ctx.restoreGState()

  // Map 64x64 mark space into the 824x824 tile
  ctx.saveGState()
  ctx.translateBy(x: 100, y: 100)
  ctx.scaleBy(x: 824.0 / 64.0, y: 824.0 / 64.0)

  let top = CGMutablePath()
  top.move(to: CGPoint(x: 13, y: 21.5))
  top.addArc(center: CGPoint(x: 21.5, y: 21.5), radius: 8.5, startAngle: .pi, endAngle: -.pi / 2, clockwise: false)
  top.addLine(to: CGPoint(x: 47.5, y: 13))
  top.addLine(to: CGPoint(x: 41.5, y: 22.5))
  top.addLine(to: CGPoint(x: 24.5, y: 22.5))
  top.addArc(center: CGPoint(x: 24.5, y: 24.5), radius: 2, startAngle: -.pi / 2, endAngle: .pi, clockwise: true)
  top.addLine(to: CGPoint(x: 22.5, y: 29.75))
  top.addLine(to: CGPoint(x: 13, y: 29.75))
  top.closeSubpath()

  let bottom = CGMutablePath()
  bottom.move(to: CGPoint(x: 16.5, y: 34.25))
  bottom.addLine(to: CGPoint(x: 26, y: 34.25))
  bottom.addLine(to: CGPoint(x: 26, y: 39.5))
  bottom.addArc(center: CGPoint(x: 28, y: 39.5), radius: 2, startAngle: .pi, endAngle: .pi / 2, clockwise: true)
  bottom.addLine(to: CGPoint(x: 51, y: 41.5))
  bottom.addLine(to: CGPoint(x: 45, y: 51))
  bottom.addLine(to: CGPoint(x: 25, y: 51))
  bottom.addArc(center: CGPoint(x: 25, y: 42.5), radius: 8.5, startAngle: .pi / 2, endAngle: .pi, clockwise: false)
  bottom.closeSubpath()

  ctx.setFillColor(color(0xFFF9EE).cgColor)
  ctx.addPath(top)
  ctx.addPath(bottom)
  ctx.fillPath()
  ctx.restoreGState()

  NSGraphicsContext.restoreGraphicsState()
  try rep.representation(using: .png, properties: [:])!.write(to: output)
}

for size in [16, 32, 128, 256, 512] {
  try render(size, directory.appendingPathComponent("icon.iconset/icon_\(size)x\(size).png"))
  try render(size * 2, directory.appendingPathComponent("icon.iconset/icon_\(size)x\(size)@2x.png"))
}
try render(512, directory.appendingPathComponent("creator-compiler-512.png"))
try render(1024, directory.appendingPathComponent("creator-compiler-1024.png"))
