import AppKit
import Foundation
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let c = try JSONSerialization.jsonObject(with: data) as! [String: Any]
func n(_ k: String, _ d: Double = 0) -> CGFloat { CGFloat((c[k] as? NSNumber)?.doubleValue ?? d) }
func color(_ value: String?, _ fallback: NSColor) -> NSColor {
 guard let s = value?.replacingOccurrences(of: "#", with: ""), (s.count == 6 || s.count == 8), let v = UInt64(s, radix: 16) else { return fallback }
 let a = s.count == 8 ? CGFloat(v & 255) / 255 : 1
 let rgb = s.count == 8 ? v >> 8 : v
 return NSColor(calibratedRed: CGFloat((rgb >> 16) & 255)/255, green: CGFloat((rgb >> 8) & 255)/255, blue: CGFloat(rgb & 255)/255, alpha: a)
}
let w = Int(n("width")), h = Int(n("height"))
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.current = context
context.cgContext.clear(CGRect(x: 0, y: 0, width: w, height: h))
let transform = AffineTransform(translationByX: 0, byY: CGFloat(h)); var flip = transform; flip.scale(x: 1, y: -1); (flip as NSAffineTransform).concat()
let rect = NSRect(x: n("x")*CGFloat(w), y: n("y")*CGFloat(h), width: n("boxWidth")*CGFloat(w), height: n("boxHeight")*CGFloat(h))
context.cgContext.setAlpha(n("opacity", 1))
if n("rotation") != 0 { context.cgContext.translateBy(x: rect.midX,y: rect.midY); context.cgContext.rotate(by:n("rotation") * .pi/180); context.cgContext.translateBy(x: -rect.midX,y: -rect.midY) }
let fg=color(c["color"] as? String,.white),bg=color(c["background"] as? String,.clear),kind=c["type"] as? String ?? "text"
if kind == "mask" { NSColor.white.setFill();NSBezierPath(roundedRect:rect,xRadius:n("radius"),yRadius:n("radius")).fill()
} else if kind == "text" {
 let para=NSMutableParagraphStyle();para.alignment = .center;para.lineBreakMode = .byWordWrapping
 let font=NSFont.systemFont(ofSize:max(6,n("fontSize",48)),weight:.semibold)
 let text = NSAttributedString(string:c["text"] as? String ?? "",attributes:[.font:font,.foregroundColor:fg,.paragraphStyle:para])
 let lineHeight=NSLayoutManager().defaultLineHeight(for:font)
 // Padding yields to one full line in short boxes rather than consuming the glyph area.
 let paddingX=min(12,min(font.pointSize*0.3,max(0,rect.width*0.08)))
 let paddingY=min(10,min(font.pointSize*0.2,max(0,(rect.height-lineHeight)/2)))
 let size=text.boundingRect(with:NSSize(width:max(1,rect.width-paddingX*2),height:CGFloat.greatestFiniteMagnitude),options:[.usesLineFragmentOrigin,.usesFontLeading]).size
 let boxHeight=min(rect.height,ceil(size.height)+paddingY*2)
 let box=NSRect(x:rect.minX,y:rect.midY-boxHeight/2,width:rect.width,height:boxHeight)
 bg.setFill();NSBezierPath(roundedRect:box,xRadius:10,yRadius:10).fill()
 // AppKit text draws correctly in an explicitly flipped graphics context.
 let cg = context.cgContext;cg.saveGState();cg.translateBy(x:0,y:box.minY*2+box.height);cg.scaleBy(x:1,y:-1)
 text.draw(with:NSRect(x:box.minX+paddingX,y:box.minY+paddingY,width:max(1,box.width-paddingX*2),height:max(1,box.height-paddingY*2)),options:[.usesLineFragmentOrigin,.usesFontLeading]);cg.restoreGState()
} else if kind == "cursor" { bg.setFill();NSBezierPath(ovalIn:NSRect(x:0,y:0,width:CGFloat(w)*0.65,height:CGFloat(h)*0.65)).fill();let p=NSBezierPath();p.move(to:NSPoint(x:1,y:1));p.line(to:NSPoint(x:CGFloat(w)*0.15,y:CGFloat(h)*0.64));p.line(to:NSPoint(x:CGFloat(w)*0.28,y:CGFloat(h)*0.45));p.line(to:NSPoint(x:CGFloat(w)*0.47,y:CGFloat(h)*0.43));p.close();NSColor.black.setStroke();p.lineWidth=2;p.stroke();fg.setFill();p.fill()
// Rectangle, ellipse and highlight: the background fills the box and the colour outlines it on the inside, as the preview's CSS border
// draws them (src/Stage.tsx). strokeWidth and radius arrive in output pixels.
} else if kind == "ellipse" { let lw=n("strokeWidth",3);bg.setFill();NSBezierPath(ovalIn:rect).fill();fg.setStroke();let p=NSBezierPath(ovalIn:rect.insetBy(dx:lw/2,dy:lw/2));p.lineWidth=lw;p.stroke()
} else if kind == "rectangle" { let lw=n("strokeWidth",3);bg.setFill();NSBezierPath(rect:rect).fill();fg.setStroke();let p=NSBezierPath(rect:rect.insetBy(dx:lw/2,dy:lw/2));p.lineWidth=lw;p.stroke()
} else if kind == "arrow" {
 // The preview's arrow: in a 100x40 box stretched to the element, a shaft from (2,20) to (90,20) and a head (72,4)-(94,20)-(72,36), 4 units thick.
 let sx=rect.width/100,sy=rect.height/40;let px={(x:CGFloat,y:CGFloat) in NSPoint(x:rect.minX+x*sx,y:rect.minY+y*sy)}
 fg.setStroke();let p=NSBezierPath();p.lineWidth=max(1,4*sy);p.move(to:px(2,20));p.line(to:px(90,20));p.move(to:px(72,4));p.line(to:px(94,20));p.line(to:px(72,36));p.stroke()
} else if kind == "highlight" { let lw=n("strokeWidth",4),r=n("radius",8);bg.setFill();NSBezierPath(roundedRect:rect,xRadius:r,yRadius:r).fill();fg.setStroke();let p=NSBezierPath(roundedRect:rect.insetBy(dx:lw/2,dy:lw/2),xRadius:max(0,r-lw/2),yRadius:max(0,r-lw/2));p.lineWidth=lw;p.stroke()
} else { fg.setFill();NSBezierPath(roundedRect:rect,xRadius:8,yRadius:8).fill() }
context.flushGraphics();NSGraphicsContext.restoreGraphicsState()
let png=bitmap.representation(using:.png,properties:[:])!
try png.write(to:URL(fileURLWithPath:c["output"] as! String))
