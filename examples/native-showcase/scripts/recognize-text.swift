import Foundation
import Vision

// Read-only host helper. No app instrumentation or synthetic UI metadata.
struct TextBox: Encodable {
  let text: String
  let confidence: Float
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

guard CommandLine.arguments.count == 2 else {
  fatalError("usage: recognize-text screenshot.png")
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = false
request.minimumTextHeight = 0.008
let handler = VNImageRequestHandler(
  url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:])
try handler.perform([request])
let boxes: [TextBox] = (request.results ?? []).compactMap { observation in
  guard let candidate = observation.topCandidates(1).first else { return nil }
  let rect = observation.boundingBox
  return TextBox(text: candidate.string, confidence: candidate.confidence,
    x: Double(rect.minX), y: Double(rect.minY),
    width: Double(rect.width), height: Double(rect.height))
}
FileHandle.standardOutput.write(try JSONEncoder().encode(boxes))
