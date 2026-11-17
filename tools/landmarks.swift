// Точки лица (Vision) в пикселях картинки, начало слева сверху. swift landmarks.swift img > pts.json
import Foundation
import Vision
import CoreImage
let path = CommandLine.arguments[1]
guard let src = CIImage(contentsOf: URL(fileURLWithPath: path), options: [.applyOrientationProperty: true]) else { fatalError("не прочитал") }
let r = VNDetectFaceLandmarksRequest()
try VNImageRequestHandler(ciImage: src).perform([r])
guard let f = r.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }), let lm = f.landmarks else { fatalError("лица нет") }
let size = CGSize(width: src.extent.width, height: src.extent.height)
func pts(_ g: VNFaceLandmarkRegion2D?) -> [[Double]] { (g?.pointsInImage(imageSize: size) ?? []).map { [Double($0.x), Double(size.height - $0.y)] } }
let out: [String: [[Double]]] = ["leftEye": pts(lm.leftEye), "rightEye": pts(lm.rightEye), "leftBrow": pts(lm.leftEyebrow), "rightBrow": pts(lm.rightEyebrow), "nose": pts(lm.nose), "lips": pts(lm.outerLips), "contour": pts(lm.faceContour), "leftPupil": pts(lm.leftPupil), "rightPupil": pts(lm.rightPupil)]
print(String(data: try JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
