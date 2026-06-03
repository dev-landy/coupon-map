import AppKit
import Foundation
import Vision

struct OcrText: Encodable {
  let text: String
  let x: Double
  let y: Double
  let width: Double
  let height: Double
  let confidence: Float
}

guard CommandLine.arguments.count == 2 else {
  fputs("usage: ocr-image-text.swift <image-path>\n", stderr)
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
  let image = NSImage(contentsOf: imageURL),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fputs("could not read image: \(imageURL.path)\n", stderr)
  exit(1)
}

var recognized: [OcrText] = []
let request = VNRecognizeTextRequest { request, error in
  if let error {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
  }

  let observations = request.results as? [VNRecognizedTextObservation] ?? []
  recognized = observations.compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else {
      return nil
    }

    let box = observation.boundingBox
    return OcrText(
      text: candidate.string,
      x: box.minX,
      y: 1.0 - box.maxY,
      width: box.width,
      height: box.height,
      confidence: candidate.confidence
    )
  }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let preferredLanguages = ["ko-KR", "en-US"]
if let supportedLanguages = try? request.supportedRecognitionLanguages() {
  let languages = preferredLanguages.filter { supportedLanguages.contains($0) }
  if !languages.isEmpty {
    request.recognitionLanguages = languages
  }
}

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
} catch {
  fputs("\(error.localizedDescription)\n", stderr)
  exit(1)
}

recognized.sort { left, right in
  if abs(left.y - right.y) > 0.01 {
    return left.y < right.y
  }
  return left.x < right.x
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted]
let data = try encoder.encode(recognized)
FileHandle.standardOutput.write(data)
