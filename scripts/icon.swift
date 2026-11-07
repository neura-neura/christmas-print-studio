import AppKit
import CoreText
let root=CommandLine.arguments[1]
let directory=URL(fileURLWithPath:root).appendingPathComponent("build/Esferas.iconset")
try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
let fontURL=URL(fileURLWithPath:root).appendingPathComponent("Resources/Cream Cake Bold.otf")
CTFontManagerRegisterFontsForURL(fontURL as CFURL,.process,nil)
for size in [16,32,128,256,512] {
    for factor in [1,2] {
        let pixels=size*factor
        let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
        NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
        let s=CGFloat(pixels)/1024
        let transform=NSAffineTransform();transform.scale(by:s);transform.concat()
        NSColor(calibratedRed:0.66,green:0.14,blue:0.19,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:50,y:50,width:924,height:924),xRadius:210,yRadius:210).fill()
        NSColor(calibratedRed:1,green:0.96,blue:0.87,alpha:1).setStroke()
        let ring=NSBezierPath(ovalIn:NSRect(x:209,y:180,width:606,height:606));ring.lineWidth=40;ring.stroke()
        let loop=NSBezierPath(ovalIn:NSRect(x:472,y:780,width:80,height:80));loop.lineWidth=23;loop.stroke()
        let attributes:[NSAttributedString.Key:Any]=[.font:NSFont(name:"CreamCakeBold-PersonalUse",size:420) ?? NSFont(name:"Georgia-Italic",size:420)!, .foregroundColor:NSColor(calibratedRed:1,green:0.96,blue:0.87,alpha:1)]
        let str="L" as NSString;let sizeText=str.size(withAttributes:attributes);str.draw(at:NSPoint(x:512-sizeText.width/2,y:270),withAttributes:attributes)
        NSGraphicsContext.restoreGraphicsState()
        let name="icon_\(size)x\(size)\(factor==2 ? "@2x" : "").png"
        try rep.representation(using:.png,properties:[:])!.write(to:directory.appendingPathComponent(name))
    }
}
