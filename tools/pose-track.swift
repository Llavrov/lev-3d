// Суставы тела по кадрам (Vision): одним инструментом и видео Лёвы, и кадры игры — чтобы сравнивать движение, а не позы.
//   swift tools/pose-track.swift <папка с PNG/JPG | файлы...> > track.json
// На кадр: 2D-точки в пикселях (начало слева сверху, c — уверенность) и 3D-точки в метрах от таза (Vision 3D, macOS 14+;
// оси привязаны к тазу: x — линия бёдер к левому, поэтому ещё camUp — вертикаль камеры в тех же осях). Человек — самый крупный.
import Foundation
import Vision
import CoreImage

var files: [String] = []
for a in CommandLine.arguments.dropFirst() {
  var dir: ObjCBool = false
  if FileManager.default.fileExists(atPath: a, isDirectory: &dir), dir.boolValue {
    let items = (try? FileManager.default.contentsOfDirectory(atPath: a)) ?? []
    files += items.filter { $0.lowercased().hasSuffix(".png") || $0.lowercased().hasSuffix(".jpg") }.sorted().map { a + "/" + $0 }
  } else { files.append(a) }
}

let names2D: [(String, VNHumanBodyPoseObservation.JointName)] = [
  ("nose", .nose), ("neck", .neck), ("root", .root),
  ("lSh", .leftShoulder), ("rSh", .rightShoulder), ("lEl", .leftElbow), ("rEl", .rightElbow), ("lWr", .leftWrist), ("rWr", .rightWrist),
  ("lHip", .leftHip), ("rHip", .rightHip), ("lKn", .leftKnee), ("rKn", .rightKnee), ("lAn", .leftAnkle), ("rAn", .rightAnkle)]
let names3D: [(String, VNHumanBodyPose3DObservation.JointName)] = [
  ("head", .centerHead), ("neck", .centerShoulder), ("spine", .spine), ("root", .root),
  ("lSh", .leftShoulder), ("rSh", .rightShoulder), ("lEl", .leftElbow), ("rEl", .rightElbow), ("lWr", .leftWrist), ("rWr", .rightWrist),
  ("lHip", .leftHip), ("rHip", .rightHip), ("lKn", .leftKnee), ("rKn", .rightKnee), ("lAn", .leftAnkle), ("rAn", .rightAnkle)]

var out: [[String: Any]] = []
for path in files {
  guard let img = CIImage(contentsOf: URL(fileURLWithPath: path)) else { continue }
  let W = img.extent.width, H = img.extent.height
  var rec: [String: Any] = ["file": (path as NSString).lastPathComponent, "w": W, "h": H]
  let r2 = VNDetectHumanBodyPoseRequest(), r3 = VNDetectHumanBodyPose3DRequest()
  try? VNImageRequestHandler(ciImage: img).perform([r2, r3])
  // Самый крупный человек: по размаху точек.
  let area = { (o: VNHumanBodyPoseObservation) -> CGFloat in
    let p = ((try? o.recognizedPoints(.all)) ?? [:]).values.filter { $0.confidence > 0.2 }
    guard let x0 = p.map({ $0.x }).min(), let x1 = p.map({ $0.x }).max(), let y0 = p.map({ $0.y }).min(), let y1 = p.map({ $0.y }).max() else { return 0 }
    return (x1 - x0) * (y1 - y0)
  }
  if let o = r2.results?.max(by: { area($0) < area($1) }) {
    var j: [String: [Double]] = [:]
    for (k, n) in names2D { if let p = try? o.recognizedPoint(n), p.confidence > 0 { j[k] = [Double(p.x * W), Double((1 - p.y) * H), Double(p.confidence)] } }
    rec["j2"] = j
  }
  if let o = r3.results?.first {
    var j: [String: [Double]] = [:]
    for (k, n) in names3D { if let p = try? o.recognizedPoint(n) { let c = p.position.columns.3; j[k] = [Double(c.x), Double(c.y), Double(c.z)] } }
    rec["j3"] = j
    rec["height"] = Double(o.bodyHeight)
    // Оси 3D-точек привязаны к тазу (x — линия бёдер), поэтому вертикаль берём у камеры: её «вверх» в этих осях.
    let m = o.cameraOriginMatrix
    rec["camUp"] = [Double(m.columns.1.x), Double(m.columns.1.y), Double(m.columns.1.z)]
    rec["camX"] = [Double(m.columns.0.x), Double(m.columns.0.y), Double(m.columns.0.z)]
    rec["camPos"] = [Double(m.columns.3.x), Double(m.columns.3.y), Double(m.columns.3.z)]
  }
  out.append(rec)
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: out))
