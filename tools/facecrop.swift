// Находит самое крупное лицо (Vision) и сохраняет квадрат вокруг него с запасом под волосы. swift facecrop.swift in out.jpg
import Foundation
import Vision
import CoreImage
let a = CommandLine.arguments
guard let src = CIImage(contentsOf: URL(fileURLWithPath: a[1]), options: [.applyOrientationProperty: true]) else { fatalError("не прочитал") }
let r = VNDetectFaceRectanglesRequest()
try VNImageRequestHandler(ciImage: src).perform([r])
guard let f = r.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else { fatalError("лица нет: \(a[1])") }
let W = src.extent.width, H = src.extent.height, b = f.boundingBox
let side = max(b.width * W, b.height * H) * 2.1
let cx = b.midX * W, cy = b.midY * H + b.height * H * 0.18 // чуть выше центра лица: в кадр попадают волосы
let rect = CGRect(x: cx - side / 2, y: cy - side / 2, width: side, height: side).intersection(src.extent)
try CIContext().writeJPEGRepresentation(of: src.cropped(to: rect), to: URL(fileURLWithPath: a[2]), colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [:])
print(Int(rect.width))
