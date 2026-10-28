import Foundation
import Vision
import AppKit

// Input/output are local job files, never shell instructions from the document.
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let paths = try JSONSerialization.jsonObject(with: Data(contentsOf: input)) as! [String]
var output: [[String: Any]] = []
for path in paths {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US", "zh-Hans"]
    request.usesLanguageCorrection = false
    request.usesCPUOnly = true
    request.minimumTextHeight = 0.001
    try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let text = observation.topCandidates(1).first else { return nil }
        let b = observation.boundingBox
        return ["text": text.string, "confidence": text.confidence,
                "box": [b.minX, 1-b.maxY, b.maxX, 1-b.minY]]
    }
    output.append(["file": path, "lines": lines])
}
let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
