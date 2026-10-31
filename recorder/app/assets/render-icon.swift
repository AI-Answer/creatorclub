// Original Creator Compiler identity. Generates standard macOS iconset sizes.
import AppKit
import Foundation
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory.appendingPathComponent("icon.iconset"), withIntermediateDirectories: true)
func color(_ hex: Int) -> NSColor { NSColor(srgbRed: CGFloat((hex >> 16) & 255)/255, green: CGFloat((hex >> 8)&255)/255, blue: CGFloat(hex&255)/255, alpha: 1) }
func render(_ size: Int, _ output: URL) throws {
 let image = NSImage(size: NSSize(width:size,height:size))
 image.lockFocus()
 let ctx = NSGraphicsContext.current!.cgContext
 ctx.translateBy(x:0,y:CGFloat(size));ctx.scaleBy(x:CGFloat(size)/1024,y:-CGFloat(size)/1024)
 ctx.scaleBy(x:16,y:16)
 ctx.setFillColor(color(0xDE5738).cgColor)
 ctx.addPath(CGPath(roundedRect:CGRect(x:1,y:1,width:62,height:62),cornerWidth:17,cornerHeight:17,transform:nil));ctx.fillPath()
 let c=CGMutablePath();c.move(to:CGPoint(x:41,y:18));c.addLine(to:CGPoint(x:29,y:18));c.addCurve(to:CGPoint(x:16,y:32),control1:CGPoint(x:20,y:18),control2:CGPoint(x:16,y:24));c.addCurve(to:CGPoint(x:29,y:46),control1:CGPoint(x:16,y:40),control2:CGPoint(x:20,y:46));c.addLine(to:CGPoint(x:41,y:46))
 ctx.addPath(c);ctx.setStrokeColor(color(0xFFF9EE).cgColor);ctx.setLineWidth(6);ctx.setLineCap(.square);ctx.strokePath()
 let play=CGMutablePath();play.move(to:CGPoint(x:33,y:24));play.addLine(to:CGPoint(x:47,y:32));play.addLine(to:CGPoint(x:33,y:40));play.closeSubpath();ctx.addPath(play);ctx.setFillColor(color(0xFFF9EE).cgColor);ctx.fillPath()
 image.unlockFocus()
 let source=NSBitmapImageRep(data:image.tiffRepresentation!)!
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 source.draw(in:NSRect(x:0,y:0,width:size,height:size));NSGraphicsContext.restoreGraphicsState()
 try rep.representation(using:.png,properties:[:])!.write(to:output)
}
for size in [16,32,128,256,512] {
 try render(size,directory.appendingPathComponent("icon.iconset/icon_\(size)x\(size).png"))
 try render(size*2,directory.appendingPathComponent("icon.iconset/icon_\(size)x\(size)@2x.png"))
}
try render(512,directory.appendingPathComponent("creator-compiler-512.png"))
try render(1024,directory.appendingPathComponent("creator-compiler-1024.png"))
